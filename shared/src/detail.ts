/**
 * Fidelity enrichment: turns catalog prefabs into denser, more material-rich
 * set pieces for cinematic builds. Pure so server + web agree on the result.
 */

import type { FidelityLevel } from "./gameDesign.js";
import type {
  MaterialHint,
  MeshPart,
  PrefabDefinition,
  PrefabKind,
} from "./prefabs.js";

/** Attach material/segment hints and optional micro-detail parts. */
export function enrichDefinition(
  def: PrefabDefinition,
  fidelity: FidelityLevel,
): PrefabDefinition {
  if (fidelity === "draft") return def;

  const segments = fidelity === "cinematic" ? 28 : 18;
  const baseParts = def.parts.map((part) => withHint(part, def.kind, segments));
  const extras = fidelity === "cinematic" ? cinematicExtras(def.kind) : standardExtras(def.kind);

  return {
    ...def,
    parts: [...baseParts, ...extras],
  };
}

function withHint(part: MeshPart, kind: PrefabKind, segments: number): MeshPart {
  const family = familyFor(kind, part);
  return {
    ...part,
    materialHint: { family, segments },
  };
}

function familyFor(kind: PrefabKind, part: MeshPart): MaterialHint["family"] {
  if (part.emissive) return "emissive";
  if (
    kind === "race_car" ||
    kind === "track_barrier" ||
    kind === "track_checkpoint" ||
    kind === "street_lamp" ||
    kind === "grandstand" ||
    kind === "cone_marker"
  ) {
    if (part.metalness && part.metalness > 0.4) return "metal";
    if (kind === "street_lamp") return "metal";
    return "paint";
  }
  if (kind === "tree" || kind === "pine_tree" || kind === "hollow_tree" || kind === "bush") {
    return part.shape === "cylinder" ? "bark" : "foliage";
  }
  if (
    kind === "stone_arch" ||
    kind === "stone_pillar" ||
    kind === "ruin_wall" ||
    kind === "statue" ||
    kind === "ancient_well" ||
    kind === "fallen_column" ||
    kind === "rubble" ||
    kind === "boulder" ||
    kind === "path_stone"
  ) {
    return "stone";
  }
  if (
    kind === "wooden_crate" ||
    kind === "supply_crate" ||
    kind === "torch" ||
    kind === "archery_target"
  ) {
    return "wood";
  }
  if (kind === "mushroom" || kind === "moss_patch" || kind === "hay_bale") return "foliage";
  return "stone";
}

function standardExtras(kind: PrefabKind): MeshPart[] {
  switch (kind) {
    case "tree":
    case "pine_tree":
    case "hollow_tree":
      return [
        {
          shape: "sphere",
          color: "#2f6b3f",
          size: { x: 0.9, y: 0.7, z: 0.9 },
          offset: { x: 0.55, y: 2.8, z: 0.2 },
          roughness: 0.92,
          materialHint: { family: "foliage", segments: 16 },
        },
      ];
    case "stone_arch":
      return [
        {
          shape: "box",
          color: "#5f8a68",
          size: { x: 0.55, y: 0.14, z: 0.3 },
          offset: { x: 0.8, y: 2.55, z: 0.4 },
          roughness: 0.95,
          materialHint: { family: "foliage", segments: 8 },
        },
      ];
    default:
      return [];
  }
}

function cinematicExtras(kind: PrefabKind): MeshPart[] {
  const base = standardExtras(kind);
  switch (kind) {
    case "tree":
      return [
        ...base,
        {
          shape: "sphere",
          color: "#3a8f52",
          size: { x: 1.1, y: 0.85, z: 1.0 },
          offset: { x: -0.5, y: 3.1, z: -0.35 },
          roughness: 0.9,
          materialHint: { family: "foliage", segments: 20 },
        },
        {
          shape: "cylinder",
          color: "#4a3018",
          size: { x: 0.18, y: 0.9, z: 0.18 },
          offset: { x: 0.55, y: 1.7, z: 0.1 },
          rotation: { x: 0.4, y: 0.2, z: 0.7 },
          roughness: 0.95,
          materialHint: { family: "bark", segments: 12 },
        },
      ];
    case "pine_tree":
      return [
        ...base,
        {
          shape: "cone",
          color: "#174a2c",
          size: { x: 1.1, y: 1.1, z: 1.1 },
          offset: { x: 0, y: 2.7, z: 0 },
          roughness: 0.9,
          materialHint: { family: "foliage", segments: 20 },
        },
      ];
    case "stone_arch":
      return [
        ...base,
        {
          shape: "box",
          color: "#747a84",
          size: { x: 0.35, y: 0.45, z: 0.35 },
          offset: { x: 1.5, y: 0.25, z: -0.45 },
          rotation: { x: 0.1, y: 0.4, z: 0.15 },
          roughness: 0.9,
          materialHint: { family: "stone", segments: 8 },
        },
        {
          shape: "box",
          color: "#3d6b45",
          size: { x: 0.7, y: 0.12, z: 0.35 },
          offset: { x: -0.9, y: 1.9, z: 0.4 },
          roughness: 0.95,
          materialHint: { family: "foliage", segments: 8 },
        },
      ];
    case "ancient_well":
      return [
        {
          shape: "torus",
          color: "#7a8088",
          size: { x: 1.6, y: 0.25, z: 1.6 },
          offset: { x: 0, y: 1.05, z: 0 },
          roughness: 0.75,
          metalness: 0.15,
          materialHint: { family: "stone", segments: 24 },
        },
        {
          shape: "sphere",
          color: "#3d8b5a",
          size: { x: 0.35, y: 0.2, z: 0.35 },
          offset: { x: 0.7, y: 1.15, z: 0.4 },
          roughness: 0.95,
          materialHint: { family: "foliage", segments: 12 },
        },
      ];
    case "race_car":
      return [
        {
          shape: "box",
          color: "#111111",
          size: { x: 0.9, y: 0.12, z: 0.08 },
          offset: { x: 0, y: 0.55, z: 0.55 },
          roughness: 0.35,
          metalness: 0.7,
          materialHint: { family: "metal", segments: 8 },
        },
        {
          shape: "box",
          color: "#ffe566",
          size: { x: 0.15, y: 0.08, z: 0.08 },
          offset: { x: -0.35, y: 0.35, z: 0.95 },
          emissive: "#ffcc33",
          emissiveIntensity: 0.6,
          materialHint: { family: "emissive", segments: 8 },
        },
        {
          shape: "box",
          color: "#ffe566",
          size: { x: 0.15, y: 0.08, z: 0.08 },
          offset: { x: 0.35, y: 0.35, z: 0.95 },
          emissive: "#ffcc33",
          emissiveIntensity: 0.6,
          materialHint: { family: "emissive", segments: 8 },
        },
      ];
    case "track_barrier":
      return [
        {
          shape: "box",
          color: "#f0f0f0",
          size: { x: 1.9, y: 0.12, z: 0.35 },
          offset: { x: 0, y: 0.55, z: 0 },
          roughness: 0.5,
          materialHint: { family: "paint", segments: 8 },
        },
      ];
    default:
      return base;
  }
}
