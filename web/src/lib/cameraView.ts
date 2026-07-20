/**
 * Preview camera modes the player can toggle in the viewport.
 * - `scene`: orbit / chase overview (drag to look around the world)
 * - `first_person`: eye-level camera locked to the player facing
 */
export type PreviewCameraView = "first_person" | "scene";

export interface CameraPoseInput {
  view: PreviewCameraView;
  /** Control scheme from the blueprint (`fps` / `drive` already prefer chase). */
  scheme: string;
  playerX: number;
  playerY: number;
  playerZ: number;
  /** Player yaw in radians (Three.js Y rotation). */
  playerYaw: number;
}

export interface CameraPoseResult {
  /** World-space look-at target for OrbitControls. */
  target: { x: number; y: number; z: number };
  /** Desired camera position when the mode drives the camera (FP / chase). */
  camera: { x: number; y: number; z: number } | null;
  /** Whether OrbitControls should accept drag/zoom. */
  orbitEnabled: boolean;
  /** Hide the local avatar mesh (true in first person). */
  hidePlayerMesh: boolean;
  /** Lerp factor for the look-at target. */
  targetFollow: number;
  /** Lerp factor toward the desired camera position (ignored when camera is null). */
  cameraFollow: number;
}

/**
 * Pure camera pose helper for the playable preview.
 * Keeps first-person vs scene math out of the Three.js hook so it is unit-testable.
 */
export function computePreviewCameraPose(input: CameraPoseInput): CameraPoseResult {
  const { view, scheme, playerX, playerY, playerZ, playerYaw } = input;

  if (view === "first_person") {
    const eyeY = playerY + (scheme === "drive" ? 1.15 : 1.55);
    // Slight forward offset avoids clipping into the avatar capsule.
    const nose = 0.18;
    const camX = playerX - Math.sin(playerYaw) * nose;
    const camZ = playerZ - Math.cos(playerYaw) * nose;
    const lookDist = 8;
    return {
      target: {
        x: playerX - Math.sin(playerYaw) * lookDist,
        y: eyeY,
        z: playerZ - Math.cos(playerYaw) * lookDist,
      },
      camera: { x: camX, y: eyeY, z: camZ },
      orbitEnabled: false,
      hidePlayerMesh: true,
      targetFollow: 0.35,
      cameraFollow: 0.35,
    };
  }

  // Scene / overview: chase for drive & fps, softer follow for walk-like schemes.
  const chase = scheme === "drive" || scheme === "fps";
  const targetFollow = chase ? 0.08 : 0.03;
  const target = {
    x: playerX,
    y: playerY + 1.2,
    z: playerZ - (chase ? 0 : 1.5),
  };

  if (!chase) {
    return {
      target,
      camera: null,
      orbitEnabled: true,
      hidePlayerMesh: false,
      targetFollow,
      cameraFollow: 0,
    };
  }

  // Over-the-shoulder chase for shooters; slightly farther / higher for cars.
  const back = scheme === "drive" ? 8 : 4.2;
  const height = scheme === "drive" ? 4.5 : 2.4;
  return {
    target: {
      x: playerX - Math.sin(playerYaw) * 2.5,
      y: playerY + 1.35,
      z: playerZ - Math.cos(playerYaw) * 2.5,
    },
    camera: {
      x: playerX + Math.sin(playerYaw) * back,
      y: playerY + height,
      z: playerZ + Math.cos(playerYaw) * back,
    },
    // Orbit drag fights chase aiming — keep it off for fps scene mode.
    orbitEnabled: scheme === "drive",
    hidePlayerMesh: false,
    targetFollow: scheme === "fps" ? 0.18 : targetFollow,
    cameraFollow: scheme === "fps" ? 0.14 : 0.06,
  };
}
