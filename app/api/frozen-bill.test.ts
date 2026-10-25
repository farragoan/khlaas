import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "@/lib/testing/db-mock";

// Settled and expired bills are frozen. These pin the fast path that used to
// skip the guard: a session token that matched its participant could keep
// rewriting selections and names after the bill was frozen.

vi.mock("@clerk/nextjs/server", () => ({ auth: () => Promise.resolve({ userId: null }) }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), { status: init?.status ?? 200, headers: { "Content-Type": "application/json" } }),
  },
}));
vi.mock("@/lib/auth", () => ({ hashToken: (t: string) => `h:${t}`, verifyHost: () => Promise.resolve(null) }));

const mock = makeDbMock();
vi.mock("@/lib/db/client", () => ({ get db() { return mock.db; } }));

import { POST as selPOST, PUT as selPUT, DELETE as selDELETE } from "./selections/route";
import { PATCH as partPATCH } from "./participants/route";

const PID = "22222222-2222-4222-8222-222222222222";
const IID = "33333333-3333-4333-8333-333333333333";
const TID = "11111111-1111-4111-8111-111111111111";
const call = (method: string, body: unknown) =>
  new Request("http://localhost/api", {
    method,
    headers: { "Content-Type": "application/json", "x-session-token": "tok" },
    body: JSON.stringify(body),
  });

beforeEach(() => mock.reset());

describe.each(["settled", "expired"])("selections on a %s bill", (status) => {
  it("POST is refused even with a valid direct session token", async () => {
    mock.state.selects = [[{ status }], [{ id: PID }]]; // item->table status, direct match
    const res = await selPOST(call("POST", { participantId: PID, itemId: IID, quantity: 1 }));
    expect(res.status).toBe(409);
    expect(mock.writes.insert).not.toHaveBeenCalled();
  });
  it("PUT is refused", async () => {
    mock.state.selects = [[{ status }], [{ id: PID }]];
    const res = await selPUT(call("PUT", { participantId: PID, itemId: IID, quantity: 2 }));
    expect(res.status).toBe(409);
    expect(mock.writes.update).not.toHaveBeenCalled();
  });
  it("DELETE is refused", async () => {
    mock.state.selects = [[{ status }], [{ id: PID }]];
    const res = await selDELETE(call("DELETE", { participantId: PID, itemId: IID }));
    expect(res.status).toBe(409);
    expect(mock.writes.delete).not.toHaveBeenCalled();
  });
});

describe("selections on a live bill", () => {
  it("still accepts a direct-token write on items_ready", async () => {
    mock.state.selects = [[{ status: "items_ready" }], [{ id: PID }], [{ quantity: 3 }], [{ total: 0 }]];
    mock.state.writeResult = [{ id: "sel-1" }];
    const res = await selPOST(call("POST", { participantId: PID, itemId: IID, quantity: 1 }));
    expect(res.status).toBe(201);
    expect(mock.writes.insert).toHaveBeenCalledTimes(1);
  });
  it("404s-as-403 when the item does not exist", async () => {
    mock.state.selects = [[]];
    const res = await selPOST(call("POST", { participantId: PID, itemId: IID, quantity: 1 }));
    expect(res.status).toBe(403);
    expect(mock.writes.insert).not.toHaveBeenCalled();
  });
});

describe("participants PATCH", () => {
  it.each(["settled", "expired"])("refuses a rename on a %s bill", async (status) => {
    mock.state.selects = [[{ id: PID, tableId: TID }], [{ status }]];
    const res = await partPATCH(call("PATCH", { displayName: "Mallory" }));
    expect(res.status).toBe(409);
    expect(mock.writes.update).not.toHaveBeenCalled();
  });
  it("refuses 'submitted' on a settled bill", async () => {
    mock.state.selects = [[{ id: PID, tableId: TID }], [{ status: "settled" }]];
    const res = await partPATCH(call("PATCH", { submitted: true }));
    expect(res.status).toBe(409);
  });
  it("allows a rename while the bill is live", async () => {
    mock.state.selects = [[{ id: PID, tableId: TID }], [{ status: "items_ready" }]];
    const res = await partPATCH(call("PATCH", { displayName: "Ana" }));
    expect(res.status).toBe(200);
    expect(mock.writes.update).toHaveBeenCalledTimes(1);
  });
});
