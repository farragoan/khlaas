/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import HistoryPage from "./page";

const mockUseAuth = vi.fn();
const mockUseClerk = vi.fn();
const mockPush = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
  useClerk: () => mockUseClerk(),
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sign-in-button">{children}</div>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/currency-context", () => ({
  getCurrencySymbol: (c: string) =>
    ({ INR: "\u20B9", USD: "$", EUR: "\u20AC" }[c] ?? c),
}));

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.fn();
  global.fetch = fetchSpy as typeof global.fetch;
  mockUseAuth.mockReturnValue({ isSignedIn: false, isLoaded: true });
  mockUseClerk.mockReturnValue({ openSignIn: vi.fn() });
});

afterEach(() => {
  cleanup();
});

describe("HistoryPage", () => {
  it("shows sign-in CTA when not signed in", () => {
    render(<HistoryPage />);
    expect(screen.getByText(/Sign in to see your bill history/)).toBeDefined();
    expect(screen.getByTestId("sign-in-button")).toBeDefined();
  });

  it("shows loading spinner while fetching", () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true, isLoaded: true });
    fetchSpy.mockReturnValue(new Promise(() => {}));
    render(<HistoryPage />);
    expect(document.querySelector(".animate-spin")).toBeDefined();
  });

  it("shows empty state when no bills", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true, isLoaded: true });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bills: [], nextCursor: null }),
    });
    render(<HistoryPage />);
    await waitFor(() => {
      expect(screen.getByText("No bills yet")).toBeDefined();
    });
    expect(screen.getByText("Scan a bill")).toBeDefined();
  });

  it("renders bill list with correct data", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true, isLoaded: true });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          bills: [
            {
              shareCode: "abc123",
              status: "settled",
              currency: "INR",
              createdAt: new Date().toISOString(),
              billTotal: 450,
              itemCount: 3,
              participantCount: 2,
              role: "creator",
              myParticipantId: "p1",
              myDisplayName: "Alice",
            },
            {
              shareCode: "def456",
              status: "active",
              currency: "USD",
              createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
              billTotal: 25.5,
              itemCount: 5,
              participantCount: 4,
              role: "participant",
              myParticipantId: "p2",
              myDisplayName: "Bob",
            },
          ],
          nextCursor: null,
        }),
    });
    render(<HistoryPage />);
    await waitFor(() => {
      expect(screen.getByText("Bill History")).toBeDefined();
    });
    expect(screen.getByText("Settled")).toBeDefined();
    expect(screen.getByText("Open")).toBeDefined();
    expect(screen.getByText(/as Alice/)).toBeDefined();
    expect(screen.getByText(/as Bob/)).toBeDefined();
  });

  it("shows load more button when nextCursor exists", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true, isLoaded: true });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          bills: [
            {
              shareCode: "abc123",
              status: "active",
              currency: "INR",
              createdAt: new Date().toISOString(),
              billTotal: 100,
              itemCount: 1,
              participantCount: 1,
              role: "creator",
              myParticipantId: "p1",
              myDisplayName: "Test",
            },
          ],
          nextCursor: "encoded-cursor",
        }),
    });
    render(<HistoryPage />);
    await waitFor(() => {
      expect(screen.getByText("Load more")).toBeDefined();
    });
  });
});
