import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./index";

describe("authStore (useAppStore)", () => {
  beforeEach(() => {
    useAppStore.setState({
      session: null,
      authLoading: false,
    });
  });

  it("has initial session null and authLoading false", () => {
    const state = useAppStore.getState();
    expect(state.session).toBeNull();
    expect(state.authLoading).toBe(false);
  });

  it("exposes checkSession and subscribeToAuth", () => {
    const state = useAppStore.getState();
    expect(typeof state.checkSession).toBe("function");
    expect(typeof state.subscribeToAuth).toBe("function");
  });
});
