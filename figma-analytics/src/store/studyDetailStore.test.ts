import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./index";

describe("studyDetailStore (useAppStore)", () => {
  beforeEach(() => {
    useAppStore.setState({
      activeTab: "builder",
      showAddBlockModal: false,
      editingBlockId: null,
      newBlockType: "prototype",
      selectedPrototypeId: "",
    });
  });

  it("has initial activeTab builder and newBlockType prototype", () => {
    const state = useAppStore.getState();
    expect(state.activeTab).toBe("builder");
    expect(state.newBlockType).toBe("prototype");
    expect(state.showAddBlockModal).toBe(false);
    expect(state.editingBlockId).toBeNull();
  });

  it("setActiveTab updates activeTab", () => {
    useAppStore.getState().setActiveTab("results");
    expect(useAppStore.getState().activeTab).toBe("results");
    useAppStore.getState().setActiveTab("share");
    expect(useAppStore.getState().activeTab).toBe("share");
  });

  it("setNewBlockType and resetBlockForm work", () => {
    useAppStore.getState().setNewBlockType("open_question");
    expect(useAppStore.getState().newBlockType).toBe("open_question");
    useAppStore.getState().resetBlockForm();
    expect(useAppStore.getState().newBlockType).toBe("prototype");
  });
});
