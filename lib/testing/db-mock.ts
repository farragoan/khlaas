import { vi } from "vitest";

/**
 * A scripted drizzle stand-in for route tests: each `select()` call consumes the
 * next entry of `selects` (in call order); insert/update/delete are spies whose
 * builders resolve to `writeResult`. Good enough to prove which writes a route
 * does or does not attempt; real SQL is covered against PGlite elsewhere.
 */
export function makeDbMock() {
  const state = { selects: [] as unknown[][], writeResult: [] as unknown[], cursor: 0 };
  const writes = { insert: vi.fn(), update: vi.fn(), delete: vi.fn() };

  function chain(result: () => unknown[]) {
    const c: Record<string, unknown> = {};
    const p = () => Promise.resolve(result());
    for (const m of [
      "from", "where", "orderBy", "innerJoin", "leftJoin", "limit", "groupBy",
      "values", "set", "returning", "onConflictDoNothing", "onConflictDoUpdate",
    ]) {
      c[m] = () => c;
    }
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p().then(res, rej);
    c.catch = (rej: (e: unknown) => unknown) => p().catch(rej);
    return c;
  }

  const db = {
    select: () => {
      const i = state.cursor++;
      return chain(() => state.selects[i] ?? []);
    },
    insert: (...a: unknown[]) => (writes.insert(...a), chain(() => state.writeResult)),
    update: (...a: unknown[]) => (writes.update(...a), chain(() => state.writeResult)),
    delete: (...a: unknown[]) => (writes.delete(...a), chain(() => state.writeResult)),
    execute: vi.fn(),
  };

  return {
    db,
    writes,
    state,
    reset() {
      state.selects = [];
      state.writeResult = [];
      state.cursor = 0;
      writes.insert.mockClear();
      writes.update.mockClear();
      writes.delete.mockClear();
      db.execute.mockReset();
    },
  };
}
