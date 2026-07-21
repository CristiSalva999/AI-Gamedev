/**
 * Genre-aware input mapping. Every build carries a {@link ControlProfile} so
 * the viewport, HUD, and packaged runner share the same bindings — racing gets
 * throttle/steer/handbrake, shooters get fire/reload/aim, exploration gets
 * interact/sprint, etc.
 */

import type { ControlScheme, GenreKind } from "./gameDesign.js";

/** Semantic actions the runtime understands. */
export type ControlAction =
  | "moveForward"
  | "moveBack"
  | "moveLeft"
  | "moveRight"
  | "turnLeft"
  | "turnRight"
  | "interact"
  | "jump"
  | "sprint"
  | "accelerate"
  | "brake"
  | "steerLeft"
  | "steerRight"
  | "handbrake"
  | "boost"
  | "fire"
  | "aim"
  | "reload"
  | "crouch";

export interface ControlBinding {
  action: ControlAction;
  /** `KeyboardEvent.code` values (e.g. "KeyW", "Space"). */
  keys: string[];
  /** Short label for HUD / docs (e.g. "W", "Space"). */
  label: string;
  /** Optional longer hint shown in the control legend. */
  hint?: string;
}

export interface ControlProfile {
  scheme: ControlScheme;
  /** Human-readable scheme name for the HUD title. */
  label: string;
  bindings: ControlBinding[];
  /** Compact one-line HUD string. */
  hudLine: string;
}

/** Resolve the control scheme for a genre when the design doc omits one. */
export function defaultSchemeForGenre(genre: GenreKind): ControlScheme {
  switch (genre) {
    case "racing":
      return "drive";
    case "shooter":
      return "fps";
    case "exploration":
    case "dungeon":
    case "survival":
    case "horror":
    case "sandbox":
      return "walk";
    default: {
      const _never: never = genre;
      return _never;
    }
  }
}

