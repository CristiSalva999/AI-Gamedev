import * as THREE from "three";
import { sampleTerrainHeight, type TerrainSpec } from "@ai-gamedev/shared";

/** Builds a displaced circular heightfield for the playable ground. */
export function buildTerrainMesh(
  terrain: TerrainSpec,
  worldRadius: number,
  groundColor: string,
  accentColor: string,
): THREE.Mesh {
  const segments = Math.max(24, Math.min(terrain.resolution, 128));
  const geometry = new THREE.CircleGeometry(worldRadius, segments);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getY(i); // CircleGeometry lies in XY before rotation
    const h = sampleTerrainHeight(x, z, terrain, worldRadius);
    positions.setZ(i, h);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(groundColor),
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
  });
  // Subtle vertex color blend toward accent for depth.
  const colors = new Float32Array(positions.count * 3);
  const base = new THREE.Color(groundColor);
  const accent = new THREE.Color(accentColor);
  const tmp = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getY(i);
    const n = (Math.sin(x * 0.35) + Math.cos(z * 0.35)) * 0.25 + 0.5;
    tmp.copy(base).lerp(accent, THREE.MathUtils.clamp(n, 0, 1));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  material.vertexColors = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
