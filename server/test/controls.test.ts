import { describe, expect, it } from "vitest";
import {
  actionAxis,
  controlProfileFor,
  defaultSchemeForGenre,
  isActionDown,
  profileKeyCodes,
} from "@ai-gamedev/shared";

describe("control profiles", () => {
  it("maps genres to the right scheme", () => {
    expect(defaultSchemeForGenre("racing")).toBe("drive");
    expect(defaultSchemeForGenre("shooter")).toBe("fps");
    expect(defaultSchemeForGenre("exploration")).toBe("walk");
  });

  it("gives racing handbrake on Space and boost on Shift", () => {
    const drive = controlProfileFor("drive");
    expect(drive.bindings.find((b) => b.action === "handbrake")?.keys).toContain("Space");
    expect(drive.bindings.find((b) => b.action === "boost")?.keys).toContain("ShiftLeft");
    expect(drive.hudLine.toLowerCase()).toContain("handbrake");
  });

  it("gives shooters fire/reload and turn keys for aimable archery", () => {
    const fps = controlProfileFor("fps");
    expect(fps.bindings.find((b) => b.action === "fire")?.keys).toContain("Space");
    expect(fps.bindings.find((b) => b.action === "reload")?.keys).toContain("KeyR");
    expect(fps.bindings.find((b) => b.action === "turnLeft")?.keys).toContain("ArrowLeft");
    expect(fps.bindings.find((b) => b.action === "turnRight")?.keys).toContain("ArrowRight");
    expect(fps.hudLine.toLowerCase()).toContain("turn");

    const walk = controlProfileFor("walk");
    expect(walk.bindings.find((b) => b.action === "fire")).toBeUndefined();
    expect(walk.bindings.find((b) => b.action === "interact")?.keys).toContain("KeyE");
  });

  it("evaluates held keys against the active profile", () => {
    const drive = controlProfileFor("drive");
    const keys = new Set(["KeyW", "Space"]);
    expect(isActionDown(drive, "accelerate", keys)).toBe(true);
    expect(isActionDown(drive, "handbrake", keys)).toBe(true);
    expect(isActionDown(drive, "brake", keys)).toBe(false);
    expect(actionAxis(drive, "accelerate", "brake", keys)).toBe(1);
    expect(profileKeyCodes(drive).has("Space")).toBe(true);
  });
});
