/**
 * Real-time preview debug snapshot — pure types + formatters so the monitor
 * panel can stay thin and the animate loop can sample without React knowledge.
 *
 * Built for the bugs we actually hit: "WASD dead?", "why won't E collect?",
 * "which actions are down?", "where am I relative to the near entity?".
 */

import {
  isActionDown,
  type ControlAction,
  type ControlProfile,
  type GameSessionState,
} from "@ai-gamedev/shared";

export interface DebugVec3 {
  x: number;
  y: number;
  z: number;
}

export interface DebugNearEntity {
  id: string;
  name: string;
  dist: number;
  hint?: string;
}

export interface PreviewDebugSnapshot {
  /** Wall-clock ms when the sample was taken. */
  at: number;
  /** Approximate render FPS from the last frame delta. */
  fps: number;
  frameMs: number;
  scheme: ControlProfile["scheme"];
  schemeLabel: string;
  cameraView: string;
  cameraFov: number;
  /** Raw KeyboardEvent.code / MouseN values currently held. */
  keys: string[];
  /** Semantic actions currently true for the active profile. */
  actions: ControlAction[];
  player: {
    position: DebugVec3;
    yawDeg: number;
    speed: number;
    driveVelocity: number;
    jumpOffset: number;
    crouching: boolean;
    aiming: boolean;
    avatar: "capsule" | "car";
  };
  session: {
    status: GameSessionState["status"] | "none";
    health: number;
    ammo: number;
    score: number;
    lives: number;
    message: string;
    objectives: Array<{ id: string; label: string; progress: number; target: number }>;
  };
  near: DebugNearEntity | null;
  collected: number;
  checkpoints: number;
  fireCooldown: number;
  projectiles: number;
  entityCount: number;
  interactiveVisible: number;
}

export interface DebugMonitorRow {
  label: string;
  value: string;
}

export interface DebugMonitorSection {
  title: string;
  rows: DebugMonitorRow[];
}

/** Compact KeyboardEvent.code → HUD-friendly label. */
export function shortKeyLabel(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("Mouse")) return `M${code.slice(5)}`;
  switch (code) {
    case "Space":
      return "Spc";
    case "ShiftLeft":
    case "ShiftRight":
      return "Shf";
    case "ControlLeft":
    case "ControlRight":
      return "Ctl";
    case "AltLeft":
    case "AltRight":
      return "Alt";
    case "Escape":
      return "Esc";
    default:
      return code;
  }
}

