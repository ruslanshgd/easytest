import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Auth from "./Auth";

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

describe("Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email step", () => {
    render(<Auth />);
    expect(screen.getByText("Вход")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /отправить код/i })).toBeInTheDocument();
  });
});
