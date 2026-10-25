import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "@/lib/testing/db-mock";
import { MoneySchema, UpdateTableSchema, UpdateUserProfileSchema, CreateTableSchema } from "@/lib/schemas";

let clerkUser: string | null = "user_1";
vi.mock("@clerk/nextjs/server", () => ({ auth: () => Promise.resolve({ userId: clerkUser }) }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), { status: init?.status ?? 200, headers: { "Content-Type": "application/json" } }),
  },
}));
vi.mock("@/lib/auth", () => ({ hashToken: (t: string) => t, verifyHost: () => Promise.resolve({ id: "h" }) }));
const mock = makeDbMock();
vi.mock("@/lib/db/client", () => ({ get db() { return mock.db; } }));

import { POST as tablesPOST } from "./tables/route";
import { PATCH as tablePATCH } from "./tables/[shareCode]/route";
import { PUT as profilePUT } from "./user-profile/route";

const req = (method: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const patch = (body: unknown) =>
  tablePATCH(req("PATCH", body, { "x-session-token": "t" }), { params: Promise.resolve({ shareCode: "abc" }) });

beforeEach(() => {
  mock.reset();
  clerkUser = "user_1";
});

describe("MoneySchema", () => {
  it("accepts 2dp amounts including float-awkward ones", () => {
    for (const v of [0, 0.1, 19.99, 1.15, 0.29, 9_999_999.99, 10_000_000]) expect(MoneySchema.safeParse(v).success).toBe(true);
  });
  it("rejects sub-paisa, negative, non-finite and oversize amounts", () => {
    for (const v of [1.001, -0.01, NaN, Infinity, 10_000_000.01, 100_000_000, "5"]) expect(MoneySchema.safeParse(v).success).toBe(false);
  });
});

describe("POST /api/tables", () => {
  it("rejects an invalid currency with 400 instead of silently using INR", async () => {
    const res = await tablesPOST(req("POST", { currency: "RUPEES" }));
    expect(res.status).toBe(400);
    expect(mock.writes.insert).not.toHaveBeenCalled();
  });
  it("defaults to INR on an empty body", async () => {
    mock.state.writeResult = [{ id: "t", shareCode: "abcdefgh" }];
    const res = await tablesPOST(req("POST", {}));
    expect(res.status).toBe(201);
    expect(CreateTableSchema.parse({}).currency).toBe("INR");
  });
  it("treats an unparseable body as empty (defaults to INR)", async () => {
    mock.state.writeResult = [{ id: "t", shareCode: "abcdefgh" }];
    const res = await tablesPOST(req("POST", "{oops"));
    expect(res.status).toBe(201); // only a wrong field is an error
  });
});

describe("PATCH /api/tables/[shareCode]", () => {
  beforeEach(() => {
    // table lookup, then (for discount) items
    mock.state.selects = [[{ id: "t1", status: "items_ready" }], [{ totalPrice: "100.10" }, { totalPrice: "50.05" }]];
  });
  it("rejects a bad currency with 400", async () => {
    expect((await patch({ currency: "RUPEES" })).status).toBe(400);
    expect(mock.writes.update).not.toHaveBeenCalled();
  });
  it("rejects an unknown paymentMode", async () => {
    mock.reset();
    mock.state.selects = [[{ id: "t1", status: "items_ready" }]];
    expect((await patch({ paymentMode: "crypto" })).status).toBe(400);
  });
  it("rejects a sub-paisa discount total", async () => {
    mock.reset();
    mock.state.selects = [[{ id: "t1", status: "items_ready" }]];
    expect((await patch({ actualPaidTotal: 10.001 })).status).toBe(400);
  });
  it("rejects a discounted total above the bill, compared in paise", async () => {
    const res = await patch({ actualPaidTotal: 150.16 });
    expect(res.status).toBe(400);
    expect(mock.writes.update).not.toHaveBeenCalled();
  });
  it("accepts exactly the bill total (no float slop)", async () => {
    const res = await patch({ actualPaidTotal: 150.15 });
    expect(res.status).toBe(200);
    expect(mock.writes.update).toHaveBeenCalledTimes(1);
  });
  it('treats null and "" as clearing the discount', async () => {
    expect(UpdateTableSchema.parse({ actualPaidTotal: "" }).actualPaidTotal).toBeNull();
    expect(UpdateTableSchema.parse({ actualPaidTotal: null }).actualPaidTotal).toBeNull();
    const res = await patch({ actualPaidTotal: null });
    expect(res.status).toBe(200);
  });
  it("400s an empty update", async () => {
    mock.reset();
    mock.state.selects = [[{ id: "t1", status: "items_ready" }]];
    expect((await patch({})).status).toBe(400);
  });
});

describe("PUT /api/user-profile", () => {
  it("rejects over-long fields", async () => {
    expect((await profilePUT(req("PUT", { displayName: "x".repeat(51) }))).status).toBe(400);
    expect((await profilePUT(req("PUT", { upiId: "u".repeat(101) }))).status).toBe(400);
  });
  it("rejects explicit nulls and wrong types instead of coalescing them away", async () => {
    expect((await profilePUT(req("PUT", { displayName: null }))).status).toBe(400);
    expect((await profilePUT(req("PUT", { upiId: 42 }))).status).toBe(400);
  });
  it("rejects a non-JSON body with 400", async () => {
    expect((await profilePUT(req("PUT", "not json"))).status).toBe(400);
  });
  it("accepts and trims a valid body", async () => {
    expect(UpdateUserProfileSchema.parse({ displayName: "  Ana ", upiId: " ana@upi " })).toEqual({ displayName: "Ana", upiId: "ana@upi" });
    mock.state.selects = [[]];
    const res = await profilePUT(req("PUT", { displayName: "Ana", upiId: "ana@upi" }));
    expect(res.status).toBe(200);
    expect(mock.writes.insert).toHaveBeenCalledTimes(1);
  });
});
