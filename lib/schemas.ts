import { z } from "zod";

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
  imageBase64: z.string().min(1),
});

export const PaymentSchema = z.object({
  tableId: z.string().uuid(),
  participantId: z.string().uuid(),
  amount: z.number().nonnegative(),
});

export const ComputeLedgerSchema = z.object({
  tableId: z.string().uuid(),
  tip: z.number().nonnegative().default(0),
});
