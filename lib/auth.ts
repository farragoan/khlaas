import { db } from "@/lib/db/client";
import { participants, splitTables } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { createHash } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyHost(
  tableId: string,
  opts: { sessionToken?: string | null; clerkUserId?: string | null }
): Promise<{ id: string } | null> {
  if (opts.clerkUserId) {
    const [table] = await db
      .select({ createdBy: splitTables.createdBy })
      .from(splitTables)
      .where(eq(splitTables.id, tableId))
      .limit(1);
    if (table?.createdBy === opts.clerkUserId) {
      const [hostParticipant] = await db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.tableId, tableId), eq(participants.userId, opts.clerkUserId)))
        .limit(1);
      if (hostParticipant) return hostParticipant;
      return null;
    }
  }
  if (!opts.sessionToken) return null;
  const [host] = await db
    .select({ id: participants.id, sessionToken: participants.sessionToken })
    .from(participants)
    .where(eq(participants.tableId, tableId))
    .orderBy(asc(participants.joinedAt))
    .limit(1);
  if (!host || host.sessionToken !== hashToken(opts.sessionToken)) return null;
  return { id: host.id };
}
