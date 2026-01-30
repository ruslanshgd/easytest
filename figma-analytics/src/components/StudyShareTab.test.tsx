import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StudyShareTab from "./StudyShareTab";

describe("StudyShareTab", () => {
  it("renders loading state when loading is true", () => {
    render(
      <StudyShareTab
        studyId="study-1"
        studyStatus="draft"
        shareToken="token-123"
        loading={true}
      />
    );
    expect(screen.getByText(/Загрузка токена/)).toBeInTheDocument();
  });

  it("renders error when shareToken is null", () => {
    render(
      <StudyShareTab
        studyId="study-1"
        studyStatus="draft"
        shareToken={null}
      />
    );
    expect(screen.getByText(/токен для ссылки не найден/)).toBeInTheDocument();
  });

  it("renders status label for draft", () => {
    render(
      <StudyShareTab
        studyId="study-1"
        studyStatus="draft"
        shareToken="abc-123"
      />
    );
    expect(screen.getByText("Не опубликован")).toBeInTheDocument();
  });

  it("renders status label for published", () => {
    render(
      <StudyShareTab
        studyId="study-1"
        studyStatus="published"
        shareToken="abc-123"
      />
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Опубликован");
  });

  it("renders status label for stopped", () => {
    render(
      <StudyShareTab
        studyId="study-1"
        studyStatus="stopped"
        shareToken="abc-123"
      />
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Остановлен");
  });
});
