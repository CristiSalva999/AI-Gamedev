import * as THREE from "three";
import type { AssetSpec, PrimitiveShape } from "@ai-gamedev/shared";

/**
 * Renderer-agnostic description of the geometry to build. Extracted as a pure
 * function so the mapping can be unit tested without a WebGL context.
 */
export interface GeometryParams {
  type: PrimitiveShape;
  args: number[];
}

export function geometryParams(spec: AssetSpec): GeometryParams {
  const { x, y, z } = spec.size;
  switch (spec.shape) {
    case "box":
      return { type: "box", args: [x, y, z] };
    case "sphere":
      return { type: "sphere", args: [0.6 * Math.max(x, y, z), 32, 16] };
    case "cylinder":
      return { type: "cylinder", args: [0.5 * x, 0.5 * x, y, 32] };
    case "cone":
      return { type: "cone", args: [0.6 * x, y, 32] };
    case "torus":
      return { type: "torus", args: [0.5 * x, 0.2 * x, 16, 48] };
    default: {
      // Exhaustiveness guard: new shapes must be handled here.
      const _never: never = spec.shape;
      return _never;
    }
  }
}

function createGeometry(params: GeometryParams): THREE.BufferGeometry {
  const [a, b, c, d] = params.args;
  switch (params.type) {
    case "box":
      return new THREE.BoxGeometry(a, b, c);
    case "sphere":
      return new THREE.SphereGeometry(a, b, c);
    case "cylinder":
      return new THREE.CylinderGeometry(a, b, c, d);
    case "cone":
      return new THREE.ConeGeometry(a, b, c);
    case "torus":
      return new THREE.TorusGeometry(a, b, c, d);
    default: {
      const _never: never = params.type;
      return _never;
    }
  }
}

/** Builds a ready-to-add mesh from an {@link AssetSpec}. */
export function buildAssetMesh(spec: AssetSpec): THREE.Mesh {
  const geometry = createGeometry(geometryParams(spec));
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}
