// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import TablePage from "@/app/t/[shareCode]/page";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isSignedIn: false, user: null }),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ session: null, saveSession: vi.fn() }),
}));

const mockUseTableData = vi.fn();
vi.mock("@/hooks/use-table-data", () => ({
  useTableData: (...args: unknown[]) => mockUseTableData(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/currency-context", () => ({
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => children,
  getCurrencySymbol: () => "₹",
}));

function mockParams(shareCode = "abc123") {
  return { params: Promise.resolve({ shareCode }) };
}

describe("TablePage skeleton loading", () => {
  it("renders skeleton when loading", async () => {
    mockUseTableData.mockReturnValue({ data: null, loading: true, error: null, refresh: vi.fn() });
    let container: ReturnType<typeof render>["container"];
    await act(async () => {
      const result = render(<TablePage {...mockParams()} />);
      container = result.container;
    });
    const skeletons = container!.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error state when data is null and not loading", async () => {
    mockUseTableData.mockReturnValue({ data: null, loading: false, error: "Table not found", refresh: vi.fn() });
    await act(async () => {
      render(<TablePage {...mockParams()} />);
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain("Table not found");
    });
  });
});
