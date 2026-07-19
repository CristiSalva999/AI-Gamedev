import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetSpec, PrimitiveShape } from "@ai-gamedev/shared";

/**
 * Writes a minimal, valid glTF 2.0 binary (.glb) for a single primitive mesh.
 * Used when Blender is unavailable so the package still contains real mesh
 * files the browser / Electron runner can load later.
 */
export async function writeProceduralGlb(
  spec: AssetSpec,
  outPath: string,
): Promise<string> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const bytes = buildGlb(spec);
  await writeFile(outPath, bytes);
  return outPath;
}

export function buildGlb(spec: AssetSpec): Buffer {
  const { positions, indices } = meshFor(spec.shape, spec.size);
  const color = hexToRgb(spec.color);

  const positionBytes = float32Buffer(positions);
  const indexBytes = uint16Buffer(indices);
  // Align buffers to 4-byte boundaries as required by glTF.
  const binParts = [align4(positionBytes), align4(indexBytes)];
  const bin = Buffer.concat(binParts);
  const positionByteLength = positionBytes.length;
  const indexByteOffset = align4(positionBytes).length;
  const indexByteLength = indexBytes.length;

  const json = {
    asset: { version: "2.0", generator: "ai-gamedev-procedural" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [color.r, color.g, color.b, 1],
          metallicFactor: spec.metalness,
          roughnessFactor: spec.roughness,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        max: boundsMax(positions),
        min: boundsMin(positions),
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionByteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: indexByteOffset,
        byteLength: indexByteLength,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  let jsonText = JSON.stringify(json);
  while (jsonText.length % 4 !== 0) jsonText += " ";
  const jsonChunk = Buffer.from(jsonText, "utf8");

  const totalLength = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin]);
}

function meshFor(
  shape: PrimitiveShape,
  size: { x: number; y: number; z: number },
): { positions: number[]; indices: number[] } {
  switch (shape) {
    case "box":
      return boxMesh(size.x, size.y, size.z);
    case "sphere":
      return sphereMesh(0.6 * Math.max(size.x, size.y, size.z), 12, 8);
    case "cylinder":
      return cylinderMesh(0.5 * size.x, size.y, 12);
    case "cone":
      return coneMesh(0.6 * size.x, size.y, 12);
    case "torus":
      // Approximate torus as a low cylinder ring (keeps the writer dependency-free).
      return cylinderMesh(0.5 * size.x, size.y * 0.4, 16);
    default: {
      const _never: never = shape;
      return _never;
    }
  }
}

function boxMesh(w: number, h: number, d: number): { positions: number[]; indices: number[] } {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const positions = [
    -x, -y, z, x, -y, z, x, y, z, -x, y, z,
    -x, -y, -z, -x, y, -z, x, y, -z, x, -y, -z,
    -x, y, -z, -x, y, z, x, y, z, x, y, -z,
    -x, -y, -z, x, -y, -z, x, -y, z, -x, -y, z,
    x, -y, -z, x, y, -z, x, y, z, x, -y, z,
    -x, -y, -z, -x, -y, z, -x, y, z, -x, y, -z,
  ];
  const indices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  return { positions, indices };
}

function sphereMesh(
  radius: number,
  widthSeg: number,
  heightSeg: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= heightSeg; y++) {
    const v = y / heightSeg;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSeg; x++) {
      const u = x / widthSeg;
      const theta = u * Math.PI * 2;
      positions.push(
        -radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.cos(phi),
        radius * Math.sin(theta) * Math.sin(phi),
      );
    }
  }
  for (let y = 0; y < heightSeg; y++) {
    for (let x = 0; x < widthSeg; x++) {
      const a = y * (widthSeg + 1) + x;
      const b = a + widthSeg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, indices };
}

function cylinderMesh(
  radius: number,
  height: number,
  segments: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const half = height / 2;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    positions.push(x, half, z, x, -half, z);
  }
  // Caps centers
  const topCenter = positions.length / 3;
  positions.push(0, half, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -half, 0);

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
    indices.push(topCenter, a, c);
    indices.push(bottomCenter, d, b);
  }
  return { positions, indices };
}

function coneMesh(
  radius: number,
  height: number,
  segments: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = [0, height / 2, 0];
  const indices: number[] = [];
  const tip = 0;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(theta) * radius, -height / 2, Math.sin(theta) * radius);
  }
  const baseCenter = positions.length / 3;
  positions.push(0, -height / 2, 0);
  for (let i = 1; i <= segments; i++) {
    indices.push(tip, i, i + 1);
    indices.push(baseCenter, i + 1, i);
  }
  return { positions, indices };
}

function float32Buffer(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) buf.writeFloatLE(values[i], i * 4);
  return buf;
}

function uint16Buffer(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++) buf.writeUInt16LE(values[i], i * 2);
  return buf;
}

function align4(buf: Buffer): Buffer {
  const pad = (4 - (buf.length % 4)) % 4;
  return pad === 0 ? buf : Buffer.concat([buf, Buffer.alloc(pad)]);
}

function boundsMin(positions: number[]): [number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
  }
  return [minX, minY, minZ];
}

function boundsMax(positions: number[]): [number, number, number] {
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  return [maxX, maxY, maxZ];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}
