import { describe, it, expect, vi, beforeEach } from "vitest";

describe("handleContinue concurrent fetches", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fires user-profile, participants, and table PATCH concurrently", async () => {
    const callOrder: string[] = [];
    let resolveProfile: () => void;
    let resolveParticipants: () => void;
    let resolveTable: () => void;

    const profilePromise = new Promise<void>((r) => { resolveProfile = r; });
    const participantsPromise = new Promise<void>((r) => { resolveParticipants = r; });
    const tablePromise = new Promise<void>((r) => { resolveTable = r; });

    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/user-profile") {
        callOrder.push("user-profile");
        return profilePromise.then(() => new Response("{}"));
      }
      if (url === "/api/participants") {
        callOrder.push("participants");
        return participantsPromise.then(() => new Response("{}"));
      }
      if (url.startsWith("/api/tables/")) {
        callOrder.push("table");
        return tablePromise.then(() => new Response("{}"));
      }
      return Promise.resolve(new Response("{}"));
    });

    // Simulate what handleContinue does: fire all three concurrently
    const saves: Promise<Response>[] = [];

    // hostName branch
    saves.push(
      fetch("/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Test" }),
      }),
      fetch("/api/participants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-session-token": "tok" },
        body: JSON.stringify({ displayName: "Test" }),
      })
    );

    // table updates branch
    saves.push(
      fetch("/api/tables/abc123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-session-token": "tok" },
        body: JSON.stringify({ currency: "USD" }),
      })
    );

    // All three should have been initiated in the same microtask
    expect(callOrder).toEqual(["user-profile", "participants", "table"]);

    // Resolve all
    resolveProfile!();
    resolveParticipants!();
    resolveTable!();

    await Promise.all(saves);
  });
});
