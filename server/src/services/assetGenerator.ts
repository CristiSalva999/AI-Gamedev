import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type Asset,
  type AssetSpec,
  type GameContext,
  type GenerationSource,
  type PrimitiveShape,
} from "@ai-gamedev/shared";
import { generatePrompt } from "../prompts.js";
import { writeProceduralGlb } from "./glbWriter.js";
import type { LLMClient } from "./llmClient.js";

const execFileAsync = promisify(execFile);

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
    options?: { outputDir?: string },
  ): Promise<AssetGenerationResult>;
  /** Whether a real Blender binary is on PATH. */
  blenderAvailable(): Promise<boolean>;
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

  async generate(
    brief: string,
    context: GameContext,
    options: { outputDir?: string } = {},
  ): Promise<AssetGenerationResult> {
    const prompt = generatePrompt.modelGeneration(brief, context);
    const { text: blenderScript, source } = await this.llm.generate(prompt, {
      task: "modelGeneration",
    });

    const spec = deriveSpec(brief, context);
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

/**
 * Prefer real Blender when `BLENDER_BIN` / `blender` is available; otherwise
 * fall through to procedural GLB generation (cloud-safe).
 */
export class HybridBlenderAssetGenerator implements AssetGenerator {
  private blenderPath: string | null | undefined;

  constructor(
    private readonly llm: LLMClient,
    private readonly fallback: MockBlenderAssetGenerator = new MockBlenderAssetGenerator(llm),
    private readonly blenderBin = process.env.BLENDER_BIN ?? "blender",
  ) {}

  async blenderAvailable(): Promise<boolean> {
    const resolved = await this.resolveBlender();
    return resolved !== null;
  }

  async generate(
    brief: string,
    context: GameContext,
    options: { outputDir?: string } = {},
  ): Promise<AssetGenerationResult> {
    const blender = await this.resolveBlender();
    if (!blender || !options.outputDir) {
      return this.fallback.generate(brief, context, options);
    }

    const prompt = generatePrompt.modelGeneration(brief, context);
    const { text: blenderScript } = await this.llm.generate(prompt, {
      task: "modelGeneration",
    });
    const spec = deriveSpec(brief, context);
    const id = `model_${slug(brief)}_${Date.now().toString(36)}`;
    const glbPath = path.join(options.outputDir, `${id}.glb`);
    const scriptPath = path.join(options.outputDir, `${id}.py`);

    // Harden: only run our own generated script file, never shell-interpolated.
    const safeScript = sanitizeBlenderScript(blenderScript, glbPath, spec);
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
    try {
      await execFileAsync(this.blenderBin, ["--version"], { timeout: 5_000 });
      this.blenderPath = this.blenderBin;
    } catch {
      this.blenderPath = null;
    }
    return this.blenderPath;
  }
}

/** Deterministic brief -> geometry mapping (pure, easily testable). */
export function deriveSpec(brief: string, context: GameContext): AssetSpec {
  const lower = brief.toLowerCase();
  const shape = matchKeyword(lower, SHAPE_KEYWORDS) ?? "box";
  const color =
    matchKeyword(lower, COLOR_KEYWORDS) ??
    pickFromPalette(brief, context.colorPalette);

  const scale = sizeMultiplier(lower);
  return {
    shape,
    color,
    size: { x: scale, y: scale, z: scale },
    roughness: 0.7,
    metalness: color === "#ffd700" || color === "#9aa0a6" ? 0.6 : 0.1,
  };
}

/**
 * Ensures Blender scripts are self-contained and export to the intended path.
 * If the LLM output looks unsafe or incomplete, emit a known-good bpy script.
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
    return defaultBlenderScript(glbPath, spec);
  }
  // Append an explicit export so LLM scripts without one still produce a file.
  if (!code.includes("export_scene.gltf") && !code.includes("gltf")) {
    return `${code.trim()}\n\nimport bpy\nbpy.ops.export_scene.gltf(filepath=r"${glbPath}", export_format='GLB')\n`;
  }
  return code;
}

function defaultBlenderScript(glbPath: string, spec: AssetSpec): string {
  const op =
    spec.shape === "sphere"
      ? "primitive_uv_sphere_add"
      : spec.shape === "cylinder"
        ? "primitive_cylinder_add"
        : spec.shape === "cone"
          ? "primitive_cone_add"
          : spec.shape === "torus"
            ? "primitive_torus_add"
            : "primitive_cube_add";
  return `import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.${op}(size=${Math.max(spec.size.x, 0.5)})
obj = bpy.context.active_object
mat = bpy.data.materials.new(name="Mat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Metallic"].default_value = ${spec.metalness}
    bsdf.inputs["Roughness"].default_value = ${spec.roughness}
obj.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=r"${glbPath}", export_format='GLB')
`;
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
