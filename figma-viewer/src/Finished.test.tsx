import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Finished from "./Finished";

vi.mock("./supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe("Finished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders congratulations and feedback form when no sessionId", () => {
    render(
      <MemoryRouter initialEntries={["/finished"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/finished/:sessionId?" element={<Finished />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/Поздравляем! Вы завершили тест!/)).toBeInTheDocument();
    expect(screen.getByText(/ответьте на несколько вопросов/)).toBeInTheDocument();
  });
});
