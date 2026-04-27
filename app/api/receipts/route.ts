import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items } from "@/lib/db/schema";
import { ProcessReceiptSchema } from "@/lib/schemas";
import { verifyHostSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const GOOGLE_AI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

const OCR_PROMPT = `You are a receipt OCR assistant. Extract all line items from this receipt image.

IMPORTANT: Your entire response must be a single valid JSON object with no other text, no markdown, no code fences, no explanation.

If the image is NOT a receipt, bill, or invoice, return exactly:
{"not_a_receipt":true,"items":[],"tax":null,"service_charge":null,"other_fees":[],"total":null}

If it IS a receipt, return exactly this structure (use null for missing numeric fields, empty array for missing arrays):
{"items":[{"name":"Item Name","quantity":1,"unit_price":9.99}],"tax":1.50,"service_charge":null,"other_fees":[{"name":"Delivery","amount":2.00}],"total":13.49}`;

function parseOcrJson(content: string): OcrResult {
  // Strip markdown code fences if present
  const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in OCR response");
  return JSON.parse(jsonMatch[0]) as OcrResult;
}

async function extractViaOpenRouter(imageBase64: string): Promise<OcrResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemma-3-27b-it:free",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${error}`);
  }

  const data = await response.json();
  return parseOcrJson(data.choices[0].message.content as string);
}

async function extractViaGoogleAI(imageBase64: string): Promise<OcrResult> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_API_KEY is not set");

  const response = await fetch(`${GOOGLE_AI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: OCR_PROMPT },
            { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google AI error: ${error}`);
  }

  const data = await response.json();
  const content: string = data.candidates[0].content.parts[0].text;
  return parseOcrJson(content);
}

async function extractReceiptItems(imageBase64: string): Promise<OcrResult> {
  if (process.env.USE_OPENROUTER === "true") {
    return extractViaOpenRouter(imageBase64);
  }
  console.log("Using Google!");
  return extractViaGoogleAI(imageBase64);
}

export async function POST(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ProcessReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, imageBase64 } = parsed.data;

  let table: { id: string; status: string } | undefined;
  try {
    [table] = await db
      .select({ id: splitTables.id, status: splitTables.status })
      .from(splitTables)
      .where(eq(splitTables.id, tableId))
      .limit(1);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  if (table.status !== "active") {
    return NextResponse.json({ error: "Receipt already processed" }, { status: 409 });
  }

  const host = await verifyHostSession(tableId, sessionToken);
  if (!host) {
    return NextResponse.json({ error: "Only the host can scan a receipt" }, { status: 403 });
  }

  let ocr: OcrResult;
  try {
    ocr = await extractReceiptItems(imageBase64);
  } catch {
    return NextResponse.json({ error: "Failed to process the image. Please try again." }, { status: 502 });
  }

  if (ocr.not_a_receipt) {
    return NextResponse.json(
      { error: "That doesn't look like a receipt. Please upload a clear photo of a bill." },
      { status: 422 }
    );
  }

  if (ocr.items.length === 0) {
    return NextResponse.json(
      { error: "Couldn't find any items on this receipt. Please try a clearer photo." },
      { status: 422 }
    );
  }

  // Build item rows
  const itemRows = ocr.items.map((item, i) => ({
    tableId,
    name: item.name,
    unitPrice: String(item.unit_price),
    quantity: item.quantity || 1,
    sortOrder: i,
    isFee: false,
  }));

  // Add fee rows
  if (ocr.tax && ocr.tax > 0) {
    itemRows.push({ tableId, name: "Tax", unitPrice: String(ocr.tax), quantity: 1, sortOrder: 1000, isFee: true });
  }
  if (ocr.service_charge && ocr.service_charge > 0) {
    itemRows.push({ tableId, name: "Service Charge", unitPrice: String(ocr.service_charge), quantity: 1, sortOrder: 1001, isFee: true });
  }
  for (const fee of ocr.other_fees ?? []) {
    if (fee.amount > 0) {
      itemRows.push({ tableId, name: fee.name, unitPrice: String(fee.amount), quantity: 1, sortOrder: 1002, isFee: true });
    }
  }

  try {
    await db.insert(items).values(itemRows);
    await db
      .update(splitTables)
      .set({ status: "items_ready" })
      .where(eq(splitTables.id, tableId));
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, itemCount: itemRows.length });
}
