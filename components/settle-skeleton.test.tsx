// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import SettlePage from "@/app/t/[shareCode]/settle/page";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isSignedIn: false, user: null }),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ session: null, saveSession: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockUseTableData = vi.fn();
vi.mock("@/hooks/use-table-data", () => ({
  useTableData: (...args: unknown[]) => mockUseTableData(...args),
}));

vi.mock("@/lib/currency-context", () => ({
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => children,
  useCurrency: () => "INR",
}));

function mockParams(shareCode = "abc123") {
  return { params: Promise.resolve({ shareCode }) };
}

describe("SettlePage skeleton loading", () => {
  it("renders skeleton when loading", async () => {
    mockUseTableData.mockReturnValue({ data: null, loading: true, error: null, refresh: vi.fn() });
    let container: ReturnType<typeof render>["container"];
    await act(async () => {
      const result = render(<SettlePage {...mockParams()} />);
      container = result.container;
    });
    const skeletons = container!.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders settled content when data is available", async () => {
    mockUseTableData.mockReturnValue({
      data: {
        table: { id: "t1", status: "settled", currency: "INR", tip: "0" },
        items: [],
        participants: [{ id: "p1", displayName: "Alice", upiId: null }],
        selections: [],
        payments: [{ id: "pay1", participantId: "p1", amount: "500" }],
        ledger: [],
        isHost: true,
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    await act(async () => {
      render(<SettlePage {...mockParams()} />);
    });
    await waitFor(() => {
      expect(screen.getByText("All settled ✓")).toBeDefined();
    });
  });
});
