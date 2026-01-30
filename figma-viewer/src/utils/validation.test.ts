import { describe, it, expect } from "vitest";
import { isValidUUID, validateUUID } from "./validation";

describe("validation", () => {
  describe("isValidUUID", () => {
    it("returns true for valid UUID", () => {
      expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(isValidUUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
    });

    it("returns false for null and undefined", () => {
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidUUID("")).toBe(false);
    });

    it("returns false for invalid format", () => {
      expect(isValidUUID("not-a-uuid")).toBe(false);
      expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
      expect(isValidUUID("550e8400e29b41d4a716446655440000")).toBe(false);
    });
  });

  describe("validateUUID", () => {
    it("does not throw for valid UUID", () => {
      expect(() => validateUUID("550e8400-e29b-41d4-a716-446655440000")).not.toThrow();
    });

    it("throws for invalid UUID", () => {
      expect(() => validateUUID("invalid")).toThrow("Invalid UUID format");
      expect(() => validateUUID(null)).toThrow();
      expect(() => validateUUID("")).toThrow();
    });

    it("uses custom fieldName in error", () => {
      expect(() => validateUUID("bad", "prototypeId")).toThrow("Invalid prototypeId format");
    });
  });
});
