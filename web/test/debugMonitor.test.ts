import { describe, expect, it } from "vitest";
import { controlProfileFor } from "@ai-gamedev/shared";
import {
  activeActions,
  buildDebugSnapshot,
  debugMonitorSections,
  formatDebugMonitorText,
  formatFixed,
  radToDeg,
  shortKeyLabel,
  type PreviewDebugSnapshot,
} from "../src/lib/debugMonitor.js";

function stubSnap(overrides: Partial<PreviewDebugSnapshot> = {}): PreviewDebugSnapshot {
  return {
    at: 1,
    fps: 60,
    frameMs: 16.6,
    scheme: "walk",
    schemeLabel: "Exploration",
    cameraView: "scene",
    cameraFov: 50,
    keys: ["KeyW", "ShiftLeft"],
    actions: ["moveForward", "sprint"],
    player: {
      position: { x: 1.25, y: 0.6, z: 3.5 },
      yawDeg: 45,
      speed: 7,
      driveVelocity: 0,
      jumpOffset: 0,
      crouching: false,
      aiming: false,
      avatar: "capsule",
    },
    session: {
      status: "playing",
      health: 100,
      ammo: 0,
      score: 0,
      lives: 3,
      message: "Go",
      objectives: [{ id: "c", label: "collectibles", progress: 1, target: 3 }],
    },
    near: { id: "m1", name: "glowing mushroom", dist: 1.4, hint: "Pick a glowing mushroom" },
    collected: 1,
    checkpoints: 0,
    fireCooldown: 0,
    projectiles: 0,
    entityCount: 35,
    interactiveVisible: 3,
    ...overrides,
  };
}

describe("shortKeyLabel", () => {
  it("shortens common codes", () => {
    expect(shortKeyLabel("KeyW")).toBe("W");
    expect(shortKeyLabel("ArrowLeft")).toBe("Left");
    expect(shortKeyLabel("Space")).toBe("Spc");
    expect(shortKeyLabel("ShiftLeft")).toBe("Shf");
    expect(shortKeyLabel("Mouse0")).toBe("M0");
  });
});

describe("activeActions", () => {
  it("lists only the profile actions currently held", () => {
    const walk = controlProfileFor("walk");
    const keys = new Set(["KeyW", "ShiftLeft", "KeyQ"]);
    expect(activeActions(walk, keys)).toEqual(["moveForward", "sprint"]);
  });

  it("sees mouse fire on the fps profile", () => {
    const fps = controlProfileFor("fps");
    expect(activeActions(fps, new Set(["Mouse0"]))).toEqual(["fire"]);
  });
});

describe("debugMonitorSections", () => {
  it("surfaces input, player, near entity and session rows", () => {
    const sections = debugMonitorSections(stubSnap());
    expect(sections.map((s) => s.title)).toEqual(["Input", "Player", "Session", "View"]);
    const input = sections[0];
    expect(input.rows.find((r) => r.label === "keys")?.value).toContain("W");
    expect(input.rows.find((r) => r.label === "actions")?.value).toContain("sprint");
    const session = sections[2];
    expect(session.rows.find((r) => r.label === "near")?.value).toMatch(/glowing mushroom/);
    expect(session.rows.find((r) => r.label === "objectives")?.value).toContain("1/3");
  });

  it("formats a pasteable text dump", () => {
    const text = formatDebugMonitorText(stubSnap());
    expect(text).toContain("[Input]");
    expect(text).toContain("pos:");
    expect(text).toContain("collectibles 1/3");
  });
});

describe("numeric helpers", () => {
  it("converts radians and formats finite numbers", () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
    expect(formatFixed(1.2345, 2)).toBe("1.23");
    expect(formatFixed(Number.NaN)).toBe("—");
  });
});

describe("buildDebugSnapshot", () => {
  it("maps live runtime fields into the monitor snapshot", () => {
    const walk = controlProfileFor("walk");
    const snap = buildDebugSnapshot({
      delta: 0.016,
      profile: walk,
      keys: new Set(["KeyE"]),
      cameraView: "scene",
      cameraFov: 50,
      player: {
        x: 0,
        y: 0.6,
        z: 4,
        yaw: 0,
        speed: 7,
        driveVelocity: 0,
        jumpOffset: 0,
        crouching: false,
        aiming: false,
        avatar: "capsule",
      },
      session: null,
      near: { id: "m1", name: "mushroom", dist: 1.1 },
      collected: 0,
      checkpoints: 0,
      fireCooldown: 0,
      projectiles: 0,
      entityCount: 10,
      interactiveVisible: 2,
      now: 42,
    });
    expect(snap.at).toBe(42);
    expect(snap.actions).toEqual(["interact"]);
    expect(snap.session.status).toBe("none");
    expect(snap.near?.name).toBe("mushroom");
    expect(snap.fps).toBeCloseTo(62.5, 0);
  });
});
