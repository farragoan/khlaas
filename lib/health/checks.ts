import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import journal from "@/drizzle/meta/_journal.json";
import { GOOGLE_AI_API_URL, OCR_MODEL } from "@/lib/ocr-config";

/**
 * The checks behind /admin.
 *
 * Each one answers a question that, unanswered, previously cost us a
 * production outage:
 *
 *  - upstream:  is the pinned OCR model still callable?  (it was retired under
 *               us and every receipt scan 502'd for days)
 *  - database:  do the migrations on disk match the ones actually applied?
 *               (files existed that were never journalled, so the app ran
 *               against a schema it did not have)
 *  - tests:     did the suite actually run, and on the commit that is deployed?
 *  - reporting: is error collection wired up, and does the pipe accept events?
 *
 * A check never throws. A health endpoint that crashes tells you nothing.
 */

export type HealthStatus = "ok" | "warn" | "fail";

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  summary: string;
  detail?: Record<string, unknown>;
  /** What to do about it, when it is not ok. */
  remedy?: string;
  durationMs: number;
}

async function timed(
  id: string,
  label: string,
  fn: () => Promise<Omit<HealthCheck, "id" | "label" | "durationMs">>
): Promise<HealthCheck> {
  const started = performance.now();
  try {
    const result = await fn();
    return { id, label, ...result, durationMs: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      id,
      label,
      status: "fail",
      summary: err instanceof Error ? err.message : String(err),
      remedy: "The check itself threw — treat as unknown, not as healthy.",
      durationMs: Math.round(performance.now() - started),
    };
  }
}

/** Is the pinned OCR model still callable? This is the outage we already had. */
export function checkOcrUpstream(): Promise<HealthCheck> {
  return timed("ocr", "Receipt OCR upstream", async () => {
    const key = process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!key) {
      return {
        status: "fail" as const,
        summary: "GOOGLE_AI_STUDIO_API_KEY is not set — every scan will fail",
        remedy: "Set the key in the Netlify environment.",
      };
    }

    const res = await fetch(`${GOOGLE_AI_API_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ok" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      return { status: "ok" as const, summary: `${OCR_MODEL} responding`, detail: { model: OCR_MODEL } };
    }

    const body = await res.text().catch(() => "");
    const retired = res.status === 404;
    return {
      status: "fail" as const,
      summary: retired
        ? `${OCR_MODEL} is gone — Google returned 404`
        : `${OCR_MODEL} returned HTTP ${res.status}`,
      detail: { model: OCR_MODEL, httpStatus: res.status, body: body.slice(0, 300) },
      remedy: retired
        ? "The model was retired. Google's 404 body names the successor — verify it with a real request, then update OCR_MODEL in lib/ocr-config.ts."
        : "Check the key's quota and billing status.",
    };
  });
}

/** Do the migrations on disk match the ones the database has actually run? */
export function checkDatabase(): Promise<HealthCheck> {
  return timed("database", "Database & migrations", async () => {
    const rows = (await db.execute(
      sql`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`
    )) as unknown as { rows?: { applied: number }[] } | { applied: number }[];

    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    const applied = list[0]?.applied ?? 0;
    const expected = journal.entries.length;

    if (applied === expected) {
      return {
        status: "ok" as const,
        summary: `${applied} migrations applied, matching the journal`,
        detail: { applied, expected },
      };
    }
    return {
      status: "fail" as const,
      summary: `${applied} migrations applied but the journal lists ${expected}`,
      detail: { applied, expected },
      remedy:
        applied < expected
          ? "Migrations are pending. The app may be querying columns the database does not have — run drizzle-kit migrate."
          : "The database is ahead of this build. A deploy may have been rolled back.",
    };
  });
}

/** Did the test suite run, and did it run on the commit that is deployed? */
export function checkTests(): Promise<HealthCheck> {
  return timed("tests", "Test suite", async () => {
    const res = await fetch(
      "https://api.github.com/repos/farragoan/khlaas/actions/workflows/ci.yml/runs?branch=main&per_page=1",
      { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) {
      return {
        status: "warn" as const,
        summary: `GitHub returned HTTP ${res.status} — CI state unknown`,
        remedy: "Unknown is not the same as passing. Check Actions directly.",
      };
    }

    const data = (await res.json()) as {
      workflow_runs?: { status: string; conclusion: string | null; head_sha: string; created_at: string; html_url: string }[];
    };
    const run = data.workflow_runs?.[0];
    if (!run) {
      return {
        status: "fail" as const,
        summary: "No CI run found on main — nothing is running the tests",
        remedy: "Check that .github/workflows/ci.yml exists and is enabled.",
      };
    }

    const deployedSha = process.env.COMMIT_REF ?? null;
    const staleForDeploy = Boolean(deployedSha && !deployedSha.startsWith(run.head_sha.slice(0, 7)) && !run.head_sha.startsWith(deployedSha.slice(0, 7)));

    if (run.status !== "completed") {
      return {
        status: "warn" as const,
        summary: `CI is still ${run.status} on ${run.head_sha.slice(0, 8)}`,
        detail: { sha: run.head_sha, url: run.html_url },
      };
    }
    if (run.conclusion !== "success") {
      return {
        status: "fail" as const,
        summary: `CI ${run.conclusion} on ${run.head_sha.slice(0, 8)}`,
        detail: { sha: run.head_sha, url: run.html_url, ranAt: run.created_at },
        remedy: "The suite is red. Every deploy after this one is unverified.",
      };
    }
    return {
      status: staleForDeploy ? ("warn" as const) : ("ok" as const),
      summary: staleForDeploy
        ? `CI passed on ${run.head_sha.slice(0, 8)}, but ${deployedSha?.slice(0, 8)} is deployed`
        : `CI passed on ${run.head_sha.slice(0, 8)}`,
      detail: { sha: run.head_sha, deployedSha, url: run.html_url, ranAt: run.created_at },
      remedy: staleForDeploy
        ? "The deployed commit is not the one the tests ran against."
        : undefined,
    };
  });
}

/**
 * Is error collection wired up, and does the ingest endpoint actually accept
 * events? Configuration alone is not proof — a wrong key looks identical to a
 * right one until something tries to send.
 */
export function checkErrorReporting(): Promise<HealthCheck> {
  return timed("reporting", "Error collection", async () => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

    if (!key) {
      return {
        status: "fail" as const,
        summary: "NEXT_PUBLIC_POSTHOG_KEY is not set — no errors are being collected",
        remedy: "Set the key in the Netlify environment and redeploy.",
      };
    }

    // A benign event, not a synthetic exception: polluting error tracking with
    // fake errors would make the thing we are trying to trust less trustworthy.
    const res = await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "admin_health_check",
        distinct_id: "admin-health",
        properties: { $process_person_profile: false, source: "khlaas-admin" },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        status: "fail" as const,
        summary: `Ingest rejected the event: HTTP ${res.status}`,
        detail: { host, body: body.slice(0, 200) },
        remedy: "The key is set but not accepted. Check it matches the PostHog project.",
      };
    }

    return {
      status: "ok" as const,
      summary: "Ingest accepted a test event — the collection path works",
      detail: { host, keyPrefix: key.slice(0, 8) },
    };
  });
}

export async function runAllChecks(): Promise<HealthCheck[]> {
  return Promise.all([
    checkOcrUpstream(),
    checkDatabase(),
    checkTests(),
    checkErrorReporting(),
  ]);
}

export function overallStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "ok";
}
