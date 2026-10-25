import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items } from "@/lib/db/schema";
import { ProcessReceiptSchema } from "@/lib/schemas";
import { verifyHost } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { reportError } from "@/lib/observability";
import { GOOGLE_AI_API_URL, googleAiHeaders } from "@/lib/ocr-config";
import { and, eq, sql } from "drizzle-orm";
import { sanitizeOcrItems, cleanAmount, cleanName } from "@/lib/ocr-sanitize";
import { leaseValue, LEASE_MS } from "@/lib/scan-lease";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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

/**
 * A receipt's subtotal line is a restatement of the items above it, not a charge.
 * When the model reports one under other_fees it lands as a shared fee and gets
 * added on top of every item, roughly doubling the bill and splitting the
 * phantom amount across everyone. Matched narrowly on purpose: a real charge
 * called "Total GST" has to survive, so only the restatement words are dropped.
 */
export function isTotalLine(name: string): boolean {
  return /^\s*(sub[\s-]?total|grand[\s-]?total|total|net[\s-]?(amount|payable)|amount[\s-]?payable|bill[\s-]?(amount|total))\s*:?\s*$/i.test(name);
}

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
    const response = await fetch(GOOGLE_AI_API_URL, {
      method: "POST",
      headers: googleAiHeaders(apiKey),
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
  return extractViaGoogleAI(imageBase64);
}

export async function POST(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) return NextResponse.json({ error: "Missing session token" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ProcessReceiptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tableId, imageBase64 } = parsed.data;

  let table: { id: string; status: string } | undefined;
  try {
    [table] = await db.select({ id: splitTables.id, status: splitTables.status }).from(splitTables).where(eq(splitTables.id, tableId)).limit(1);
  } catch (err) {
    await reportError(err, { operation: "load table before receipt scan", tableId });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (table.status !== "active") return NextResponse.json({ error: "Receipt already processed" }, { status: 409 });

  const { userId } = await auth();
  const host = await verifyHost(tableId, { sessionToken, clerkUserId: userId });
  if (!host) return NextResponse.json({ error: "Only the host can scan a receipt" }, { status: 403 });

  // Claim the table before the multi-second OCR call. The status check above
  // is only a read; two concurrent scans both pass it and would both insert
  // every item. The claim is one conditional UPDATE, so exactly one wins.
  const now = Date.now();
  const lease = leaseValue(now);
  const cutoff = now - LEASE_MS;
  const leaseRe = "^scanning:[0-9]+$";
  let claimed: { id: string }[];
  try {
    claimed = await db
      .update(splitTables)
      .set({ rawOcr: lease })
      .where(
        and(
          eq(splitTables.id, tableId),
          eq(splitTables.status, "active"),
          sql`(${splitTables.rawOcr} IS NULL OR ${splitTables.rawOcr} !~ ${leaseRe}
            OR (CASE WHEN ${splitTables.rawOcr} ~ ${leaseRe} THEN substring(${splitTables.rawOcr} from 10)::bigint ELSE 0 END) < ${cutoff})`
        )
      )
      .returning({ id: splitTables.id });
  } catch (err) {
    await reportError(err, { operation: "claim table for receipt scan", tableId });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  if (claimed.length === 0) {
    return NextResponse.json({ error: "Receipt is already being processed" }, { status: 409 });
  }

  const releaseClaim = async () => {
    try {
      await db
        .update(splitTables)
        .set({ rawOcr: null })
        .where(and(eq(splitTables.id, tableId), eq(splitTables.rawOcr, lease)));
    } catch (err) {
      await reportError(err, { operation: "release receipt scan claim", tableId });
    }
  };

  let ocr: OcrResult;
  try { ocr = await extractReceiptItems(imageBase64); }
  catch (err) {
    // Users only ever saw "Failed to process the image", so a retired upstream
    // model looked identical to a blurry photo and went unnoticed for days.
    // The upstream reason belongs in the logs even though it never reaches them.
    await reportError(err, { operation: "receipt OCR", tableId });
    await releaseClaim();
    return NextResponse.json({ error: "Failed to process the image. Please try again." }, { status: 502 });
  }

  if (ocr?.not_a_receipt) {
    await releaseClaim();
    return NextResponse.json({ error: "That doesn't look like a receipt. Please upload a clear photo of a bill." }, { status: 422 });
  }
  const cleanItems = sanitizeOcrItems(ocr?.items);
  if (!cleanItems || cleanItems.length === 0) {
    await releaseClaim();
    return NextResponse.json({ error: "Couldn't find any items on this receipt. Please try a clearer photo." }, { status: 422 });
  }

  const itemRows = cleanItems.map((item, i) => ({
    tableId, name: item.name, unitPrice: String(item.unitPrice), quantity: item.quantity, sortOrder: i, isFee: false,
  }));

  const tax = cleanAmount(ocr.tax);
  const serviceCharge = cleanAmount(ocr.service_charge);
  if (tax) itemRows.push({ tableId, name: "Tax", unitPrice: String(tax), quantity: 1, sortOrder: 1000, isFee: true });
  if (serviceCharge) itemRows.push({ tableId, name: "Service Charge", unitPrice: String(serviceCharge), quantity: 1, sortOrder: 1001, isFee: true });
  const otherFees = Array.isArray(ocr.other_fees) ? ocr.other_fees : [];
  for (const fee of otherFees.slice(0, 20)) {
    const name = cleanName(fee?.name);
    const amount = cleanAmount(fee?.amount);
    if (name && amount && !isTotalLine(name)) {
      itemRows.push({ tableId, name, unitPrice: String(amount), quantity: 1, sortOrder: 1002, isFee: true });
    }
  }

  try {
    // One atomic batch: items and the status flip land together or not at all,
    // so a failure between them cannot leave items on a still-active bill that
    // a re-scan would then duplicate.
    await db.batch([
      db.insert(items).values(itemRows),
      db.update(splitTables).set({ status: "items_ready", rawOcr: null }).where(eq(splitTables.id, tableId)),
    ]);
  } catch (err) {
    await reportError(err, { operation: "persist OCR items", tableId, itemCount: itemRows.length });
    await releaseClaim();
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, itemCount: itemRows.length });
}
