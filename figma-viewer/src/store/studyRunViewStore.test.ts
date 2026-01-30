import { describe, it, expect, beforeEach } from "vitest";
import { useViewerStore } from "./index";

describe("studyRunViewStore (useViewerStore)", () => {
  beforeEach(() => {
    useViewerStore.setState({
      studyData: null,
      runId: null,
      currentBlockIndex: 0,
      studyRunLoading: false,
      studyRunError: null,
      finished: false,
    });
  });

  it("has initial studyData null and currentBlockIndex 0", () => {
    const state = useViewerStore.getState();
    expect(state.studyData).toBeNull();
    expect(state.runId).toBeNull();
    expect(state.currentBlockIndex).toBe(0);
    expect(state.finished).toBe(false);
  });

  it("setStudyData and setCurrentBlockIndex work", () => {
    const mockStudyData = {
      study: { id: "s1", title: "Test", status: "draft" },
      blocks: [],
    };
    useViewerStore.getState().setStudyData(mockStudyData);
    expect(useViewerStore.getState().studyData).toEqual(mockStudyData);
    useViewerStore.getState().setCurrentBlockIndex(2);
    expect(useViewerStore.getState().currentBlockIndex).toBe(2);
  });
});
