import { db } from "@/lib/db/client";
import { participants } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createHash } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Returns the host participant if the session token matches, null otherwise. */
export async function verifyHostSession(
  tableId: string,
  sessionToken: string
): Promise<{ id: string } | null> {
  const [host] = await db
    .select({ id: participants.id, sessionToken: participants.sessionToken })
    .from(participants)
    .where(eq(participants.tableId, tableId))
    .orderBy(asc(participants.joinedAt))
    .limit(1);

  if (!host || host.sessionToken !== hashToken(sessionToken)) return null;
  return { id: host.id };
}
