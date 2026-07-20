import {
  detectLightingFromPrompt,
  detectSettingMotif,
  extractSetting,
  extractTitle,
  type GenerateTask,
} from "@ai-gamedev/shared";

/**
 * Deterministic offline stand-in for the local LLM. It inspects the prompt (and
 * an optional task hint) to return a plausible, task-appropriate response so the
 * pipeline stays fully functional and testable without LM Studio running.
 *
 * Responses are setting-aware (motifs) so a "dwarvy archery" shooter does not
 * collapse into the hard-coded sci-fi hangar kit.
 */
export function mockCompletion(prompt: string, task?: GenerateTask): string {
  const resolved = task ?? inferTask(prompt);
  switch (resolved) {
    case "npcDialogue":
      return mockDialogue(prompt);
    case "modelGeneration":
      return mockBlenderScript(prompt);
    case "worldBuilding":
      return mockWorld(prompt);
    case "gameDesign":
      return mockGameDesign(prompt);
    case "worldRecipe":
      return mockWorldRecipe(prompt);
    case "codeGeneration":
      return mockCode(prompt);
    case "freeform":
      return `【mock】 ${firstLine(prompt)}`;
    default: {
      // Exhaustiveness guard: adding a GenerateTask forces a compile error here.
      const _never: never = resolved;
      return _never;
    }
  }
}

function inferTask(prompt: string): GenerateTask {
  const p = prompt.toLowerCase();
  if (p.includes("dialogue")) return "npcDialogue";
  if (p.includes("blender python")) return "modelGeneration";
  if (p.includes("game design document") || p.includes("complete game design")) {
    return "gameDesign";
  }
  if (p.includes("world recipe")) return "worldRecipe";
  if (p.includes("world location") || p.includes("format as json"))
    return "worldBuilding";
  if (p.includes("typescript") || p.includes("three.js")) return "codeGeneration";
  return "freeform";
}

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() ?? "";
}

function extractQuoted(text: string, fallback: string): string {
  const match = text.match(/"([^"]+)"/);
  return match?.[1] ?? fallback;
}

function mockDialogue(prompt: string): string {
  // Prefer the explicit PLAYER ACTION field; fall back to any quoted phrase.
  const actionMatch = prompt.match(/PLAYER ACTION:\s*"([^"]+)"/);
  const action = actionMatch?.[1] ?? extractQuoted(prompt, "your arrival");
  return (
    `Ah, so the traveler ${action}? Bold of you. Careful where you step — ` +
    `such gestures have a way of waking things best left sleeping. Bring me ` +
    `three moonpetals and I'll tell you what I know.`
  );
}

function mockWorld(prompt: string): string {
  const location = extractQuoted(prompt, extractSetting(prompt) || "Forgotten Grove");
  const motif = detectSettingMotif(prompt, location);
  const lighting = detectLightingFromPrompt(prompt) ?? "day";
  return JSON.stringify(
    {
      description: `${location} is a playable slice of ${motif.label}. ${motif.atmosphere}.`,
      keyAssets: [...motif.landmarks, ...motif.ambient.slice(0, 3)],
      environment: {
        lighting,
        atmosphere: motif.atmosphere,
      },
      npcs: ["local guide"],
      interactive: [...motif.interactive],
      loot: ["supply bundle", "marked token", "healing tonic"],
    },
    null,
    2,
  );
}

function mockGameDesign(prompt: string): string {
  const racing = /\b(race|racing|arcade|car|macchin)\b/i.test(prompt);
  const shooter = /\b(shooter|fps|archery|marksman)\b/i.test(prompt);
  const motif = detectSettingMotif(prompt);
  const title = extractTitle(prompt) || extractQuoted(prompt, racing ? "Neon Circuit" : "Untitled Game");
  if (racing) {
    return JSON.stringify(
      {
        title,
        genre: "racing",
        pitch:
          "Slap neon checkpoints onto a dusk-lit bowl circuit and chase ghost laps in a glossy arcade machine.",
        visualStyle: "cinematic arcade racing with reflective paint and asphalt micro-detail",
        fidelity: "cinematic",
        palette: ["#e74c3c", "#00e5ff", "#2c3e50", "#f1c40f"],
        systems: {
          controlScheme: "drive",
          cameraMode: "chase",
          objectives: ["Hit every checkpoint", "Complete 3 laps"],
          winCondition: "Finish 3 laps",
          raceLaps: 3,
          checkpointCount: 6,
        },
        artDirection: "Glossy chassis, dusk bloom, red/white barriers, dense trackside props",
      },
      null,
      2,
    );
  }
  const genre = shooter ? "shooter" : "exploration";
  const controlScheme = shooter ? "fps" : "walk";
  return JSON.stringify(
    {
      title,
      genre,
      pitch: `Play through ${motif.label}: ${motif.atmosphere}.`,
      visualStyle: motif.visualStyle,
      fidelity: "cinematic",
      palette: motif.palette,
      systems: {
        controlScheme,
        cameraMode: "orbit_follow",
        objectives: shooter
          ? ["Hit every archery target", "Clear the training ground"]
          : ["Reach the landmark", "Collect 3 relics"],
        winCondition: shooter ? "Score hits on every target" : "Collect 3 relics",
        collectibleGoal: shooter ? 5 : 3,
      },
      artDirection: motif.atmosphere,
    },
    null,
    2,
  );
}

