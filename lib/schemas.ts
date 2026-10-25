import { z } from "zod";

/**
 * Upper bound for any money value accepted from a client. The DB columns are
 * numeric(10,2) (max 99,999,999.99), so anything near that overflows into an
 * unhandled 500 and anything just under it wrecks the ledger. 10 million covers
 * any real restaurant bill in any supported currency.
 */
export const MAX_MONEY = 10_000_000;

/**
 * A money amount in currency units: finite, non-negative, at most two decimal
 * places, and no larger than MAX_MONEY. Anything else is a 400, never a
 * silent rounding.
 */
export const MoneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(MAX_MONEY)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "at most 2 decimal places");

export const CreateTableSchema = z.object({
  currency: z.string().length(3).default("INR"),
});

export const JoinParticipantSchema = z.object({
  tableId: z.string().uuid(),
  displayName: z.string().min(1).max(50),
  sessionToken: z.string().min(1),
  upiId: z.string().max(50).optional(),
});

export const UpdateParticipantSchema = z.object({
  // Optional so a browser still running an older bundle keeps working; when it
  // is present the route checks it against the token's own table.
  tableId: z.string().uuid().optional(),
  displayName: z.string().min(1).max(50).optional(),
  submitted: z.boolean().optional(),
});

export const AddSelectionSchema = z.object({
  participantId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export const UpdateSelectionSchema = z.object({
  participantId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

export const RemoveSelectionSchema = z.object({
  participantId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const ProcessReceiptSchema = z.object({
  tableId: z.string().uuid(),
  // ~7M base64 chars is ~5MB of image; bigger is never a phone photo we can OCR.
  imageBase64: z.string().min(1).max(7_000_000),
});

export const PaymentSchema = z.object({
  tableId: z.string().uuid(),
  participantId: z.string().uuid(),
  amount: MoneySchema,
});

export const ComputeLedgerSchema = z.object({
  tableId: z.string().uuid(),
  tip: MoneySchema.default(0),
});

export const UpdateTableSchema = z.object({
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  paymentMode: z.enum(["host", "split"]).optional(),
  // null or "" clears the discount.
  actualPaidTotal: z
    .union([MoneySchema, z.literal(""), z.null()])
    .transform((v) => (v === "" ? null : v))
    .optional(),
});

export const UpdateUserProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  upiId: z.string().trim().max(100).optional(),
});