/** Build the canonical binding table for a scheme. */
export function controlProfileFor(scheme: ControlScheme): ControlProfile {
  switch (scheme) {
    case "drive":
      return {
        scheme,
        label: "Arcade driving",
        bindings: [
          { action: "accelerate", keys: ["KeyW", "ArrowUp"], label: "W", hint: "Accelerate" },
          { action: "brake", keys: ["KeyS", "ArrowDown"], label: "S", hint: "Brake / reverse" },
          { action: "steerLeft", keys: ["KeyA", "ArrowLeft"], label: "A", hint: "Steer left" },
          { action: "steerRight", keys: ["KeyD", "ArrowRight"], label: "D", hint: "Steer right" },
          { action: "handbrake", keys: ["Space"], label: "Space", hint: "Handbrake" },
          { action: "boost", keys: ["ShiftLeft", "ShiftRight"], label: "Shift", hint: "Boost" },
        ],
        hudLine: "W/S accel·brake · A/D steer · Space handbrake · Shift boost",
      };
    case "fps":
      return {
        scheme,
        label: "Shooter",
        bindings: [
          { action: "moveForward", keys: ["KeyW"], label: "W", hint: "Move forward" },
          { action: "moveBack", keys: ["KeyS"], label: "S", hint: "Move back" },
          { action: "moveLeft", keys: ["KeyA"], label: "A", hint: "Strafe left" },
          { action: "moveRight", keys: ["KeyD"], label: "D", hint: "Strafe right" },
          { action: "turnLeft", keys: ["ArrowLeft", "KeyQ"], label: "←/Q", hint: "Turn left" },
          { action: "turnRight", keys: ["ArrowRight", "KeyE"], label: "→/E", hint: "Turn right" },
          { action: "fire", keys: ["Space", "Mouse0"], label: "Space/Click", hint: "Fire" },
          { action: "aim", keys: ["Mouse2", "ControlLeft"], label: "Ctrl", hint: "Aim / ADS" },
          { action: "reload", keys: ["KeyR"], label: "R", hint: "Reload" },
          { action: "sprint", keys: ["ShiftLeft", "ShiftRight"], label: "Shift", hint: "Sprint" },
          { action: "crouch", keys: ["KeyC"], label: "C", hint: "Crouch" },
        ],
        hudLine:
          "WASD move · ←→/Q E turn · Space/click fire · Ctrl aim · R reload · Shift sprint · C crouch",
      };
    case "twin_stick":
      return {
        scheme,
        label: "Twin-stick",
        bindings: [
          { action: "moveForward", keys: ["KeyW"], label: "W", hint: "Move up" },
          { action: "moveBack", keys: ["KeyS"], label: "S", hint: "Move down" },
          { action: "moveLeft", keys: ["KeyA"], label: "A", hint: "Move left" },
          { action: "moveRight", keys: ["KeyD"], label: "D", hint: "Move right" },
          { action: "aim", keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"], label: "Arrows", hint: "Aim" },
          { action: "fire", keys: ["Space"], label: "Space", hint: "Fire" },
          { action: "interact", keys: ["KeyE"], label: "E", hint: "Interact" },
        ],
        hudLine: "WASD move · Arrows aim · Space fire · E interact",
      };
    case "fly":
      return {
        scheme,
        label: "Flight",
        bindings: [
          { action: "moveForward", keys: ["KeyW", "ArrowUp"], label: "W", hint: "Thrust forward" },
          { action: "moveBack", keys: ["KeyS", "ArrowDown"], label: "S", hint: "Thrust back" },
          { action: "moveLeft", keys: ["KeyA", "ArrowLeft"], label: "A", hint: "Strafe left" },
          { action: "moveRight", keys: ["KeyD", "ArrowRight"], label: "D", hint: "Strafe right" },
          { action: "jump", keys: ["Space"], label: "Space", hint: "Climb" },
          { action: "crouch", keys: ["ControlLeft", "ControlRight"], label: "Ctrl", hint: "Descend" },
          { action: "boost", keys: ["ShiftLeft", "ShiftRight"], label: "Shift", hint: "Boost" },
          { action: "fire", keys: ["KeyF"], label: "F", hint: "Fire" },
        ],
        hudLine: "WASD thrust · Space/Ctrl up·down · Shift boost · F fire",
      };
    case "walk":
      return {
        scheme,
        label: "Exploration",
        bindings: [
          { action: "moveForward", keys: ["KeyW", "ArrowUp"], label: "W", hint: "Move forward" },
          { action: "moveBack", keys: ["KeyS", "ArrowDown"], label: "S", hint: "Move back" },
          { action: "moveLeft", keys: ["KeyA", "ArrowLeft"], label: "A", hint: "Move left" },
          { action: "moveRight", keys: ["KeyD", "ArrowRight"], label: "D", hint: "Move right" },
          { action: "interact", keys: ["KeyE"], label: "E", hint: "Interact / collect" },
          { action: "sprint", keys: ["ShiftLeft", "ShiftRight"], label: "Shift", hint: "Sprint" },
          { action: "jump", keys: ["Space"], label: "Space", hint: "Jump" },
        ],
        hudLine: "WASD move · Shift sprint · Space jump · E collect",
      };
    default: {
      const _never: never = scheme;
      return _never;
    }
  }
}

/** True when any of the binding's keys is currently held. */
export function isActionDown(
  profile: ControlProfile,
  action: ControlAction,
  keysDown: ReadonlySet<string>,
): boolean {
  const binding = profile.bindings.find((b) => b.action === action);
  if (!binding) return false;
  return binding.keys.some((code) => keysDown.has(code));
}

/** Axis in [-1, 1] from opposing actions (e.g. forward/back). */
export function actionAxis(
  profile: ControlProfile,
  positive: ControlAction,
  negative: ControlAction,
  keysDown: ReadonlySet<string>,
): number {
  const pos = isActionDown(profile, positive, keysDown) ? 1 : 0;
  const neg = isActionDown(profile, negative, keysDown) ? 1 : 0;
  return pos - neg;
}

/** All key codes that belong to the profile (for preventDefault filtering). */
export function profileKeyCodes(profile: ControlProfile): Set<string> {
  const codes = new Set<string>();
  for (const binding of profile.bindings) {
    for (const key of binding.keys) {
      if (!key.startsWith("Mouse")) codes.add(key);
    }
  }
  return codes;
}