function mockWorldRecipe(prompt: string): string {
  const racing = /\b(racing|race|arcade)\b/i.test(prompt) && /\b(car|track|circuit|lap)\b/i.test(prompt);
  if (racing) {
    return JSON.stringify(
      {
        atmosphere: "warm dusk over asphalt",
        lighting: "dusk",
        skyColor: "#f08a4b",
        groundColor: "#2a2a2e",
        accentGroundColor: "#3a3a40",
        worldRadius: 40,
        terrain: {
          kind: "track_bowl",
          seed: 99,
          heightScale: 0.6,
          roughness: 0.35,
          resolution: 96,
        },
        postFx: {
          bloom: true,
          vignette: true,
          fogDensity: 0.02,
          saturation: 1.1,
          contrast: 1.08,
        },
        zones: [
          {
            id: "start",
            name: "Start/Finish",
            purpose: "spawn",
            center: { x: 0, z: 14 },
            radius: 6,
            landmarks: ["track checkpoint", "grandstand"],
            ambientDensity: 0.8,
            mood: "hype",
          },
        ],
        globalAmbient: ["track barrier", "cone marker", "street lamp"],
        interactive: ["track checkpoint"],
      },
      null,
      2,
    );
  }
  const motif = detectSettingMotif(prompt);
  const lighting = detectLightingFromPrompt(prompt) ?? "day";
  return JSON.stringify(
    {
      atmosphere: motif.atmosphere,
      lighting,
      skyColor: motif.skyColor,
      groundColor: motif.groundColor,
      accentGroundColor: motif.accentGroundColor,
      worldRadius: 28,
      terrain: {
        kind: motif.terrainKind ?? "rolling",
        seed: 42,
        heightScale: 1.8,
        roughness: 0.55,
        resolution: 96,
      },
      postFx: {
        bloom: true,
        vignette: true,
        fogDensity: 0.022,
        saturation: 1.12,
        contrast: 1.08,
      },
      zones: [
        {
          id: "primary",
          name: motif.label,
          purpose: "primary landmark",
          center: { x: 0, z: -11 },
          radius: 8,
          landmarks: motif.landmarks.slice(0, 4),
          ambientDensity: 0.9,
          mood: motif.label,
        },
      ],
      globalAmbient: [...motif.ambient],
      interactive: [...motif.interactive],
    },
    null,
    2,
  );
}

function mockCode(prompt: string): string {
  const task = extractQuoted(prompt, "spin the active object");
  return [
    "/**",
    ` * ${task}`,
    " * Auto-generated by the mock code generator.",
    " */",
    "import * as THREE from 'three';",
    "",
    "export function update(object: THREE.Object3D, delta: number): void {",
    "  object.rotation.y += delta * 0.5;",
    "}",
  ].join("\n");
}

function mockBlenderScript(prompt: string): string {
  const brief = extractQuoted(prompt, "game_asset");
  const name = brief.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return [
    "import bpy",
    "",
    `# Mock-generated Blender script for: ${brief}`,
    "bpy.ops.object.select_all(action='SELECT')",
    "bpy.ops.object.delete(use_global=False)",
    "",
    "bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))",
    "obj = bpy.context.active_object",
    `obj.name = "${name}"`,
    "",
    "bpy.ops.object.mode_set(mode='EDIT')",
    "bpy.ops.uv.smart_project(angle_limit=1.15)",
    "bpy.ops.object.mode_set(mode='OBJECT')",
    "",
    `mat = bpy.data.materials.new(name="${name}_mat")`,
    "mat.use_nodes = True",
    "obj.data.materials.append(mat)",
    "",
    `bpy.ops.export_scene.gltf(filepath="./assets/${name}.glb", use_format='GLB')`,
  ].join("\n");
}
