// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExpiredBillView } from "./expired-bill-view";

afterEach(() => cleanup());

const table = { id: "t1", currency: "INR", status: "expired" } as never;

const items = [
  { id: "i1", name: "Biryani", quantity: 1, unitPrice: "300", totalPrice: "300", isFee: false, sortOrder: 0 },
  { id: "i2", name: "Naan", quantity: 2, unitPrice: "50", totalPrice: "100", isFee: false, sortOrder: 1 },
  { id: "i3", name: "Service charge", quantity: 1, unitPrice: "40", totalPrice: "40", isFee: true, sortOrder: 2 },
] as never[];

const participants = [
  { id: "p1", displayName: "Ana" },
  { id: "p2", displayName: "Ben" },
] as never[];

const selections = [{ participantId: "p1", itemId: "i1", quantity: 1 }];
const payments = [{ participantId: "p1", amount: "440" }] as never[];

function renderView(overrides: Record<string, unknown> = {}) {
  return render(
    <ExpiredBillView
      table={table}
      items={items}
      participants={participants}
      selections={selections}
      payments={payments}
      {...overrides}
    />
  );
}

describe("ExpiredBillView", () => {
  it("shows the bill instead of a dead end", () => {
    renderView();

    // Twice on purpose: once in the bill, once under whoever claimed it.
    expect(screen.getAllByText("Biryani")).toHaveLength(2);
    expect(screen.getByText("Service charge")).toBeDefined();
    expect(screen.getAllByText("Ben").length).toBeGreaterThan(0);
  });

  it("says the bill is locked without hiding what is on it", () => {
    renderView();

    expect(screen.getByText("This bill expired")).toBeDefined();
    expect(screen.getAllByText("Biryani").length).toBeGreaterThan(0);
  });

  it("names items nobody claimed, which is usually why it timed out", () => {
    renderView();

    expect(screen.getByText(/Never claimed: Naan/)).toBeDefined();
  });

  it("offers no way to change anything", () => {
    const { container } = renderView();

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("explains an empty bill rather than rendering a blank page", () => {
    renderView({ items: [], selections: [], payments: [] });

    expect(screen.getByText(/expired before a receipt was scanned/)).toBeDefined();
  });
});
