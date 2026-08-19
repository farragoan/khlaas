import { auth } from "@clerk/nextjs/server";

/**
 * Admin access is an explicit allowlist of Clerk user IDs, and an unset
 * ADMIN_USER_IDS grants access to nobody.
 *
 * Failing closed matters more here than convenience: the health endpoint
 * reports which upstreams are reachable and which env vars are set, which is a
 * map of the system's soft spots. Guessing an ID from the database would have
 * been quicker and would have risked handing that map to whoever happened to
 * create the most bills.
 */
export interface AdminCheck {
  allowed: boolean;
  /** The caller's own Clerk ID, so they can add themselves to the allowlist. */
  userId: string | null;
  configured: boolean;
}

export function adminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function checkAdmin(): Promise<AdminCheck> {
  const { userId } = await auth();
  const allowlist = adminUserIds();
  return {
    allowed: Boolean(userId && allowlist.includes(userId)),
    userId: userId ?? null,
    configured: allowlist.length > 0,
  };
}
