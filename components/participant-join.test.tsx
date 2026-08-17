// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ParticipantJoin } from "./participant-join";

vi.mock("@clerk/nextjs", () => ({
  useUser: vi.fn(),
  useClerk: vi.fn(),
  GoogleOneTap: () => <div data-testid="google-one-tap" />,
}));

import { useUser, useClerk } from "@clerk/nextjs";

const mockOpenSignIn = vi.fn();
const mockOnJoined = vi.fn();

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useClerk).mockReturnValue({ openSignIn: mockOpenSignIn } as never);
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

function mockSignedOut() {
  vi.mocked(useUser).mockReturnValue({
    isSignedIn: false,
    user: null,
  } as never);
}

function mockSignedIn(name = "Test User") {
  vi.mocked(useUser).mockReturnValue({
    isSignedIn: true,
    user: { fullName: name, firstName: name.split(" ")[0] },
  } as never);
}

describe("ParticipantJoin", () => {
  describe("signed-in user", () => {
    it("shows join button with name, no name input field", () => {
      mockSignedIn("Alice Smith");
      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);

      expect(screen.getByText("Join as Alice Smith")).toBeDefined();
      expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    });

    it("joins automatically when clicking the button", async () => {
      mockSignedIn("Bob");
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ participantId: "p1" }),
        } as never);

      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);
      fireEvent.click(screen.getByText("Join as Bob"));

      await waitFor(() => {
        expect(mockOnJoined).toHaveBeenCalledWith({
          participantId: "p1",
          displayName: "Bob",
          sessionToken: expect.any(String),
          tableId: "t1",
        });
      });
    });
  });

  describe("signed-out user", () => {
    it("shows both sign-in and guest options", () => {
      mockSignedOut();
      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);

      expect(screen.getByText("Continue with Google")).toBeDefined();
      expect(screen.getByText("Continue as guest")).toBeDefined();
      expect(screen.getByTestId("google-one-tap")).toBeDefined();
    });

    it("does not render One Tap once signed in", () => {
      mockSignedIn();
      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);

      expect(screen.queryByTestId("google-one-tap")).toBeNull();
    });

    it("opens sign-in modal when clicking sign-in button", () => {
      mockSignedOut();
      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);
      fireEvent.click(screen.getByText("Continue with Google"));

      // withSignUp keeps new and returning users on one flow — without it,
      // an unrecognised Google account dead-ends on external_account_not_found.
      expect(mockOpenSignIn).toHaveBeenCalledWith({ withSignUp: true });
    });

    it("shows name form when clicking continue as guest", () => {
      mockSignedOut();
      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);
      fireEvent.click(screen.getByText("Continue as guest"));

      expect(screen.getByPlaceholderText("Your name")).toBeDefined();
      expect(screen.getByText("Join table")).toBeDefined();
    });
  });

  describe("guest flow", () => {
    it("collects name and joins", async () => {
      mockSignedOut();
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ participantId: "p2" }),
      } as never);

      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);
      fireEvent.click(screen.getByText("Continue as guest"));

      const input = screen.getByPlaceholderText("Your name");
      fireEvent.change(input, { target: { value: "Guest User" } });
      fireEvent.click(screen.getByText("Join table"));

      await waitFor(() => {
        expect(mockOnJoined).toHaveBeenCalledWith({
          participantId: "p2",
          displayName: "Guest User",
          sessionToken: expect.any(String),
          tableId: "t1",
        });
      });
    });

    it("shows sign-in link from guest form", () => {
      mockSignedOut();
      render(<ParticipantJoin tableId="t1" onJoined={mockOnJoined} />);
      fireEvent.click(screen.getByText("Continue as guest"));

      const signInLink = screen.getByText(
        "Sign in instead to save your bill history"
      );
      fireEvent.click(signInLink);

      expect(screen.getByText("Continue with Google")).toBeDefined();
      expect(screen.getByText("Continue as guest")).toBeDefined();
    });
  });
});
