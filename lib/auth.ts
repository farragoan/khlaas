import { db } from "@/lib/db/client";
import { participants, splitTables } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createHash } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface HostCandidate {
  id: string;
  userId: string | null;
  sessionToken: string | null;
  joinedAt: Date | null;
}

/**
 * Pure host resolution. The host is the table's creator (`createdBy`, a Clerk
 * userId set at creation), never whoever happened to join first: a stranger
 * with the link could otherwise join before the creator and take over settle,
 * scan, reopen and PATCH. Only tables with no recorded creator (legacy rows)
 * fall back to the earliest joiner.
 *
 * The creator proves identity either with their Clerk session or with the
 * session token stored on their own participant row.
 */
export function resolveHost(
  createdBy: string | null | undefined,
  candidates: HostCandidate[],
  opts: { tokenHash?: string | null; clerkUserId?: string | null }
): { id: string } | null {
  if (createdBy) {
    const creator = candidates.find((c) => c.userId === createdBy);
    if (!creator) return null;
    if (opts.clerkUserId && opts.clerkUserId === createdBy) return { id: creator.id };
    if (opts.tokenHash && creator.sessionToken === opts.tokenHash) return { id: creator.id };
    return null;
  }
  if (!opts.tokenHash) return null;
  const earliest = [...candidates].sort(
    (a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0)
  )[0];
  if (!earliest || earliest.sessionToken !== opts.tokenHash) return null;
  return { id: earliest.id };
}

export async function verifyHost(
  tableId: string,
  opts: { sessionToken?: string | null; clerkUserId?: string | null }
): Promise<{ id: string } | null> {
  const [table] = await db
    .select({ createdBy: splitTables.createdBy })
    .from(splitTables)
    .where(eq(splitTables.id, tableId))
    .limit(1);
  if (!table) return null;
  const candidates = await db
    .select({
      id: participants.id,
      userId: participants.userId,
      sessionToken: participants.sessionToken,
      joinedAt: participants.joinedAt,
    })
    .from(participants)
    .where(eq(participants.tableId, tableId))
    .orderBy(asc(participants.joinedAt));
  return resolveHost(table.createdBy, candidates, {
    tokenHash: opts.sessionToken ? hashToken(opts.sessionToken) : null,
    clerkUserId: opts.clerkUserId,
  });
}
