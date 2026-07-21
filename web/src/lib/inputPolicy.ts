/**
 * Pure keyboard-capture policy for the playable preview.
 *
 * The preview listens on `window` so WASD works as soon as a game is loaded —
 * no "click to focus" step. These helpers decide when a key event belongs to
 * the page UI instead of the game, and keep that logic unit-testable outside
 * the Three.js hook.
 */

/** Minimal structural view of an event target (testable without a DOM). */
export interface KeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

/** True while the user is composing text — the game must never steal keys. */
export function isTypingTarget(target: unknown): boolean {
  const el = target as KeyTargetLike | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
}

/** Keys that activate a focused button/link — the UI keeps those. */
const UI_ACTIVATION_CODES = new Set(["Space", "Enter", "NumpadEnter"]);
const UI_CONTROL_TAGS = new Set(["BUTTON", "A", "SELECT", "SUMMARY", "OPTION"]);

/**
 * True when the event should be left to the page UI: typing in a field, or
 * pressing an activation key (Space/Enter) while a button/link has focus.
 * Movement keys (WASD, arrows…) always reach the game.
 */
export function shouldLeaveKeyToUi(target: unknown, code: string): boolean {
  if (isTypingTarget(target)) return true;
  const el = target as KeyTargetLike | null;
  if (!el || typeof el.tagName !== "string") return false;
  return UI_CONTROL_TAGS.has(el.tagName) && UI_ACTIVATION_CODES.has(code);
}

/**
 * Yaw (Three.js Y rotation) that faces the avatar along its movement.
 * The preview's forward convention is local -Z (matching the first-person
 * camera and projectile spawns), so moving "up" the screen (axisZ = -1)
 * must produce yaw 0 — not π.
 */
export function movementYaw(axisX: number, axisZ: number): number {
  return Math.atan2(-axisX, -axisZ);
}
