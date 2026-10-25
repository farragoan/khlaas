import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "@/lib/testing/db-mock";

vi.mock("@clerk/nextjs/server", () => ({ auth: () => Promise.resolve({ userId: null }) }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), { status: init?.status ?? 200, headers: { "Content-Type": "application/json" } }),
  },
}));
vi.mock("@/lib/auth", () => ({ hashToken: (t: string) => t, verifyHost: () => Promise.resolve({ id: "a" }) }));
const settleTable = vi.fn();
vi.mock("@/lib/settle", () => ({ settleTable: (...a: unknown[]) => settleTable(...a) }));
const mock = makeDbMock();
vi.mock("@/lib/db/client", () => ({ get db() { return mock.db; } }));

import { POST } from "./ledger/compute/route";

const TID = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "x-session-token": "t" }, body: JSON.stringify(body) }));

function seed(status = "items_ready") {
  // table, items, participants, payments, selections
  mock.state.selects = [
    [{ id: TID, status, actualPaidTotal: null }],
    [{ id: "i1", name: "Pizza", totalPrice: "1.00", isFee: false, quantity: 3 }],
    [{ id: "a", displayName: "A" }, { id: "b", displayName: "B" }, { id: "c", displayName: "C" }],
    [{ participantId: "a", amount: "1.00" }, { participantId: "b", amount: "0.00" }, { participantId: "c", amount: "0.00" }],
    [{ participantId: "a", itemId: "i1", quantity: 1 }, { participantId: "b", itemId: "i1", quantity: 1 }, { participantId: "c", itemId: "i1", quantity: 1 }],
  ];
}

beforeEach(() => {
  mock.reset();
  settleTable.mockReset();
});

describe("POST /api/ledger/compute (settle)", () => {
  it("hands settleTable exact paise strings, with the odd paisa placed not lost", async () => {
    seed();
    settleTable.mockResolvedValue(true);
    const res = await post({ tableId: TID, tip: 0 });
    expect(res.status).toBe(200);
    const { entries, tip } = settleTable.mock.calls[0][1];
    expect(tip).toBe("0.00");
    const amounts = entries.map((e: { amount: string }) => e.amount).sort();
    // 1.00 over three: the extra paisa lands on A (who paid), so B and C owe 0.33 each
    expect(amounts).toEqual(["0.33", "0.33"]);
    expect(entries.every((e: { toParticipant: string }) => e.toParticipant === "a")).toBe(true);
  });

  it("a double submit that loses the claim is idempotent (200 alreadySettled) and the route writes nothing itself", async () => {
    seed();
    mock.state.selects.push([{ status: "settled" }], []);
    settleTable.mockResolvedValue(false);
    const res = await post({ tableId: TID, tip: 0 });
    expect(res.status).toBe(200);
    expect((await res.json()).alreadySettled).toBe(true);
    expect(mock.writes.insert).not.toHaveBeenCalled();
    expect(mock.writes.update).not.toHaveBeenCalled();
  });

  it("short-circuits an already-settled bill before computing (idempotent 200)", async () => {
    mock.state.selects = [[{ id: TID, status: "settled" }], []];
    const res = await post({ tableId: TID, tip: 0 });
    expect(res.status).toBe(200);
    expect((await res.json()).alreadySettled).toBe(true);
    expect(settleTable).not.toHaveBeenCalled();
  });

  it.each([
    [{ tableId: TID, tip: -1 }],
    [{ tableId: TID, tip: 1.005 }],
    [{ tableId: TID, tip: "10" }],
    [{ tableId: TID, tip: 1e12 }],
    [{ tableId: "nope", tip: 0 }],
  ])("rejects a malformed body %j with 400", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(settleTable).not.toHaveBeenCalled();
  });

  it("rejects an unparseable body with 400, not a 500", async () => {
    const res = await POST(new Request("http://localhost/api", { method: "POST", headers: { "x-session-token": "t" }, body: "{not json" }));
    expect(res.status).toBe(400);
  });
});
