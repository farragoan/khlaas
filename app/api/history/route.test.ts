import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...init?.headers as Record<string, string> },
      }),
  },
}));

// Each db.select() call increments a counter. The pre-set array of results
// is consumed in order. Every chain method (from/where/orderBy/groupBy/limit)
// returns the same chain, which is also thenable — so it can be both awaited
// directly (ending at .where()) or continued with further methods.
const allResults: unknown[][] = [];
let callIdx = 0;

function makeThenableChain(idx: number) {
  const resolved = Promise.resolve(allResults[idx] ?? []);
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    groupBy: vi.fn(),
    limit: vi.fn(),
    then: resolved.then.bind(resolved),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.groupBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

vi.mock("@/lib/db/client", () => ({
  get db() {
    return {
      select: (..._args: unknown[]) => {
        const idx = callIdx++;
        return makeThenableChain(idx);
      },
    };
  },
}));

import { fetchHistoryPage, GET } from "./route";

function table(overrides: Record<string, unknown> = {}) {
  return {
    id: "table-1",
    shareCode: "abc123",
    createdAt: new Date("2025-01-15T10:00:00Z"),
    status: "items_ready",
    currency: "INR",
    tip: "0",
    createdBy: "user-1",
    ...overrides,
  };
}

describe("fetchHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callIdx = 0;
    allResults.length = 0;
  });

  it("returns empty list for user with no tables", async () => {
    allResults[0] = [];
    allResults[1] = [];

    const result = await fetchHistoryPage("user-1", null, 20);
    expect(result.bills).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("returns bills with correct shape and enriched fields", async () => {
    allResults[0] = [{ tableId: "t1" }];
    allResults[1] = [table({ id: "t1" })];
    allResults[2] = [{ tableId: "t1", itemCount: "3", subtotal: "150.00" }];
    allResults[3] = [];
    allResults[4] = [{ tableId: "t1", participantCount: "2" }];
    allResults[5] = [{ tableId: "t1", id: "p1", displayName: "Alice" }];

    const result = await fetchHistoryPage("user-1", null, 20);
    expect(result.bills).toHaveLength(1);
    expect(result.bills[0]).toMatchObject({
      shareCode: "abc123",
      billTotal: 150,
      itemCount: 3,
      participantCount: 2,
      myDisplayName: "Alice",
    });
  });

  it("sums subtotal + fees + tip for billTotal", async () => {
    allResults[0] = [];
    allResults[1] = [table({ id: "t1", tip: "50" })];
    allResults[2] = [{ tableId: "t1", itemCount: "2", subtotal: "200.00" }];
    allResults[3] = [{ tableId: "t1", totalFees: "30.00" }];
    allResults[4] = [{ tableId: "t1", participantCount: "1" }];
    allResults[5] = [];

    const result = await fetchHistoryPage("user-1", null, 20);
    expect(result.bills[0].billTotal).toBe(280);
  });

  it("generates nextCursor when results exceed limit", async () => {
    allResults[0] = [];
    allResults[1] = [table({ id: "t1" }), table({ id: "t2", shareCode: "xyz" })];
    allResults[2] = [];
    allResults[3] = [];
    allResults[4] = [];
    allResults[5] = [];

    const result = await fetchHistoryPage("user-1", null, 1);
    expect(result.bills).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });

  it("decodes base64 cursor for pagination", async () => {
    const cursor = Buffer.from(JSON.stringify({ createdAt: "2025-01-15T10:00:00Z", id: "t1" })).toString("base64");
    allResults[0] = [];
    allResults[1] = [];

    const result = await fetchHistoryPage("user-1", cursor, 20);
    expect(result.bills).toEqual([]);
  });

  it("handles invalid cursor without crashing", async () => {
    allResults[0] = [];
    allResults[1] = [];

    const result = await fetchHistoryPage("user-1", "%%%bad%%%", 20);
    expect(result.bills).toEqual([]);
  });

  it("role=creator when user created but did not join", async () => {
    allResults[0] = [];
    allResults[1] = [table()];
    allResults[2] = [];
    allResults[3] = [];
    allResults[4] = [{ tableId: "t1", participantCount: "1" }];
    allResults[5] = [];

    const result = await fetchHistoryPage("user-1", null, 20);
    expect(result.bills[0].role).toBe("creator");
  });

  it("role=participant when user joined but did not create", async () => {
    allResults[0] = [{ tableId: "t1" }];
    allResults[1] = [table({ createdBy: "other" })];
    allResults[2] = [];
    allResults[3] = [];
    allResults[4] = [{ tableId: "t1", participantCount: "1" }];
    allResults[5] = [{ tableId: "t1", id: "p1", displayName: "X" }];

    const result = await fetchHistoryPage("user-1", null, 20);
    expect(result.bills[0].role).toBe("participant");
  });

  it("role=both when user created and joined", async () => {
    allResults[0] = [{ tableId: "t1" }];
    allResults[1] = [table({ id: "t1" })];
    allResults[2] = [];
    allResults[3] = [];
    allResults[4] = [{ tableId: "t1", participantCount: "1" }];
    allResults[5] = [{ tableId: "t1", id: "p1", displayName: "Me" }];

    const result = await fetchHistoryPage("user-1", null, 20);
    expect(result.bills[0].role).toBe("both");
  });
});

describe("GET handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callIdx = 0;
    allResults.length = 0;
  });

  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET(new Request("http://localhost/api/history"));
    expect(res.status).toBe(401);
  });

  it("200 with empty bills for new user", async () => {
    mockAuth.mockResolvedValue({ userId: "u1" });
    allResults[0] = [];
    allResults[1] = [];

    const res = await GET(new Request("http://localhost/api/history"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.bills).toEqual([]);
  });

  it("handles limit and cursor params", async () => {
    mockAuth.mockResolvedValue({ userId: "u1" });
    allResults[0] = [];
    allResults[1] = [];

    const cursor = Buffer.from(JSON.stringify({ createdAt: "2025-01-01T00:00:00Z", id: "x" })).toString("base64");
    const res = await GET(new Request(`http://localhost/api/history?limit=5&cursor=${cursor}`));
    expect(res.status).toBe(200);
  });
});