/** Every bound action that is currently held. */
export function activeActions(
  profile: ControlProfile,
  keysDown: ReadonlySet<string>,
): ControlAction[] {
  const out: ControlAction[] = [];
  for (const binding of profile.bindings) {
    if (isActionDown(profile, binding.action, keysDown)) {
      out.push(binding.action);
    }
  }
  return out;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function formatFixed(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/** Group the snapshot into labeled sections for the on-canvas monitor. */
export function debugMonitorSections(snap: PreviewDebugSnapshot): DebugMonitorSection[] {
  const objLine =
    snap.session.objectives.length === 0
      ? "—"
      : snap.session.objectives
          .map((o) => `${o.label} ${o.progress}/${o.target}`)
          .join(" · ");

  return [
    {
      title: "Input",
      rows: [
        { label: "scheme", value: `${snap.scheme} · ${snap.schemeLabel}` },
        {
          label: "keys",
          value: snap.keys.length ? snap.keys.map(shortKeyLabel).join(" ") : "—",
        },
        {
          label: "actions",
          value: snap.actions.length ? snap.actions.join(", ") : "—",
        },
      ],
    },
    {
      title: "Player",
      rows: [
        {
          label: "pos",
          value: `${formatFixed(snap.player.position.x)}  ${formatFixed(snap.player.position.y)}  ${formatFixed(snap.player.position.z)}`,
        },
        {
          label: "yaw",
          value: `${formatFixed(snap.player.yawDeg, 1)}°`,
        },
        {
          label: "motion",
          value: `spd ${formatFixed(snap.player.speed, 1)} · drive ${formatFixed(snap.player.driveVelocity, 2)} · jump ${formatFixed(snap.player.jumpOffset, 2)}`,
        },
        {
          label: "flags",
          value: [
            snap.player.avatar,
            snap.player.crouching ? "crouch" : null,
            snap.player.aiming ? "aim" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      ],
    },
    {
      title: "Session",
      rows: [
        {
          label: "status",
          value: `${snap.session.status} · HP ${snap.session.health} · ammo ${snap.session.ammo} · score ${snap.session.score} · lives ${snap.session.lives}`,
        },
        { label: "objectives", value: objLine },
        {
          label: "msg",
          value: snap.session.message || "—",
        },
        {
          label: "near",
          value: snap.near
            ? `${snap.near.name} @ ${formatFixed(snap.near.dist, 2)}m${snap.near.hint ? ` · ${snap.near.hint}` : ""}`
            : "—",
        },
        {
          label: "loot",
          value: `collected ${snap.collected} · checkpoints ${snap.checkpoints} · fireCd ${formatFixed(snap.fireCooldown, 2)} · bolts ${snap.projectiles}`,
        },
      ],
    },
    {
      title: "View",
      rows: [
        {
          label: "camera",
          value: `${snap.cameraView} · fov ${formatFixed(snap.cameraFov, 0)}`,
        },
        {
          label: "world",
          value: `${snap.entityCount} entities · ${snap.interactiveVisible} interactive · ${formatFixed(snap.fps, 0)} fps (${formatFixed(snap.frameMs, 1)} ms)`,
        },
      ],
    },
  ];
}

/** Flat text dump — useful for copy/paste into bug reports. */
export function formatDebugMonitorText(snap: PreviewDebugSnapshot): string {
  return debugMonitorSections(snap)
    .map((section) => {
      const body = section.rows.map((r) => `  ${r.label}: ${r.value}`).join("\n");
      return `[${section.title}]\n${body}`;
    })
    .join("\n");
}

/** Inputs the animate loop gathers before calling {@link buildDebugSnapshot}. */
export interface DebugSampleInput {
  delta: number;
  profile: ControlProfile;
  keys: ReadonlySet<string>;
  cameraView: string;
  cameraFov: number;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    speed: number;
    driveVelocity: number;
    jumpOffset: number;
    crouching: boolean;
    aiming: boolean;
    avatar: "capsule" | "car";
  };
  session: GameSessionState | null;
  near: DebugNearEntity | null;
  collected: number;
  checkpoints: number;
  fireCooldown: number;
  projectiles: number;
  entityCount: number;
  interactiveVisible: number;
  now?: number;
}

/** Build a snapshot from live runtime refs — kept pure for unit tests. */
export function buildDebugSnapshot(input: DebugSampleInput): PreviewDebugSnapshot {
  const session = input.session;
  return {
    at: input.now ?? Date.now(),
    fps: input.delta > 0 ? 1 / input.delta : 0,
    frameMs: input.delta * 1000,
    scheme: input.profile.scheme,
    schemeLabel: input.profile.label,
    cameraView: input.cameraView,
    cameraFov: input.cameraFov,
    keys: [...input.keys].sort(),
    actions: activeActions(input.profile, input.keys),
    player: {
      position: { x: input.player.x, y: input.player.y, z: input.player.z },
      yawDeg: radToDeg(input.player.yaw),
      speed: input.player.speed,
      driveVelocity: input.player.driveVelocity,
      jumpOffset: input.player.jumpOffset,
      crouching: input.player.crouching,
      aiming: input.player.aiming,
      avatar: input.player.avatar,
    },
    session: {
      status: session?.status ?? "none",
      health: session?.health ?? 0,
      ammo: session?.ammo ?? 0,
      score: session?.score ?? 0,
      lives: session?.lives ?? 0,
      message: session?.message ?? "",
      objectives: (session?.objectives ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        progress: o.progress,
        target: o.target,
      })),
    },
    near: input.near,
    collected: input.collected,
    checkpoints: input.checkpoints,
    fireCooldown: input.fireCooldown,
    projectiles: input.projectiles,
    entityCount: input.entityCount,
    interactiveVisible: input.interactiveVisible,
  };
}
