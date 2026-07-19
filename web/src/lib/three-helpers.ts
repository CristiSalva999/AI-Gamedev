import * as THREE from "three";
import type { AssetSpec, MeshPart, PrimitiveShape } from "@ai-gamedev/shared";

/**
 * Renderer-agnostic description of the geometry to build. Extracted as a pure
 * function so the mapping can be unit tested without a WebGL context.
 */
export interface GeometryParams {
  type: PrimitiveShape;
  args: number[];
}

export function geometryParams(spec: AssetSpec): GeometryParams {
  return geometryParamsForPart({
    shape: spec.shape,
    size: spec.size,
  });
}

export function geometryParamsForPart(part: Pick<MeshPart, "shape" | "size">): GeometryParams {
  const { x, y, z } = part.size;
  switch (part.shape) {
    case "box":
      return { type: "box", args: [x, y, z] };
    case "sphere":
      return { type: "sphere", args: [0.5 * Math.max(x, y, z), 20, 14] };
    case "cylinder":
      return { type: "cylinder", args: [0.5 * x, 0.5 * z || 0.5 * x, y, 16] };
    case "cone":
      return { type: "cone", args: [0.5 * Math.max(x, z), y, 16] };
    case "torus":
      return { type: "torus", args: [0.5 * x, 0.2 * x, 12, 24] };
    default: {
      // Exhaustiveness guard: new shapes must be handled here.
      const _never: never = part.shape;
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

function buildPartMesh(part: MeshPart): THREE.Mesh {
  const geometry = createGeometry(geometryParamsForPart(part));
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(part.color),
    roughness: part.roughness ?? 0.8,
    metalness: part.metalness ?? 0.05,
    emissive: part.emissive ? new THREE.Color(part.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: part.emissiveIntensity ?? 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(part.offset.x, part.offset.y, part.offset.z);
  if (part.rotation) {
    mesh.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a ready-to-add Object3D from an {@link AssetSpec}. Compound prefabs
 * become a Group of meshes; plain primitives stay a single Mesh.
 */
export function buildAssetMesh(spec: AssetSpec): THREE.Object3D {
  const parts = spec.parts && spec.parts.length > 0 ? spec.parts : null;
  if (!parts) {
    const mesh = buildPartMesh({
      shape: spec.shape,
      color: spec.color,
      size: spec.size,
      offset: { x: 0, y: 0, z: 0 },
      roughness: spec.roughness,
      metalness: spec.metalness,
    });
    // Legacy single-mesh path was centered; lift so the base sits on the ground.
    mesh.position.y = Math.max(spec.size.y, 0.5) / 2;
    return mesh;
  }

  const group = new THREE.Group();
  for (const part of parts) {
    group.add(buildPartMesh(part));
  }
  group.userData.footprint = Math.max(spec.size.x, spec.size.z, 0.8);
  return group;
}

/** Disposes geometries/materials under a generated asset root. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material) material.dispose();
  });
}
