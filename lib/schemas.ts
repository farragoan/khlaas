import { z } from "zod";

export const CreateTableSchema = z.object({});

export const JoinParticipantSchema = z.object({
  tableId: z.string().uuid(),
  displayName: z.string().min(1).max(50),
  sessionToken: z.string().min(1),
});

export const AddSelectionSchema = z.object({
  participantId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const RemoveSelectionSchema = z.object({
  participantId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const ProcessReceiptSchema = z.object({
  tableId: z.string().uuid(),
  imageBase64: z.string().min(1),
});

export const ComputeLedgerSchema = z.object({
  tableId: z.string().uuid(),
});
