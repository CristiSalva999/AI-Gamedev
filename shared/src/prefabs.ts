/**
 * Procedural prefab catalog. Each prefab is a small hierarchy of colored
 * primitives that reads as a recognizable set piece in the Three.js preview
 * without requiring Blender or external mesh packs.
 */

export type PrimitiveShape = "box" | "sphere" | "cylinder" | "cone" | "torus";

export type PrefabKind =
  | "primitive"
  | "tree"
  | "pine_tree"
  | "hollow_tree"
  | "stone_arch"
  | "stone_pillar"
  | "ruin_wall"
  | "ancient_well"
  | "statue"
  | "moss_patch"
  | "mushroom"
  | "wooden_crate"
  | "boulder"
  | "bush"
  | "fallen_column"
  | "rubble"
  | "supply_crate"
  | "torch"
  | "path_stone";

export interface MeshPart {
  shape: PrimitiveShape;
  color: string;
  size: { x: number; y: number; z: number };
  /** Offset from the prefab origin (origin sits on the ground). */
  offset: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export interface PrefabDefinition {
  kind: PrefabKind;
  /** Fallback single-primitive description for exporters that ignore parts. */
  shape: PrimitiveShape;
  color: string;
  size: { x: number; y: number; z: number };
  roughness: number;
  metalness: number;
  parts: MeshPart[];
}

const STONE = "#8a9099";
const STONE_DARK = "#6a7078";
const MOSS = "#3d8b5a";
const MOSS_GLOW = "#2ecc71";
const BARK = "#5c3a21";
const LEAF = "#2d6a3e";
const LEAF_LIGHT = "#3f8f52";
const WOOD = "#8b5a2b";
const WOOD_LIGHT = "#a06a35";

/** Scale every part of a definition uniformly around the ground origin. */
export function scalePrefab(def: PrefabDefinition, scale: number): PrefabDefinition {
  if (scale === 1) return def;
  const s = (v: number) => Number((v * scale).toFixed(3));
  return {
    ...def,
    size: { x: s(def.size.x), y: s(def.size.y), z: s(def.size.z) },
    parts: def.parts.map((part) => ({
      ...part,
      size: { x: s(part.size.x), y: s(part.size.y), z: s(part.size.z) },
      offset: { x: s(part.offset.x), y: s(part.offset.y), z: s(part.offset.z) },
    })),
  };
}

export function buildPrefab(kind: PrefabKind, scale = 1): PrefabDefinition {
  const def = PREFABS[kind] ?? PREFABS.primitive;
  return scalePrefab(def(), scale);
}

/**
 * Maps a free-text asset brief onto the closest prefab. Order matters: more
 * specific phrases win before generic shape keywords.
 */
export function prefabForBrief(brief: string): PrefabKind {
  const t = brief.toLowerCase();
  if (/\b(hollow|gnarled).*\btree|\btree.*hollow\b/.test(t)) return "hollow_tree";
  if (/\b(pine|fir|evergreen)\b/.test(t)) return "pine_tree";
  if (/\b(tree|oak|willow|canopy)\b/.test(t)) return "tree";
  if (/\b(arch|archway|gateway)\b/.test(t)) return "stone_arch";
  if (/\b(pillar|column)\b/.test(t) && /\b(fallen|toppled|broken)\b/.test(t)) {
    return "fallen_column";
  }
  if (/\b(pillar|column)\b/.test(t)) return "stone_pillar";
  if (/\b(wall|ruin wall|ruined wall)\b/.test(t)) return "ruin_wall";
  if (/\b(well|fountain)\b/.test(t)) return "ancient_well";
  if (/\b(statue|monument|idol)\b/.test(t)) return "statue";
  if (/\b(moss)\b/.test(t)) return "moss_patch";
  if (/\b(mushroom|fungus|toadstool)\b/.test(t)) return "mushroom";
  if (/\b(crate|chest|supply)\b/.test(t)) return "supply_crate";
  if (/\b(boulder|rock)\b/.test(t)) return "boulder";
  if (/\b(bush|shrub|fern)\b/.test(t)) return "bush";
  if (/\b(rubble|debris|ruin pile)\b/.test(t)) return "rubble";
  if (/\b(torch|lantern)\b/.test(t)) return "torch";
  if (/\b(path|stepping|cobble)\b/.test(t)) return "path_stone";
  if (/\b(fence|gate)\b/.test(t)) return "ruin_wall";
  return "primitive";
}

type PrefabFactory = () => PrefabDefinition;

const PREFABS: Record<PrefabKind, PrefabFactory> = {
  primitive: () => ({
    kind: "primitive",
    shape: "box",
    color: "#9aa0a6",
    size: { x: 1, y: 1, z: 1 },
    roughness: 0.8,
    metalness: 0.05,
    parts: [
      {
        shape: "box",
        color: "#9aa0a6",
        size: { x: 1, y: 1, z: 1 },
        offset: { x: 0, y: 0.5, z: 0 },
      },
    ],
  }),

  tree: () => ({
    kind: "tree",
    shape: "cone",
    color: LEAF,
    size: { x: 2.2, y: 4.2, z: 2.2 },
    roughness: 0.9,
    metalness: 0,
    parts: [
      {
        shape: "cylinder",
        color: BARK,
        size: { x: 0.45, y: 1.8, z: 0.45 },
        offset: { x: 0, y: 0.9, z: 0 },
        roughness: 0.95,
      },
      {
        shape: "cone",
        color: LEAF,
        size: { x: 2.1, y: 2.4, z: 2.1 },
        offset: { x: 0, y: 2.7, z: 0 },
        roughness: 0.85,
      },
      {
        shape: "cone",
        color: LEAF_LIGHT,
        size: { x: 1.5, y: 1.6, z: 1.5 },
        offset: { x: 0, y: 3.6, z: 0 },
        roughness: 0.85,
      },
    ],
  }),

  pine_tree: () => ({
    kind: "pine_tree",
    shape: "cone",
    color: "#1f5c34",
    size: { x: 1.8, y: 5, z: 1.8 },
    roughness: 0.9,
    metalness: 0,
    parts: [
      {
        shape: "cylinder",
        color: BARK,
        size: { x: 0.35, y: 1.6, z: 0.35 },
        offset: { x: 0, y: 0.8, z: 0 },
      },
      {
        shape: "cone",
        color: "#1f5c34",
        size: { x: 1.8, y: 1.8, z: 1.8 },
        offset: { x: 0, y: 2.2, z: 0 },
      },
      {
        shape: "cone",
        color: "#246b3c",
        size: { x: 1.35, y: 1.5, z: 1.35 },
        offset: { x: 0, y: 3.3, z: 0 },
      },
      {
        shape: "cone",
        color: "#2a7a45",
        size: { x: 0.9, y: 1.2, z: 0.9 },
        offset: { x: 0, y: 4.2, z: 0 },
      },
    ],
  }),

  hollow_tree: () => ({
    kind: "hollow_tree",
    shape: "cylinder",
    color: BARK,
    size: { x: 2.4, y: 3.8, z: 2.4 },
    roughness: 0.95,
    metalness: 0,
    parts: [
      {
        shape: "cylinder",
        color: BARK,
        size: { x: 1.1, y: 3.2, z: 1.1 },
        offset: { x: 0, y: 1.6, z: 0 },
      },
      {
        shape: "sphere",
        color: LEAF,
        size: { x: 2.4, y: 2, z: 2.4 },
        offset: { x: 0.2, y: 3.4, z: -0.1 },
      },
      {
        shape: "box",
        color: "#3a2414",
        size: { x: 0.55, y: 1.4, z: 0.35 },
        offset: { x: 0, y: 0.9, z: 0.55 },
      },
      {
        shape: "sphere",
        color: MOSS_GLOW,
        size: { x: 0.35, y: 0.35, z: 0.35 },
        offset: { x: 0.45, y: 1.2, z: 0.5 },
        emissive: MOSS_GLOW,
        emissiveIntensity: 0.55,
      },
    ],
  }),

  stone_arch: () => ({
    kind: "stone_arch",
    shape: "box",
    color: STONE,
    size: { x: 3.6, y: 3.4, z: 1.2 },
    roughness: 0.85,
    metalness: 0.15,
    parts: [
      {
        shape: "box",
        color: STONE,
        size: { x: 0.7, y: 2.8, z: 0.9 },
        offset: { x: -1.3, y: 1.4, z: 0 },
      },
      {
        shape: "box",
        color: STONE_DARK,
        size: { x: 0.7, y: 2.6, z: 0.9 },
        offset: { x: 1.3, y: 1.3, z: 0 },
      },
      {
        shape: "box",
        color: STONE,
        size: { x: 3.4, y: 0.55, z: 1.05 },
        offset: { x: 0, y: 3.0, z: 0 },
      },
      {
        shape: "box",
        color: MOSS,
        size: { x: 1.2, y: 0.2, z: 0.4 },
        offset: { x: -0.4, y: 3.25, z: 0.35 },
      },
      {
        shape: "box",
        color: STONE_DARK,
        size: { x: 0.45, y: 0.7, z: 0.45 },
        offset: { x: -1.55, y: 0.35, z: 0.55 },
      },
    ],
  }),

  stone_pillar: () => ({
    kind: "stone_pillar",
    shape: "cylinder",
    color: STONE,
    size: { x: 1.1, y: 3.2, z: 1.1 },
    roughness: 0.8,
    metalness: 0.2,
    parts: [
      {
        shape: "cylinder",
        color: STONE_DARK,
        size: { x: 1.05, y: 0.35, z: 1.05 },
        offset: { x: 0, y: 0.18, z: 0 },
      },
      {
        shape: "cylinder",
        color: STONE,
        size: { x: 0.7, y: 2.5, z: 0.7 },
        offset: { x: 0, y: 1.5, z: 0 },
      },
      {
        shape: "box",
        color: STONE,
        size: { x: 1.1, y: 0.3, z: 1.1 },
        offset: { x: 0, y: 2.9, z: 0 },
      },
      {
        shape: "sphere",
        color: MOSS,
        size: { x: 0.35, y: 0.25, z: 0.35 },
        offset: { x: 0.25, y: 2.0, z: 0.2 },
      },
    ],
  }),

  ruin_wall: () => ({
    kind: "ruin_wall",
    shape: "box",
    color: STONE,
    size: { x: 3.2, y: 1.8, z: 0.7 },
    roughness: 0.9,
    metalness: 0.1,
    parts: [
      {
        shape: "box",
        color: STONE,
        size: { x: 3.0, y: 1.4, z: 0.55 },
        offset: { x: 0, y: 0.7, z: 0 },
      },
      {
        shape: "box",
        color: STONE_DARK,
        size: { x: 1.1, y: 0.7, z: 0.55 },
        offset: { x: -0.7, y: 1.55, z: 0 },
      },
      {
        shape: "box",
        color: MOSS,
        size: { x: 0.8, y: 0.18, z: 0.35 },
        offset: { x: 0.6, y: 1.2, z: 0.2 },
      },
    ],
  }),

  ancient_well: () => ({
    kind: "ancient_well",
    shape: "cylinder",
    color: STONE,
    size: { x: 2.2, y: 1.6, z: 2.2 },
    roughness: 0.85,
    metalness: 0.1,
    parts: [
      {
        shape: "cylinder",
        color: STONE,
        size: { x: 1.8, y: 1.1, z: 1.8 },
        offset: { x: 0, y: 0.55, z: 0 },
      },
      {
        shape: "cylinder",
        color: "#2a4a6a",
        size: { x: 1.25, y: 0.25, z: 1.25 },
        offset: { x: 0, y: 1.0, z: 0 },
        metalness: 0.4,
        roughness: 0.3,
        emissive: "#1a3a5a",
        emissiveIntensity: 0.25,
      },
      {
        shape: "box",
        color: WOOD,
        size: { x: 0.18, y: 1.4, z: 0.18 },
        offset: { x: -0.7, y: 1.5, z: 0 },
      },
      {
        shape: "box",
        color: WOOD,
        size: { x: 0.18, y: 1.4, z: 0.18 },
        offset: { x: 0.7, y: 1.5, z: 0 },
      },
      {
        shape: "box",
        color: WOOD_LIGHT,
        size: { x: 1.7, y: 0.16, z: 0.25 },
        offset: { x: 0, y: 2.2, z: 0 },
      },
    ],
  }),

  statue: () => ({
    kind: "statue",
    shape: "cylinder",
    color: STONE,
    size: { x: 1.4, y: 2.8, z: 1.4 },
    roughness: 0.75,
    metalness: 0.2,
    parts: [
      {
        shape: "box",
        color: STONE_DARK,
        size: { x: 1.3, y: 0.35, z: 1.3 },
        offset: { x: 0, y: 0.18, z: 0 },
      },
      {
        shape: "cylinder",
        color: STONE,
        size: { x: 0.7, y: 1.5, z: 0.7 },
        offset: { x: 0.15, y: 1.1, z: 0 },
        rotation: { x: 0, y: 0, z: 0.35 },
      },
      {
        shape: "sphere",
        color: STONE,
        size: { x: 0.55, y: 0.55, z: 0.55 },
        offset: { x: 0.45, y: 2.0, z: 0.1 },
      },
      {
        shape: "box",
        color: STONE_DARK,
        size: { x: 0.9, y: 0.35, z: 0.45 },
        offset: { x: -0.55, y: 0.35, z: 0.35 },
        rotation: { x: 0.2, y: 0.4, z: 0.5 },
      },
    ],
  }),

  moss_patch: () => ({
    kind: "moss_patch",
    shape: "sphere",
    color: MOSS_GLOW,
    size: { x: 1.6, y: 0.5, z: 1.6 },
    roughness: 0.95,
    metalness: 0,
    parts: [
      {
        shape: "sphere",
        color: MOSS,
        size: { x: 1.4, y: 0.35, z: 1.1 },
        offset: { x: 0, y: 0.15, z: 0 },
        emissive: MOSS_GLOW,
        emissiveIntensity: 0.35,
      },
      {
        shape: "sphere",
        color: MOSS_GLOW,
        size: { x: 0.7, y: 0.25, z: 0.7 },
        offset: { x: 0.45, y: 0.18, z: 0.25 },
        emissive: MOSS_GLOW,
        emissiveIntensity: 0.55,
      },
      {
        shape: "sphere",
        color: "#48c97a",
        size: { x: 0.5, y: 0.2, z: 0.5 },
        offset: { x: -0.4, y: 0.14, z: -0.2 },
        emissive: "#2ecc71",
        emissiveIntensity: 0.4,
      },
    ],
  }),

  mushroom: () => ({
    kind: "mushroom",
    shape: "cone",
    color: "#e8d5a3",
    size: { x: 0.9, y: 1.1, z: 0.9 },
    roughness: 0.7,
    metalness: 0,
    parts: [
      {
        shape: "cylinder",
        color: "#f0e6c8",
        size: { x: 0.22, y: 0.55, z: 0.22 },
        offset: { x: 0, y: 0.28, z: 0 },
      },
      {
        shape: "sphere",
        color: "#d35400",
        size: { x: 0.85, y: 0.45, z: 0.85 },
        offset: { x: 0, y: 0.7, z: 0 },
        emissive: "#e67e22",
        emissiveIntensity: 0.25,
      },
      {
        shape: "sphere",
        color: "#f5d76e",
        size: { x: 0.18, y: 0.12, z: 0.18 },
        offset: { x: 0.2, y: 0.78, z: 0.1 },
      },
    ],
  }),

  wooden_crate: () => crateDef("wooden_crate"),
  supply_crate: () => crateDef("supply_crate"),

  boulder: () => ({
    kind: "boulder",
    shape: "sphere",
    color: "#7a7f86",
    size: { x: 1.6, y: 1.2, z: 1.5 },
    roughness: 0.95,
    metalness: 0.05,
    parts: [
      {
        shape: "sphere",
        color: "#7a7f86",
        size: { x: 1.4, y: 1.0, z: 1.3 },
        offset: { x: 0, y: 0.45, z: 0 },
      },
      {
        shape: "sphere",
        color: MOSS,
        size: { x: 0.55, y: 0.3, z: 0.5 },
        offset: { x: 0.35, y: 0.75, z: 0.15 },
      },
    ],
  }),

  bush: () => ({
    kind: "bush",
    shape: "sphere",
    color: LEAF_LIGHT,
    size: { x: 1.4, y: 1.0, z: 1.4 },
    roughness: 0.95,
    metalness: 0,
    parts: [
      {
        shape: "sphere",
        color: LEAF,
        size: { x: 1.1, y: 0.8, z: 1.0 },
        offset: { x: 0, y: 0.4, z: 0 },
      },
      {
        shape: "sphere",
        color: LEAF_LIGHT,
        size: { x: 0.7, y: 0.55, z: 0.7 },
        offset: { x: 0.35, y: 0.45, z: 0.2 },
      },
      {
        shape: "sphere",
        color: "#4a9a5c",
        size: { x: 0.6, y: 0.5, z: 0.55 },
        offset: { x: -0.3, y: 0.4, z: -0.15 },
      },
    ],
  }),

  fallen_column: () => ({
    kind: "fallen_column",
    shape: "cylinder",
    color: STONE,
    size: { x: 3.2, y: 0.9, z: 1.0 },
    roughness: 0.85,
    metalness: 0.15,
    parts: [
      {
        shape: "cylinder",
        color: STONE,
        size: { x: 0.55, y: 2.8, z: 0.55 },
        offset: { x: 0, y: 0.35, z: 0 },
        rotation: { x: 0, y: 0, z: Math.PI / 2 },
      },
      {
        shape: "box",
        color: STONE_DARK,
        size: { x: 0.7, y: 0.35, z: 0.7 },
        offset: { x: -1.3, y: 0.2, z: 0.1 },
      },
      {
        shape: "sphere",
        color: MOSS,
        size: { x: 0.4, y: 0.25, z: 0.4 },
        offset: { x: 0.6, y: 0.55, z: 0.15 },
      },
    ],
  }),

  rubble: () => ({
    kind: "rubble",
    shape: "box",
    color: STONE_DARK,
    size: { x: 1.8, y: 0.8, z: 1.6 },
    roughness: 0.95,
    metalness: 0.05,
    parts: [
      {
        shape: "box",
        color: STONE,
        size: { x: 0.7, y: 0.4, z: 0.55 },
        offset: { x: -0.25, y: 0.2, z: 0.1 },
        rotation: { x: 0.1, y: 0.4, z: 0.2 },
      },
      {
        shape: "box",
        color: STONE_DARK,
        size: { x: 0.55, y: 0.35, z: 0.5 },
        offset: { x: 0.35, y: 0.18, z: -0.15 },
        rotation: { x: -0.15, y: -0.3, z: 0.1 },
      },
      {
        shape: "sphere",
        color: "#757a82",
        size: { x: 0.4, y: 0.3, z: 0.4 },
        offset: { x: 0.05, y: 0.35, z: 0.35 },
      },
    ],
  }),

  torch: () => ({
    kind: "torch",
    shape: "cylinder",
    color: WOOD,
    size: { x: 0.4, y: 1.8, z: 0.4 },
    roughness: 0.7,
    metalness: 0.1,
    parts: [
      {
        shape: "cylinder",
        color: WOOD,
        size: { x: 0.14, y: 1.4, z: 0.14 },
        offset: { x: 0, y: 0.7, z: 0 },
      },
      {
        shape: "cone",
        color: "#ff8c42",
        size: { x: 0.28, y: 0.45, z: 0.28 },
        offset: { x: 0, y: 1.55, z: 0 },
        emissive: "#ff6a00",
        emissiveIntensity: 0.9,
      },
    ],
  }),

  path_stone: () => ({
    kind: "path_stone",
    shape: "box",
    color: "#6f746c",
    size: { x: 1.1, y: 0.2, z: 0.85 },
    roughness: 0.95,
    metalness: 0,
    parts: [
      {
        shape: "box",
        color: "#6f746c",
        size: { x: 1.0, y: 0.12, z: 0.75 },
        offset: { x: 0, y: 0.06, z: 0 },
      },
      {
        shape: "box",
        color: MOSS,
        size: { x: 0.35, y: 0.06, z: 0.25 },
        offset: { x: 0.2, y: 0.12, z: 0.15 },
      },
    ],
  }),
};

function crateDef(kind: "wooden_crate" | "supply_crate"): PrefabDefinition {
  return {
    kind,
    shape: "box",
    color: WOOD,
    size: { x: 1.1, y: 1.0, z: 1.1 },
    roughness: 0.85,
    metalness: 0.05,
    parts: [
      {
        shape: "box",
        color: WOOD,
        size: { x: 1.0, y: 0.85, z: 1.0 },
        offset: { x: 0, y: 0.43, z: 0 },
      },
      {
        shape: "box",
        color: WOOD_LIGHT,
        size: { x: 1.05, y: 0.12, z: 1.05 },
        offset: { x: 0, y: 0.9, z: 0 },
      },
      {
        shape: "box",
        color: "#5a3a18",
        size: { x: 0.12, y: 0.85, z: 1.02 },
        offset: { x: 0, y: 0.43, z: 0 },
      },
    ],
  };
}
