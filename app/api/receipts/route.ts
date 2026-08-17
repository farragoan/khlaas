import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items } from "@/lib/db/schema";
import { ProcessReceiptSchema } from "@/lib/schemas";
import { verifyHost } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// flash-lite over flash: same vision quality on receipts, and thinking is off by
// default here whereas gemini-2.5-flash reasons before every answer — a latency
// tax we pay on each scan for no gain on a fixed extraction task.
const GOOGLE_AI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

interface OcrItem {
  name: string;
  quantity: number;
  unit_price: number;
}

interface OcrResult {
  not_a_receipt?: boolean;
  items: OcrItem[];
  tax: number | null;
  service_charge: number | null;
  other_fees: { name: string; amount: number }[];
  total: number | null;
}

// The response shape is enforced by OCR_RESPONSE_SCHEMA below, so the prompt only
// has to cover the judgement calls a schema can't express.
const OCR_PROMPT = `Extract every line item from this receipt image.

If the image is not a receipt, bill, or invoice, set not_a_receipt to true and leave every other field empty. Otherwise set it to false.

Report unit_price as the price of a single unit, not the line total. Use null for any total, tax, or service charge that is not printed on the receipt.`;

/**
 * Gemini's OpenAPI-subset schema. Constraining the output does double duty: it
 * guarantees parseable JSON, and it stops the model spending tokens on prose or
 * code fences we would only throw away.
 */
const OCR_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    not_a_receipt: { type: "BOOLEAN" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit_price: { type: "NUMBER" },
        },
        required: ["name", "quantity", "unit_price"],
      },
    },
    tax: { type: "NUMBER", nullable: true },
    service_charge: { type: "NUMBER", nullable: true },
    other_fees: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, amount: { type: "NUMBER" } },
        required: ["name", "amount"],
      },
    },
    total: { type: "NUMBER", nullable: true },
  },
  required: ["not_a_receipt", "items", "tax", "service_charge", "other_fees", "total"],
} as const;

function parseOcrJson(content: string): OcrResult {
  const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in OCR response");
  return JSON.parse(jsonMatch[0]) as OcrResult;
}

// Two quick retries, not three slow ones: the old 500ms base spent 3.5s asleep
// before surfacing a failure, which read to users as a hang rather than an error.
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = 200): Promise<T> {
  let lastError: Error = new Error("Unknown error");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

async function extractViaOpenRouter(imageBase64: string): Promise<OcrResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemma-3-27b-it:free",
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      }],
    }),
  });

  if (!response.ok) { const error = await response.text(); throw new Error(`OpenRouter error: ${error}`); }
  const data = await response.json();
  return parseOcrJson(data.choices[0].message.content as string);
}

async function extractViaGoogleAI(imageBase64: string): Promise<OcrResult> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_API_KEY is not set");

  return withRetry(async () => {
    const response = await fetch(`${GOOGLE_AI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: OCR_PROMPT }, { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: OCR_RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) { const error = await response.text(); throw new Error(`Google AI error: ${error}`); }
    const data = await response.json();
    const content: string = data.candidates[0].content.parts[0].text;
    return parseOcrJson(content);
  });
}

async function extractReceiptItems(imageBase64: string): Promise<OcrResult> {
  if (process.env.USE_OPENROUTER === "true") return extractViaOpenRouter(imageBase64);
  console.log("Using Google!");
  return extractViaGoogleAI(imageBase64);
}

export async function POST(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) return NextResponse.json({ error: "Missing session token" }, { status: 401 });

  const body = await req.json();
  const parsed = ProcessReceiptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tableId, imageBase64 } = parsed.data;

  let table: { id: string; status: string } | undefined;
  try {
    [table] = await db.select({ id: splitTables.id, status: splitTables.status }).from(splitTables).where(eq(splitTables.id, tableId)).limit(1);
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (table.status !== "active") return NextResponse.json({ error: "Receipt already processed" }, { status: 409 });

  const { userId } = await auth();
  const host = await verifyHost(tableId, { sessionToken, clerkUserId: userId });
  if (!host) return NextResponse.json({ error: "Only the host can scan a receipt" }, { status: 403 });

  let ocr: OcrResult;
  try { ocr = await extractReceiptItems(imageBase64); }
  catch { return NextResponse.json({ error: "Failed to process the image. Please try again." }, { status: 502 }); }

  if (ocr.not_a_receipt) return NextResponse.json({ error: "That doesn't look like a receipt. Please upload a clear photo of a bill." }, { status: 422 });
  if (ocr.items.length === 0) return NextResponse.json({ error: "Couldn't find any items on this receipt. Please try a clearer photo." }, { status: 422 });

  const itemRows = ocr.items.map((item, i) => ({
    tableId, name: item.name, unitPrice: String(item.unit_price), quantity: item.quantity || 1, sortOrder: i, isFee: false,
  }));

  if (ocr.tax && ocr.tax > 0) itemRows.push({ tableId, name: "Tax", unitPrice: String(ocr.tax), quantity: 1, sortOrder: 1000, isFee: true });
  if (ocr.service_charge && ocr.service_charge > 0) itemRows.push({ tableId, name: "Service Charge", unitPrice: String(ocr.service_charge), quantity: 1, sortOrder: 1001, isFee: true });
  for (const fee of ocr.other_fees ?? []) {
    if (fee.amount > 0) itemRows.push({ tableId, name: fee.name, unitPrice: String(fee.amount), quantity: 1, sortOrder: 1002, isFee: true });
  }

  try {
    await db.insert(items).values(itemRows);
    await db.update(splitTables).set({ status: "items_ready" }).where(eq(splitTables.id, tableId));
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ ok: true, itemCount: itemRows.length });
}
