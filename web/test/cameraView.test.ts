import { describe, expect, it } from "vitest";
import { computePreviewCameraPose } from "../src/lib/cameraView.js";

describe("computePreviewCameraPose", () => {
  it("places an eye-level first-person camera looking along yaw", () => {
    const yaw = 0; // facing -Z in Three.js convention used by the preview
    const pose = computePreviewCameraPose({
      view: "first_person",
      scheme: "fps",
      playerX: 2,
      playerY: 1,
      playerZ: 4,
      playerYaw: yaw,
    });

    expect(pose.orbitEnabled).toBe(false);
    expect(pose.hidePlayerMesh).toBe(true);
    expect(pose.camera).not.toBeNull();
    expect(pose.camera!.y).toBeCloseTo(2.55, 2);
    // Looking forward (-Z): target.z should be less than player Z.
    expect(pose.target.z).toBeLessThan(4);
    expect(pose.target.x).toBeCloseTo(2, 2);
  });

  it("keeps scene orbit enabled for walk schemes without forcing camera", () => {
    const pose = computePreviewCameraPose({
      view: "scene",
      scheme: "walk",
      playerX: 0,
      playerY: 0.6,
      playerZ: 0,
      playerYaw: Math.PI / 2,
    });

    expect(pose.orbitEnabled).toBe(true);
    expect(pose.hidePlayerMesh).toBe(false);
    expect(pose.camera).toBeNull();
    expect(pose.target.y).toBeCloseTo(1.8, 2);
  });

  it("uses chase camera behind the player for scene + fps", () => {
    const yaw = Math.PI / 2; // +X side
    const pose = computePreviewCameraPose({
      view: "scene",
      scheme: "fps",
      playerX: 0,
      playerY: 1,
      playerZ: 0,
      playerYaw: yaw,
    });

    expect(pose.orbitEnabled).toBe(true);
    expect(pose.camera).not.toBeNull();
    expect(pose.camera!.x).toBeCloseTo(6, 2);
    expect(pose.camera!.y).toBeCloseTo(4.2, 2);
  });
});
