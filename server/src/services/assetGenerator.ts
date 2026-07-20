import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildPrefab,
  enrichDefinition,
  prefabForBrief,
  type Asset,
  type AssetSpec,
  type FidelityLevel,
  type GameContext,
  type GenerationSource,
  type PrefabKind,
  type PrimitiveShape,
} from "@ai-gamedev/shared";
import { generatePrompt } from "../prompts.js";
import { writeProceduralGlb } from "./glbWriter.js";
import type { LLMClient } from "./llmClient.js";

const execFileAsync = promisify(execFile);

/**
 * Candidate Blender executables. On Windows the installer rarely adds
 * `blender` to PATH, so we also probe the usual Program Files locations.
 */
export async function blenderCandidatePaths(
  configured = process.env.BLENDER_BIN ?? "blender",
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const candidates = [configured];
  if (process.platform === "win32") {
    const roots = [
      env["ProgramFiles"],
      env["ProgramFiles(x86)"],
      env.LOCALAPPDATA,
      // Fallbacks when the parent shell did not forward ProgramFiles.
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter((v): v is string => Boolean(v));
    for (const root of [...new Set(roots)]) {
      const foundation = path.join(root, "Blender Foundation");
      try {
        const versions = await readdir(foundation);
        // Prefer newest folder name first (Blender 4.5 > 4.0 > 3.6…).
        for (const version of versions.sort().reverse()) {
          candidates.push(path.join(foundation, version, "blender.exe"));
        }
      } catch {
        // Directory missing — ignore.
      }
      // Steam / flat installs sometimes skip the versioned folder.
      candidates.push(path.join(root, "Blender", "blender.exe"));
    }
  }
  // Deduplicate while preserving order.
  return [...new Set(candidates.filter(Boolean))];
}

export interface AssetGenerationResult {
  asset: Asset;
  blenderScript: string;
  source: GenerationSource;
}

/**
 * Turns a natural-language brief into a renderable asset. Tries real Blender
 * when available; otherwise writes a procedural .glb and returns an illustrative
 * bpy script for traceability.
 */
export interface AssetGenerator {
  generate(
    brief: string,
    context: GameContext,
    options?: { outputDir?: string; fidelity?: FidelityLevel },
  ): Promise<AssetGenerationResult>;
  /** Whether a real Blender binary is on PATH / configured. */
  blenderAvailable(): Promise<boolean>;
  /** Optional diagnostics for startup logs and health. */
  probeBlender?(): Promise<BlenderProbeResult>;
}

const SHAPE_KEYWORDS: Array<[PrimitiveShape, string[]]> = [
  ["sphere", ["ball", "orb", "sphere", "rock", "boulder", "potion", "gem", "moon", "moss", "bush", "shrub"]],
  ["cylinder", ["barrel", "pillar", "column", "trunk", "bottle", "tower", "log", "can", "well", "statue", "torch", "lantern", "pot", "cactus", "fountain", "stump", "pad"]],
  ["cone", ["cone", "tent", "spike", "pine", "roof", "hat", "dart", "tree", "spire", "mushroom"]],
  ["torus", ["ring", "torus", "donut", "wheel", "loop"]],
  ["box", ["crate", "box", "chest", "cube", "block", "brick", "table", "wall", "arch", "gate", "fence", "gravestone", "stone", "monument"]],
];

const COLOR_KEYWORDS: Array<[string, string[]]> = [
  ["#8b5a2b", ["wood", "wooden", "crate", "barrel", "log", "trunk"]],
  ["#ffd700", ["gold", "golden", "treasure", "coin"]],
  ["#9aa0a6", ["stone", "rock", "steel", "iron", "metal"]],
  ["#2ecc71", ["grass", "leaf", "green", "moss", "plant", "herb"]],
  ["#3498db", ["water", "ice", "crystal", "blue"]],
  ["#e74c3c", ["fire", "lava", "red", "ruby", "flame"]],
  ["#8e44ad", ["magic", "arcane", "purple", "amethyst"]],
];

export class MockBlenderAssetGenerator implements AssetGenerator {
  constructor(private readonly llm: LLMClient) {}

  async blenderAvailable(): Promise<boolean> {
    return false;
  }

  async probeBlender(): Promise<BlenderProbeResult> {
    return {
      available: false,
      tried: [],
      hint: "Using procedural mock generator (tests / offline).",
    };
  }

  async generate(
    brief: string,
    context: GameContext,
    options: { outputDir?: string; fidelity?: FidelityLevel } = {},
  ): Promise<AssetGenerationResult> {
    const prompt = generatePrompt.modelGeneration(brief, context);
    const { text: blenderScript, source } = await this.llm.generate(prompt, {
      task: "modelGeneration",
    });

    const fidelity = options.fidelity ?? "cinematic";
    const spec = deriveSpec(brief, context, fidelity);
    const id = `model_${slug(brief)}_${Date.now().toString(36)}`;
    let assetSource: string | undefined;

    if (options.outputDir) {
      const glbPath = path.join(options.outputDir, `${id}.glb`);
      await writeProceduralGlb(spec, glbPath);
      assetSource = glbPath;
    }

    const asset: Asset = {
      id,
      name: brief.trim() || "asset",
      source: assetSource,
      spec,
      createdAt: Date.now(),
    };

    return { asset, blenderScript, source };
  }
}

export interface BlenderProbeResult {
  available: boolean;
  path?: string;
  /** Candidates that were tried (for startup / health diagnostics). */
  tried: string[];
  hint?: string;
}

/**
 * Prefer real Blender when `BLENDER_BIN` / `blender` is available; otherwise
 * fall through to procedural GLB generation (cloud-safe).
 */
export class HybridBlenderAssetGenerator implements AssetGenerator {
  private blenderPath: string | null | undefined;
  private lastProbe: BlenderProbeResult | undefined;

  constructor(
    private readonly llm: LLMClient,
    private readonly fallback: MockBlenderAssetGenerator = new MockBlenderAssetGenerator(llm),
    private readonly blenderBin = process.env.BLENDER_BIN ?? "blender",
  ) {}

  async blenderAvailable(): Promise<boolean> {
    const resolved = await this.resolveBlender();
    return resolved !== null;
  }

  /** Full probe result for startup logs and `/api/health`. */
  async probeBlender(): Promise<BlenderProbeResult> {
    await this.resolveBlender();
    return (
      this.lastProbe ?? {
        available: false,
        tried: [],
        hint: blenderMissingHint(this.blenderBin),
      }
    );
  }

  async generate(
    brief: string,
    context: GameContext,
    options: { outputDir?: string; fidelity?: FidelityLevel } = {},
  ): Promise<AssetGenerationResult> {
    const blender = await this.resolveBlender();
    if (!blender || !options.outputDir) {
      return this.fallback.generate(brief, context, options);
    }

    const prompt = generatePrompt.modelGeneration(brief, context);
    const { text: blenderScript, source } = await this.llm.generate(prompt, {
      task: "modelGeneration",
    });
    const fidelity = options.fidelity ?? "cinematic";
    const spec = deriveSpec(brief, context, fidelity);
    const id = `model_${slug(brief)}_${Date.now().toString(36)}`;
    const glbPath = path.join(options.outputDir, `${id}.glb`);
    const scriptPath = path.join(options.outputDir, `${id}.py`);

    // With a real model, run its authored script (but force a correct export);
    // offline, drive Blender from the derived spec so it builds the actual
    // multi-part prefab geometry rather than a generic placeholder. Either way
    // Blender is the tool that authors and exports the .glb.
    const safeScript =
      source === "llm"
        ? sanitizeBlenderScript(blenderScript, glbPath, spec)
        : buildAssetBlenderScript(spec, glbPath, brief);
    await writeText(scriptPath, safeScript);

    try {
      await execFileAsync(
        blender,
        ["--background", "--python", scriptPath],
        { timeout: 60_000 },
      );
      await access(glbPath, constants.R_OK);
      return {
        asset: {
          id,
          name: brief.trim() || "asset",
          source: glbPath,
          spec,
          createdAt: Date.now(),
        },
        blenderScript: safeScript,
        source: "blender",
      };
    } catch {
      // Blender failed or produced nothing — procedural GLB keeps the pipeline moving.
      return this.fallback.generate(brief, context, options);
    }
  }

  private async resolveBlender(): Promise<string | null> {
    if (this.blenderPath !== undefined) return this.blenderPath;
    const candidates = await blenderCandidatePaths(this.blenderBin);
    for (const candidate of candidates) {
      try {
        // windowsHide avoids a flashing console; longer timeout for cold HDD starts.
        await execFileAsync(candidate, ["--version"], {
          timeout: 15_000,
          windowsHide: true,
        });
        this.blenderPath = candidate;
        this.lastProbe = { available: true, path: candidate, tried: candidates };
        return this.blenderPath;
      } catch {
        // try next candidate
      }
    }
    this.blenderPath = null;
    this.lastProbe = {
      available: false,
      tried: candidates,
      hint: blenderMissingHint(this.blenderBin),
    };
    return this.blenderPath;
  }
}

/** Short, copy-pasteable guidance when Blender is missing from PATH / env. */
export function blenderMissingHint(configured = "blender"): string {
  if (process.platform === "win32") {
    return (
      `Create server/.env with one line: ` +
      `BLENDER_BIN=C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe ` +
      `then restart npm run dev. (Your blender.exe works in CMD but is not on PATH.)`
    );
  }
  return (
    `Install Blender or set BLENDER_BIN to the binary path (current: "${configured}"), ` +
    `then restart the server.`
  );
}

/** Deterministic brief -> geometry mapping (pure, easily testable). */
export function deriveSpec(
  brief: string,
  context: GameContext,
  fidelity: FidelityLevel = "cinematic",
): AssetSpec {
  const lower = brief.toLowerCase();
  const scale = sizeMultiplier(lower);
  const prefab = prefabForBrief(brief);
  const colorOverride = matchKeyword(lower, COLOR_KEYWORDS);

  if (prefab !== "primitive") {
    return specFromPrefab(prefab, scale, colorOverride, fidelity);
  }

  const shape = matchKeyword(lower, SHAPE_KEYWORDS) ?? "box";
  const color =
    colorOverride ??
    pickFromPalette(brief, context.colorPalette);

  return {
    shape,
    color,
    size: { x: scale, y: scale, z: scale },
    roughness: 0.7,
    metalness: color === "#ffd700" || color === "#9aa0a6" ? 0.6 : 0.1,
    prefab: "primitive",
    fidelity,
    parts: [
      {
        shape,
        color,
        size: { x: scale, y: scale, z: scale },
        offset: { x: 0, y: scale / 2, z: 0 },
        roughness: 0.7,
        metalness: color === "#ffd700" || color === "#9aa0a6" ? 0.6 : 0.1,
        materialHint: {
          family: color === "#ffd700" ? "metal" : "stone",
          segments: fidelity === "cinematic" ? 28 : 16,
        },
      },
    ],
  };
}

function specFromPrefab(
  kind: PrefabKind,
  scale: number,
  colorOverride: string | undefined,
  fidelity: FidelityLevel,
): AssetSpec {
  const enriched = enrichDefinition(buildPrefab(kind, scale), fidelity);
  const metalness =
    colorOverride === "#ffd700" || colorOverride === "#9aa0a6"
      ? 0.6
      : enriched.metalness;
  const parts = colorOverride
    ? enriched.parts.map((part, index) =>
        // Tint the dominant body part; keep moss/emissive accents untouched.
        index === 0 || !part.emissive
          ? { ...part, color: colorOverride, metalness }
          : part,
      )
    : enriched.parts;
  return {
    shape: enriched.shape,
    color: colorOverride ?? enriched.color,
    size: enriched.size,
    roughness: enriched.roughness,
    metalness,
    prefab: enriched.kind,
    fidelity,
    parts,
  };
}

/**
 * Ensures author-provided (LLM) Blender scripts are self-contained and export
 * to the intended path/format. Unsafe or empty scripts fall back to a known-good
 * spec-driven script. Any export the author wrote is stripped and replaced with
 * ours so the .glb always lands at `glbPath` as a valid GLB.
 */
function sanitizeBlenderScript(
  code: string,
  glbPath: string,
  spec: AssetSpec,
): string {
  const dangerous =
    /\b(os\.system|subprocess|socket|urllib|requests|eval\s*\(|exec\s*\(|__import__)\b/.test(
      code,
    );
  if (dangerous || !code.includes("bpy") || code.length < 40) {
    return buildAssetBlenderScript(spec, glbPath);
  }
  const body = code
    .split("\n")
    .filter((line) => !line.includes("export_scene.gltf"))
    .join("\n")
    .trim();
  return `${body}\n\nimport bpy\nbpy.ops.export_scene.gltf(filepath=r"${glbPath}", export_format='GLB')\n`;
}

const PRIMITIVE_OP: Record<PrimitiveShape, string> = {
  sphere: "primitive_uv_sphere_add",
  cylinder: "primitive_cylinder_add",
  cone: "primitive_cone_add",
  torus: "primitive_torus_add",
  box: "primitive_cube_add",
};

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.8, 0.8, 0.8];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Build a deterministic Blender (bpy) script that constructs the asset's
 * multi-part geometry from its {@link AssetSpec} and exports a GLB. This is what
 * lets Blender itself author game assets offline (no LLM required).
 */
export function buildAssetBlenderScript(
  spec: AssetSpec,
  glbPath: string,
  brief = "asset",
): string {
  const parts =
    spec.parts && spec.parts.length > 0
      ? spec.parts
      : [
          {
            shape: spec.shape,
            color: spec.color,
            size: spec.size,
            offset: { x: 0, y: spec.size.y / 2, z: 0 },
            roughness: spec.roughness,
            metalness: spec.metalness,
          },
        ];

  const lines: string[] = [
    "import bpy",
    "bpy.ops.object.select_all(action='SELECT')",
    "bpy.ops.object.delete(use_global=False)",
  ];

  parts.forEach((part, i) => {
    const [r, g, b] = hexToRgb(part.color ?? spec.color);
    const rough = part.roughness ?? spec.roughness;
    const metal = part.metalness ?? spec.metalness;
    const sx = Math.max(part.size.x, 0.05);
    const sy = Math.max(part.size.y, 0.05);
    const sz = Math.max(part.size.z, 0.05);
    lines.push(
      `bpy.ops.mesh.${PRIMITIVE_OP[part.shape]}()`,
      "obj = bpy.context.active_object",
      `obj.name = ${JSON.stringify(`${slug(brief)}_${i}`)}`,
      `obj.scale = (${sx.toFixed(3)}, ${sz.toFixed(3)}, ${sy.toFixed(3)})`,
      `obj.location = (${(part.offset?.x ?? 0).toFixed(3)}, ${(part.offset?.z ?? 0).toFixed(3)}, ${(part.offset?.y ?? 0).toFixed(3)})`,
      `mat = bpy.data.materials.new(name="mat_${i}")`,
      "mat.use_nodes = True",
      'bsdf = mat.node_tree.nodes.get("Principled BSDF")',
      "if bsdf:",
      `    bsdf.inputs["Base Color"].default_value = (${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, 1)`,
      `    bsdf.inputs["Metallic"].default_value = ${metal}`,
      `    bsdf.inputs["Roughness"].default_value = ${rough}`,
      "obj.data.materials.append(mat)",
    );
  });

  lines.push(
    `bpy.ops.export_scene.gltf(filepath=r"${glbPath}", export_format='GLB')`,
    "",
  );
  return lines.join("\n");
}

async function writeText(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function matchKeyword<T>(text: string, table: Array<[T, string[]]>): T | undefined {
  for (const [value, keywords] of table) {
    if (keywords.some((kw) => text.includes(kw))) return value;
  }
  return undefined;
}

function sizeMultiplier(text: string): number {
  if (/\b(giant|huge|massive|colossal|large|big)\b/.test(text)) return 2;
  if (/\b(small|tiny|little|mini)\b/.test(text)) return 0.5;
  return 1;
}

function pickFromPalette(brief: string, palette?: string[]): string {
  const fallback = ["#6c5ce7", "#00b894", "#fdcb6e", "#d63031"];
  const colors = palette && palette.length > 0 ? palette : fallback;
  let hash = 0;
  for (const ch of brief) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

function slug(text: string): string {
  return text.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "asset";
}
