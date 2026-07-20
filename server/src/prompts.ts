import { GENRE_KINDS, type FidelityLevel, type GameContext, type GenreKind, type NPC } from "@ai-gamedev/shared";

/**
 * Prompt-engineering layer: turns typed game state into precise, context-aware
 * prompts for the local LLM. Templates are pure functions so they can be unit
 * tested and reused by any caller.
 *
 * The gameDesign / worldRecipe prompts ask the model for rich structured JSON
 * so a local LM Studio instance can author near-final game content; mocks
 * supply the same shapes offline.
 */
export const generatePrompt = {
  /**
   * Ask the model to understand and decompose the request, then merge it back
   * into a single goal-focused plan. This is the "layer of thought" that
   * identifies what is actually being requested before any building starts.
   */
  planning: (prompt: string): string => `
You are a senior game director. Analyze the following game request and produce a focused build plan.

Think in this order, then MERGE everything back into one coherent goal:
1. Clarify the request in its entirety (what game does the player actually want?).
2. Break the request into a few high-level SUB-REQUESTS.
3. Break each sub-request into TASKS.
4. Break each task into concrete SUBTASKS.
5. Keep every level focused on the single core goal — ignore incidental descriptive fluff.

Pick the genre by the player's CORE intent and mechanics, not stray words. It MUST be exactly one of:
${GENRE_KINDS.join(", ")}.

USER REQUEST:
"""
${prompt.slice(0, 6000)}
"""

Return ONLY JSON in this exact shape:
{
  "goal": string,                     // one focused sentence capturing the whole request
  "genre": one of [${GENRE_KINDS.join(", ")}],
  "title": string,
  "setting": string,
  "objective": string,                // what the player must do
  "keyFeatures": string[],            // merged, goal-focused
  "subRequests": [
    { "title": string, "tasks": [ { "title": string, "subtasks": string[] } ] }
  ]
}`.trim(),

  npcDialogue: (npc: NPC, context: GameContext, playerAction: string): string => `
You are generating dialogue for "${npc.name}", a ${npc.role} in ${context.gameTitle}.

GAME CONTEXT:
- Genre: ${context.gameGenre}
- Visual Style: ${context.visualStyle}
- Current Mission: ${context.currentMission ?? "none"}
- World State: ${JSON.stringify(context.worldState)}

CHARACTER PROFILE:
- Personality: ${npc.personality}
- Background: ${npc.background}
- Relationships: ${JSON.stringify(npc.relationships)}

PLAYER ACTION: "${playerAction}"

Generate a short, in-character response (1-3 sentences) that:
1. Stays true to the character
2. Acknowledges the player's action
3. Advances the narrative or gameplay

Response format: Just the dialogue text, no asterisks or stage directions.`.trim(),

  modelGeneration: (assetBrief: string, context: GameContext): string => `
You are a senior 3D environment artist. Generate a Blender Python script for a HIGH-DETAIL game asset (not low-poly placeholders).

ASSET BRIEF: "${assetBrief}"

GAME CONTEXT:
- Visual Style: ${context.visualStyle}
- Existing Assets: ${Object.keys(context.assets.models).join(", ") || "none"}
- Color Palette: ${context.colorPalette?.join(", ") ?? "Not specified"}

REQUIREMENTS:
1. Valid Blender Python (bpy) only — no explanations
2. Prefer subdivision, bevels, multiple materials, and weathering detail
3. Target a polished cinematic look matching "${context.visualStyle}"
4. Auto-unwrap UVs; create PBR materials (base color, roughness, subtle emission if magical)
5. Export as .glb
6. Center at origin, sensible real-world scale

Return only Python code.`.trim(),

  worldBuilding: (location: string, context: GameContext): string => `
You are designing a richly detailed game world location for a near-final vertical slice.

LOCATION: "${location}"
GAME: ${context.gameTitle} (${context.gameGenre})
VISUAL STYLE: ${context.visualStyle}

Provide JSON with:
1. description (2-3 sentences, cinematic)
2. keyAssets (8-14 named set pieces)
3. environment { lighting, atmosphere }
4. npcs
5. interactive
6. loot
7. zones (optional): [{ name, purpose, landmarks }]`.trim(),

  gameDesign: (
    prompt: string,
    title: string,
    genre: GenreKind,
    fidelity: FidelityLevel,
  ): string => `
You are the lead designer on an AI game studio. Author a COMPLETE game design document as JSON for a ${fidelity} build.

USER PROMPT: "${prompt}"
WORKING TITLE: "${title}"
GENRE HINT: "${genre}"

Return ONLY JSON with this shape:
{
  "title": string,
  "genre": "${genre}" | exploration|racing|shooter|dungeon|survival|horror|sandbox,
  "pitch": string (2 sentences, evocative),
  "visualStyle": string (explicitly NOT low-poly — describe cinematic/detailed materials),
  "fidelity": "${fidelity}",
  "palette": string[4],
  "systems": {
    "controlScheme": "walk"|"drive"|"fly"|"twin_stick"|"fps",
    "cameraMode": "orbit_follow"|"chase"|"top_down"|"first_person",
    "objectives": string[],
    "winCondition": string,
    "raceLaps"?: number,
    "checkpointCount"?: number,
    "collectibleGoal"?: number
  },
  "artDirection": string
}`.trim(),

  worldRecipe: (
    title: string,
    genre: GenreKind,
    fidelity: FidelityLevel,
    prompt = "",
  ): string => `
You are a world director. Author a WORLD RECIPE JSON for "${title}" (${genre}, fidelity=${fidelity}).

USER REQUEST (honour the setting, time of day, and storyline — do NOT invent an unrelated sci-fi hangar or forest if the prompt asks for something else):
"""
${prompt.slice(0, 4000)}
"""

Landmark and ambient briefs MUST match the requested setting (e.g. archery targets + hay bales for a dwarven archery range; stone ruins for a forest; neon props only when the prompt is sci-fi).

Return ONLY JSON:
{
  "atmosphere": string,
  "lighting": "day"|"dusk"|"night"|"cave",
  "skyColor": "#rrggbb",
  "groundColor": "#rrggbb",
  "accentGroundColor": "#rrggbb",
  "worldRadius": number (20-45),
  "terrain": { "kind": "flat"|"rolling"|"mountainous"|"track_bowl"|"caves", "seed": number, "heightScale": number, "roughness": number, "resolution": number },
  "postFx": { "bloom": boolean, "vignette": boolean, "fogDensity": number, "saturation": number, "contrast": number },
  "zones": [{ "id": string, "name": string, "purpose": string, "center": {"x":number,"z":number}, "radius": number, "landmarks": string[], "ambientDensity": number, "mood": string }],
  "globalAmbient": string[],
  "interactive": string[]
}

Make it dense and playable — enough landmarks and ambient density for a vertical slice, not a sparse prototype.`.trim(),

  codeGeneration: (task: string, context: GameContext): string => `
You are generating production TypeScript for a Three.js game vertical slice.

TASK: "${task}"
GAME CONTEXT: ${context.gameTitle} (${context.gameGenre})
VISUAL STYLE: ${context.visualStyle}

EXISTING CODE:
${context.generatedScripts["engine.ts"] ?? "// Engine not yet created"}

REQUIREMENTS:
1. Clean, documented TypeScript (ES modules)
2. Three.js best practices; support walk OR drive controllers when relevant
3. Include objective / checkpoint hooks where appropriate
4. JSDoc on exported functions
5. Generate ONLY the code`.trim(),
} as const;

export const SYSTEM_PROMPT = (context: GameContext): string =>
  `You are an AI game development assistant for ${context.gameTitle}. ` +
  `Keep responses concise, focused, and directly applicable to game development. ` +
  `Always output valid code or JSON when requested.`;
