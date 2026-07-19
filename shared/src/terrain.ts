/**
 * Deterministic heightfield math shared by the server (layout Y offsets) and
 * the Three.js viewport (mesh displacement).
 */

import type { TerrainSpec } from "./gameDesign.js";

/** Simple value-noise hash → [0, 1]. */
export function hash2(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function smoothNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * freq, z * freq, seed + i * 19) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / (norm || 1);
}

/** World-space height at (x, z) for the given terrain recipe. */
export function sampleTerrainHeight(
  x: number,
  z: number,
  terrain: TerrainSpec,
  worldRadius: number,
): number {
  const nx = x / Math.max(worldRadius, 1);
  const nz = z / Math.max(worldRadius, 1);
  const radial = Math.hypot(nx, nz);

  switch (terrain.kind) {
    case "flat":
      return fbm(nx * 3, nz * 3, terrain.seed, 2) * terrain.heightScale * 0.15;
    case "rolling": {
      const hills = fbm(nx * 2.2, nz * 2.2, terrain.seed, 5);
      const edge = Math.max(0, radial - 0.75) * 2;
      return (hills * 1.2 - edge) * terrain.heightScale;
    }
    case "mountainous": {
      const m = fbm(nx * 3.5, nz * 3.5, terrain.seed, 6);
      return Math.pow(m, 1.4) * terrain.heightScale;
    }
    case "track_bowl": {
      // Raised rim + gentle inner noise so the circuit sits in a bowl.
      const rim = Math.max(0, radial - 0.55) * 1.8;
      const inner = fbm(nx * 4, nz * 4, terrain.seed, 3) * 0.25;
      return (rim + inner) * terrain.heightScale;
    }
    case "caves": {
      const n = fbm(nx * 4, nz * 4, terrain.seed, 5);
      return (n - 0.35) * terrain.heightScale;
    }
    default: {
      const _never: never = terrain.kind;
      return _never;
    }
  }
}
