import * as THREE from "three";
import type { MaterialHint, MeshPart } from "@ai-gamedev/shared";

const textureCache = new Map<string, THREE.CanvasTexture>();

/** Procedural tileable maps so cinematic builds aren't flat plastic. */
export function createPartMaterial(part: MeshPart): THREE.MeshStandardMaterial {
  const hint = part.materialHint;
  const map = hint ? proceduralMap(hint) : null;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(part.color),
    roughness: part.roughness ?? 0.75,
    metalness: part.metalness ?? 0.05,
    map: map ?? undefined,
    roughnessMap: hint && hint.family !== "emissive" ? map ?? undefined : undefined,
    emissive: part.emissive ? new THREE.Color(part.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: part.emissiveIntensity ?? 0,
  });
  if (map) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
  }
  return material;
}

function proceduralMap(hint: MaterialHint): THREE.CanvasTexture {
  const key = hint.family;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const empty = new THREE.CanvasTexture(canvas);
    textureCache.set(key, empty);
    return empty;
  }

  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = hash(x, y, key);
      const shade = toneFor(hint.family, n, x, y);
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

function toneFor(family: MaterialHint["family"], n: number, x: number, y: number): number {
  switch (family) {
    case "bark":
      return 90 + Math.floor(n * 50) + ((x * 3 + y) % 7);
    case "stone":
      return 120 + Math.floor(n * 80);
    case "foliage":
      return 70 + Math.floor(n * 90);
    case "wood":
      return 100 + Math.floor(n * 40) + (y % 11);
    case "metal":
      return 160 + Math.floor(n * 60);
    case "asphalt":
      return 40 + Math.floor(n * 35);
    case "paint":
      return 180 + Math.floor(n * 40);
    case "emissive":
      return 220 + Math.floor(n * 30);
    default: {
      const _never: never = family;
      return _never;
    }
  }
}

function hash(x: number, y: number, salt: string): number {
  let h = 0;
  for (let i = 0; i < salt.length; i++) h = (h * 31 + salt.charCodeAt(i)) >>> 0;
  const n = Math.sin(x * 12.9898 + y * 78.233 + h) * 43758.5453;
  return n - Math.floor(n);
}
