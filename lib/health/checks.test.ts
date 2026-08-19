import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A health check that reports green while something is broken is worse than no
// health check — it converts an outage into a confident all-clear. These tests
// pin the failing paths specifically, because those are the ones nobody
// notices being wrong.

const dbExecute = vi.fn();
vi.mock("@/lib/db/client", () => ({ db: { execute: (...a: unknown[]) => dbExecute(...a) } }));
vi.mock("@/drizzle/meta/_journal.json", () => ({
  default: { entries: [{ tag: "a" }, { tag: "b" }, { tag: "c" }] },
}));

import {
  checkOcrUpstream,
  checkDatabase,
  checkTests,
  checkErrorReporting,
  overallStatus,
} from "./checks";
import type { HealthCheck } from "./checks";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  dbExecute.mockReset();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

/** The slice of a Response these checks read, with sync bodies for brevity. */
interface FakeResponse {
  ok?: boolean;
  status?: number;
  json?: () => unknown;
  text?: () => unknown;
}

function mockFetch(impl: (url: string) => FakeResponse) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const r = impl(String(url));
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => (r.json ? r.json() : {}),
      text: async () => (r.text ? String(r.text()) : ""),
    } as Response;
  }));
}

describe("checkOcrUpstream", () => {
  it("fails loudly when the pinned model has been retired", async () => {
    process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
    mockFetch(() => ({
      ok: false,
      status: 404,
      text: () => "This model is no longer available to new users. Please use gemini-9",
    }));

    const check = await checkOcrUpstream();

    expect(check.status).toBe("fail");
    expect(check.summary).toMatch(/gone|404/i);
    // The remedy has to name the next step, or a red dot just starts a search.
    expect(check.remedy).toMatch(/retired/i);
    expect(check.detail?.body).toContain("gemini-9");
  });

  it("fails when the key is missing rather than reporting healthy", async () => {
    delete process.env.GOOGLE_AI_STUDIO_API_KEY;
    const check = await checkOcrUpstream();
    expect(check.status).toBe("fail");
  });

  it("passes when the model answers", async () => {
    process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
    mockFetch(() => ({ ok: true, status: 200 }));
    expect((await checkOcrUpstream()).status).toBe("ok");
  });

  it("reports fail, not a crash, when the upstream is unreachable", async () => {
    process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ETIMEDOUT"); }));
    const check = await checkOcrUpstream();
    expect(check.status).toBe("fail");
    expect(check.summary).toContain("ETIMEDOUT");
  });
});

describe("checkDatabase", () => {
  it("fails when migrations are pending, which is how the app runs on a schema it lacks", async () => {
    dbExecute.mockResolvedValue([{ applied: 1 }]);
    const check = await checkDatabase();
    expect(check.status).toBe("fail");
    expect(check.summary).toContain("1 migrations applied");
    expect(check.remedy).toMatch(/pending/i);
  });

  it("passes when applied count matches the journal", async () => {
    dbExecute.mockResolvedValue([{ applied: 3 }]);
    expect((await checkDatabase()).status).toBe("ok");
  });

  it("flags a database ahead of the build separately from one behind", async () => {
    dbExecute.mockResolvedValue([{ applied: 5 }]);
    const check = await checkDatabase();
    expect(check.status).toBe("fail");
    expect(check.remedy).toMatch(/rolled back/i);
  });
});

describe("checkTests", () => {
  const run = (over: Record<string, unknown> = {}) => ({
    json: () => ({
      workflow_runs: [{
        status: "completed", conclusion: "success",
        head_sha: "abcdef1234567890", created_at: "2026-08-19T00:00:00Z",
        html_url: "https://github.com/x", ...over,
      }],
    }),
  });

  it("fails when CI is red", async () => {
    mockFetch(() => run({ conclusion: "failure" }));
    const check = await checkTests();
    expect(check.status).toBe("fail");
    expect(check.remedy).toMatch(/unverified/i);
  });

  it("fails when no run exists at all — nothing is running the tests", async () => {
    mockFetch(() => ({ json: () => ({ workflow_runs: [] }) }));
    expect((await checkTests()).status).toBe("fail");
  });

  it("warns rather than passes when the deployed commit is not the tested one", async () => {
    process.env.COMMIT_REF = "9999999999999999";
    mockFetch(() => run());
    const check = await checkTests();
    expect(check.status).toBe("warn");
    expect(check.summary).toMatch(/deployed/i);
  });

  it("passes when CI is green on the deployed commit", async () => {
    process.env.COMMIT_REF = "abcdef1234567890";
    mockFetch(() => run());
    expect((await checkTests()).status).toBe("ok");
  });

  it("warns, not passes, when GitHub itself is unavailable", async () => {
    mockFetch(() => ({ ok: false, status: 503 }));
    const check = await checkTests();
    expect(check.status).toBe("warn");
    expect(check.remedy).toMatch(/not the same as passing/i);
  });
});

describe("checkErrorReporting", () => {
  it("fails when no key is set, because nothing is being collected", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    expect((await checkErrorReporting()).status).toBe("fail");
  });

  it("fails when the key is set but ingest rejects it", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_wrong";
    mockFetch(() => ({ ok: false, status: 401, text: () => "unauthorized" }));
    const check = await checkErrorReporting();
    expect(check.status).toBe("fail");
    expect(check.remedy).toMatch(/not accepted/i);
  });

  it("passes only after ingest accepts a real event", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_right";
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      seen.push(String(url));
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as Response;
    }));

    const check = await checkErrorReporting();

    expect(check.status).toBe("ok");
    expect(seen[0]).toContain("/i/v0/e/");
  });

  it("never sends a fake exception — that would poison error tracking", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_right";
    let body = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as Response;
    }));

    await checkErrorReporting();

    expect(body).not.toContain("$exception");
    expect(body).toContain("admin_health_check");
  });
});

describe("overallStatus", () => {
  const c = (status: HealthCheck["status"]): HealthCheck =>
    ({ id: "x", label: "x", status, summary: "", durationMs: 0 });

  it("is fail if anything fails, even alongside passes", () => {
    expect(overallStatus([c("ok"), c("warn"), c("fail")])).toBe("fail");
  });

  it("is warn if anything warns", () => {
    expect(overallStatus([c("ok"), c("warn")])).toBe("warn");
  });

  it("is ok only when everything is ok", () => {
    expect(overallStatus([c("ok"), c("ok")])).toBe("ok");
  });
});
