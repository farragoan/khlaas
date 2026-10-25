import type { AnyPgDb } from "@/lib/settle";
import { expireStaleSessions, expireTables } from "./sweeps";

export const QUEUES = {
  expireTables: { name: "khlaas-expire-tables", cron: "0 0 * * *" },
  expireSessions: { name: "khlaas-expire-sessions", cron: "30 0 * * *" },
} as const;

/** The slice of pg-boss we use, so registration is testable without a Postgres server. */
export interface BossLike {
  createQueue(name: string, options?: Record<string, unknown>): Promise<void>;
  schedule(name: string, cron: string, data?: object | null, options?: Record<string, unknown>): Promise<void>;
  work(name: string, handler: (jobs: unknown[]) => Promise<unknown>): Promise<string>;
}

/**
 * Retries come from pg-boss, not from hand-written loops: three attempts with
 * exponential backoff starting at a minute. Both sweeps are idempotent, so a
 * retry after a partial failure is always safe.
 */
export const QUEUE_OPTIONS = { retryLimit: 3, retryDelay: 60, retryBackoff: true } as const;

export async function registerJobs(
  boss: BossLike,
  db: AnyPgDb,
  log: (msg: string) => void = console.log
): Promise<void> {
  await boss.createQueue(QUEUES.expireTables.name, { ...QUEUE_OPTIONS });
  await boss.createQueue(QUEUES.expireSessions.name, { ...QUEUE_OPTIONS });

  await boss.work(QUEUES.expireTables.name, async () => {
    log(`expired ${await expireTables(db)} tables`);
  });
  await boss.work(QUEUES.expireSessions.name, async () => {
    log(`revoked ${await expireStaleSessions(db)} stale sessions`);
  });

  await boss.schedule(QUEUES.expireTables.name, QUEUES.expireTables.cron, null, { tz: "UTC" });
  await boss.schedule(QUEUES.expireSessions.name, QUEUES.expireSessions.cron, null, { tz: "UTC" });
}
