import { describe, expect, it } from "vitest";
import {
  isTypingTarget,
  movementYaw,
  shouldLeaveKeyToUi,
} from "../src/lib/inputPolicy.js";

describe("isTypingTarget", () => {
  it("detects text inputs, textareas and contenteditable", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("ignores non-typing targets", () => {
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe("shouldLeaveKeyToUi", () => {
  it("always leaves keys to typing targets", () => {
    expect(shouldLeaveKeyToUi({ tagName: "INPUT" }, "KeyW")).toBe(true);
    expect(shouldLeaveKeyToUi({ tagName: "TEXTAREA" }, "Space")).toBe(true);
  });

  it("leaves activation keys to focused buttons but keeps movement keys", () => {
    expect(shouldLeaveKeyToUi({ tagName: "BUTTON" }, "Space")).toBe(true);
    expect(shouldLeaveKeyToUi({ tagName: "BUTTON" }, "Enter")).toBe(true);
    // WASD must reach the game even right after clicking a toolbar button.
    expect(shouldLeaveKeyToUi({ tagName: "BUTTON" }, "KeyW")).toBe(false);
    expect(shouldLeaveKeyToUi({ tagName: "BUTTON" }, "ArrowUp")).toBe(false);
  });

  it("captures everything when the canvas or body is the target", () => {
    expect(shouldLeaveKeyToUi({ tagName: "CANVAS" }, "Space")).toBe(false);
    expect(shouldLeaveKeyToUi({ tagName: "BODY" }, "KeyW")).toBe(false);
    expect(shouldLeaveKeyToUi(null, "KeyW")).toBe(false);
  });
});

describe("movementYaw", () => {
  it("faces -Z (forward convention) when moving up the screen", () => {
    // W: axisZ = -1 → yaw 0, matching first-person look and projectile spawn.
    expect(movementYaw(0, -1)).toBeCloseTo(0);
  });

  it("faces the movement direction on all axes", () => {
    // S: toward +Z — atan2 yields ±π depending on zero sign; same heading.
    expect(Math.abs(movementYaw(0, 1))).toBeCloseTo(Math.PI);
    expect(movementYaw(1, 0)).toBeCloseTo(-Math.PI / 2); // D: toward +X
    expect(movementYaw(-1, 0)).toBeCloseTo(Math.PI / 2); // A: toward -X
  });
});
