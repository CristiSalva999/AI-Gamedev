import type { GameContext, NPC } from "@ai-gamedev/shared";

/**
 * Prompt-engineering layer: turns typed game state into precise, context-aware
 * prompts for the local LLM. Templates are pure functions so they can be unit
 * tested and reused by any caller.
 */
export const generatePrompt = {
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
You are a 3D artist assistant. Generate a Blender Python script to create the following asset:

ASSET BRIEF: "${assetBrief}"

GAME CONTEXT:
- Visual Style: ${context.visualStyle}
- Existing Assets: ${Object.keys(context.assets.models).join(", ") || "none"}
- Color Palette: ${context.colorPalette?.join(", ") ?? "Not specified"}

REQUIREMENTS:
1. Generate valid Blender Python API code (bpy)
2. Use modeling techniques appropriate for "${context.visualStyle}"
3. Keep polygon count reasonable for game performance
4. Auto-unwrap UVs
5. Create a material that matches the visual style
6. Export as .glb (glTF binary format)
7. Return only valid Python code, no explanations

Ensure the object is centered at origin and scaled appropriately.`.trim(),

  worldBuilding: (location: string, context: GameContext): string => `
You are designing a game world location. Describe the structure and assets needed for:

LOCATION: "${location}"
GAME: ${context.gameTitle} (${context.gameGenre})
VISUAL STYLE: ${context.visualStyle}

Provide:
1. Description (2-3 sentences)
2. Key assets needed (list 5-8 models/objects)
3. Environmental details (lighting, atmosphere)
4. NPCs present
5. Interactive elements
6. Loot/resources available

Format as JSON for easy parsing.`.trim(),

  codeGeneration: (task: string, context: GameContext): string => `
You are generating TypeScript code for a Three.js game.

TASK: "${task}"
GAME CONTEXT: ${context.gameTitle} (${context.gameGenre})

EXISTING CODE:
${context.generatedScripts["engine.ts"] ?? "// Engine not yet created"}

REQUIREMENTS:
1. Write clean, documented TypeScript
2. Follow Three.js best practices
3. Integrate with existing codebase
4. Export as ES6 modules
5. Include JSDoc comments

Generate ONLY the code snippet needed for this task.`.trim(),
} as const;

export const SYSTEM_PROMPT = (context: GameContext): string =>
  `You are an AI game development assistant for ${context.gameTitle}. ` +
  `Keep responses concise, focused, and directly applicable to game development. ` +
  `Always output valid code or JSON when requested.`;
