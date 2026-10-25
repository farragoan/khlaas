import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "@/lib/testing/db-mock";

let clerkUser: string | null = null;
let hostId: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({ auth: () => Promise.resolve({ userId: clerkUser }) }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), { status: init?.status ?? 200, headers: { "Content-Type": "application/json" } }),
  },
}));
vi.mock("@/lib/auth", () => ({
  hashToken: (t: string) => `h:${t}`,
  verifyHost: () => Promise.resolve(hostId ? { id: hostId } : null),
}));
const mock = makeDbMock();
vi.mock("@/lib/db/client", () => ({ get db() { return mock.db; } }));

import { GET } from "./tables/[shareCode]/route";

const TABLE = {
  id: "t1", shareCode: "abc12345", status: "items_ready", currency: "INR", tip: "0.00",
  rawOcr: '{"secret":"ocr dump"}', receiptUrl: "https://blob.example/receipt.jpg",
  createdBy: "user_host", paymentMode: "split", actualPaidTotal: null, createdAt: null, expiresAt: null,
};
const PARTS = [
  { id: "p1", tableId: "t1", displayName: "Host", userId: "user_host", upiId: "host@upi", joinedAt: null, splitsSubmittedAt: null },
  { id: "p2", tableId: "t1", displayName: "Guest", userId: null, upiId: "guest@upi", joinedAt: null, splitsSubmittedAt: null },
];
const get = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/tables/abc12345", { headers }), { params: Promise.resolve({ shareCode: "abc12345" }) });

beforeEach(() => {
  mock.reset();
  clerkUser = null;
  hostId = null;
  // table, items(empty -> no selections query), participants, payments
  mock.state.selects = [[TABLE], [], PARTS, []];
});

describe("GET /api/tables/[shareCode] (the unauthenticated read)", () => {
  it("never returns rawOcr or receiptUrl, to anyone", async () => {
    const body = await (await get()).json();
    expect(body.table).not.toHaveProperty("rawOcr");
    expect(body.table).not.toHaveProperty("receiptUrl");
    expect(JSON.stringify(body)).not.toContain("ocr dump");
    expect(JSON.stringify(body)).not.toContain("receipt.jpg");
    expect(body.table.shareCode).toBe("abc12345");
  });

  it("hides every upiId from an anonymous visitor holding only the link", async () => {
    const body = await (await get()).json();
    expect(body.participants.map((p: { upiId: unknown }) => p.upiId)).toEqual([null, null]);
    expect(JSON.stringify(body)).not.toContain("@upi");
  });

  it("hides upiId from a token that matches nobody at the table", async () => {
    mock.state.selects = [[TABLE], [], PARTS, [], []]; // participant-match lookup finds nothing
    const body = await (await get({ "x-session-token": "stranger" })).json();
    expect(JSON.stringify(body)).not.toContain("@upi");
  });

  it("shows upiIds to a guest whose session token is a participant here", async () => {
    mock.state.selects = [[TABLE], [], PARTS, [], [{ id: "p2" }]];
    const body = await (await get({ "x-session-token": "mine" })).json();
    expect(body.participants.map((p: { upiId: string }) => p.upiId)).toEqual(["host@upi", "guest@upi"]);
  });

  it("shows upiIds to the host", async () => {
    hostId = "p1";
    const res = await get({ "x-session-token": "hosttok" });
    const body = await res.json();
    expect(body.isHost).toBe(true);
    expect(body.participants[1].upiId).toBe("guest@upi");
  });

  it("shows upiIds to a signed-in participant", async () => {
    clerkUser = "user_host";
    const body = await (await get()).json();
    expect(body.participants[0].upiId).toBe("host@upi");
  });

  it("is not shareable-cacheable, since the body varies by viewer", async () => {
    const res = await get();
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("private");
    expect(cc).toContain("no-store");
    expect(cc).not.toContain("public");
    expect(cc).not.toContain("s-maxage");
  });

  it("404s an unknown code", async () => {
    mock.state.selects = [[]];
    expect((await get()).status).toBe(404);
  });
});
