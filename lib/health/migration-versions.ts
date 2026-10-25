/**
 * Versions of every file in db/migrations, newest last. The /admin health check
 * compares this to the dbmate `schema_migrations` table. scripts/db-check.sh
 * fails CI if this list and the directory disagree, so it cannot silently rot.
 */
export const MIGRATION_VERSIONS = [
  "20260426000000",
  "20260502000000",
  "20260623000000",
  "20260627000000",
  "20260627000001",
  "20260627000002",
  "20260704000000",
  "20260705000000",
  "20260705000001",
  "20260818000000",
] as const;
