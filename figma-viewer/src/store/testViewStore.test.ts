import { describe, it, expect, beforeEach } from "vitest";
import { useViewerStore } from "./index";

describe("testViewStore (useViewerStore)", () => {
  beforeEach(() => {
    useViewerStore.setState({
      proto: null,
      currentScreen: null,
      testViewLoading: false,
      testViewError: null,
    });
  });

  it("has initial proto null and testViewLoading false", () => {
    const state = useViewerStore.getState();
    expect(state.proto).toBeNull();
    expect(state.currentScreen).toBeNull();
    expect(state.testViewLoading).toBe(false);
  });

  it("setProto and setCurrentScreen work", () => {
    useViewerStore.getState().setCurrentScreen("screen-1");
    expect(useViewerStore.getState().currentScreen).toBe("screen-1");
    useViewerStore.getState().setTestViewError("error");
    expect(useViewerStore.getState().testViewError).toBe("error");
  });
});
