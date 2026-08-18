import { describe, it, expect, vi, beforeEach } from "vitest";

// An expired bill is readable but frozen. These tests pin the second half of
// that promise: every route that writes to a bill has to refuse once the
// hourly expiry job has stamped it, otherwise the read-only screen is a lie
// that any stale tab or curl can walk straight through.

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: null }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  },
}));

vi.mock("@/lib/auth", () => ({
  hashToken: (t: string) => `hashed:${t}`,
  // Pass the host check so a failure can only come from the expiry guard.
  verifyHost: () => Promise.resolve({ id: "participant-1" }),
}));

const selectResults: unknown[][] = [];
let callIdx = 0;

function makeThenableChain(idx: number) {
  const resolved = Promise.resolve(selectResults[idx] ?? []);
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn(),
    then: resolved.then.bind(resolved),
  };
  for (const m of [chain.from, chain.where, chain.orderBy, chain.innerJoin, chain.limit]) {
    m.mockReturnValue(chain);
  }
  return chain;
}

const insertSpy = vi.fn();
const updateSpy = vi.fn();

vi.mock("@/lib/db/client", () => ({
  get db() {
    return {
      select: () => makeThenableChain(callIdx++),
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        throw new Error("insert must not run on an expired bill");
      },
      update: (...args: unknown[]) => {
        updateSpy(...args);
        throw new Error("update must not run on an expired bill");
      },
    };
  },
}));

import { POST as participantsPOST } from "./participants/route";
import { POST as paymentsPOST } from "./payments/route";
import { POST as computePOST } from "./ledger/compute/route";
import { PATCH as tablePATCH } from "./tables/[shareCode]/route";

const TABLE_ID = "11111111-1111-4111-8111-111111111111";
const PARTICIPANT_ID = "22222222-2222-4222-8222-222222222222";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const TOKEN = { "x-session-token": "session-token" };

beforeEach(() => {
  selectResults.length = 0;
  callIdx = 0;
  insertSpy.mockClear();
  updateSpy.mockClear();
});

describe("expired bills reject writes", () => {
  it("refuses a join, so opening an old link does not add you to the roster", async () => {
    selectResults[0] = [{ status: "expired" }];

    const res = await participantsPOST(
      req({ tableId: TABLE_ID, displayName: "Ana", sessionToken: "tok" })
    );

    expect(res.status).toBe(409);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("refuses a payment", async () => {
    selectResults[0] = [{ status: "expired" }];

    const res = await paymentsPOST(
      req({ tableId: TABLE_ID, participantId: PARTICIPANT_ID, amount: 100 }, TOKEN)
    );

    expect(res.status).toBe(409);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("refuses settling, so an expired bill cannot flip to settled months later", async () => {
    selectResults[0] = [{ id: TABLE_ID, status: "expired" }];

    const res = await computePOST(req({ tableId: TABLE_ID, tip: 0 }, TOKEN));

    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("refuses a table edit from the host", async () => {
    selectResults[0] = [{ id: TABLE_ID, status: "expired" }];

    const res = await tablePATCH(
      new Request("http://localhost/api", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...TOKEN },
        body: JSON.stringify({ currency: "USD" }),
      }),
      { params: Promise.resolve({ shareCode: "abc123" }) }
    );

    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("live bills still accept writes", () => {
  // The guard keys on one exact status; a typo that matched more broadly would
  // silently freeze bills that are still in play, and no expiry test would see it.
  it("lets a payment through on an items_ready bill", async () => {
    selectResults[0] = [{ status: "items_ready" }];
    selectResults[1] = [{ id: PARTICIPANT_ID }]; // requester
    selectResults[2] = [{ id: PARTICIPANT_ID }]; // target

    await expect(
      paymentsPOST(req({ tableId: TABLE_ID, participantId: PARTICIPANT_ID, amount: 100 }, TOKEN))
    ).rejects.toThrow("insert must not run");

    expect(insertSpy).toHaveBeenCalled();
  });
});
