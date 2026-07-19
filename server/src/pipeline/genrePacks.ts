/**
 * Genre packs: default GameDesignDoc + WorldRecipe for offline/mock builds and
 * as scaffolding the local LLM is asked to refine. Adding a new genre means
 * adding a pack here — the pipeline stays genre-agnostic.
 */

import {
  defaultPostFx,
  defaultTerrain,
  inferGenreKind,
  type FidelityLevel,
  type GameDesignDoc,
  type GenreKind,
  type WorldRecipe,
} from "@ai-gamedev/shared";
import type { LayoutStyle, Theme } from "./heuristics.js";

export interface GenrePack {
  kind: GenreKind;
  theme: Theme;
  design: (title: string, prompt: string, fidelity: FidelityLevel) => GameDesignDoc;
  world: (title: string, fidelity: FidelityLevel) => WorldRecipe;
  mechanics: string[];
}

const CINEMATIC_NATURE =
  "lush cinematic nature — layered foliage, weathered stone, volumetric haze, rich PBR materials";

export function pickGenrePack(prompt: string): GenrePack {
  return packForKind(inferGenreKind(prompt));
}

/** Resolve the pack for an already-decided genre (e.g. from the planner). */
export function packForKind(kind: GenreKind): GenrePack {
  switch (kind) {
    case "racing":
      return RACING_PACK;
    case "shooter":
      return SHOOTER_PACK;
    case "dungeon":
      return DUNGEON_PACK;
    case "horror":
      return HORROR_PACK;
    case "survival":
      return SURVIVAL_PACK;
    case "exploration":
      return EXPLORATION_PACK;
    case "sandbox":
      return SANDBOX_PACK;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

const EXPLORATION_PACK: GenrePack = {
  kind: "exploration",
  mechanics: ["move", "explore", "interact", "collect", "objective"],
  theme: {
    genre: "Exploration adventure",
    visualStyle: CINEMATIC_NATURE,
    palette: ["#2d6a3e", "#8b5a2b", "#c4a574", "#87c4d9"],
    environment: {
      lighting: "day",
      atmosphere: "golden shafts of light through a dense canopy over ancient ruins",
      fog: true,
      groundColor: "#2a4a30",
      skyColor: "#7eb6d9",
      worldRadius: 28,
      accentGroundColor: "#3d6b45",
      terrain: defaultTerrain("rolling", "cinematic"),
      postFx: defaultPostFx("cinematic"),
    },
    defaultAssets: [
      "broken stone archway",
      "glowing moss patches",
      "ancient well",
      "toppled statue",
      "wooden supply crate",
      "gnarled hollow tree",
      "fallen stone column",
      "ruin wall",
    ],
    ambientAssets: [
      "pine tree",
      "ancient tree",
      "bush",
      "mossy boulder",
      "glowing mushroom",
      "stone pillar",
      "rubble",
      "path stone",
    ],
    layout: "forest_ruins" satisfies LayoutStyle,
  },
  design: (title, prompt, fidelity) => ({
    title,
    genre: "exploration",
    pitch: `A cinematic forest expedition through overgrown ruins — inspired by: ${prompt.trim()}`,
    visualStyle: CINEMATIC_NATURE,
    fidelity,
    palette: ["#2d6a3e", "#8b5a2b", "#c4a574", "#87c4d9"],
    systems: {
      controlScheme: "walk",
      cameraMode: "orbit_follow",
      objectives: [
        "Reach the ruined archway",
        "Collect glowing moss and supplies",
        "Discover the hollow tree shrine",
      ],
      winCondition: "Collect 3 relics hidden among the ruins",
      collectibleGoal: 3,
    },
    artDirection:
      "Weathered limestone, bioluminescent moss, dense canopy, soft god-rays, grounded realism with stylized color grading",
  }),
  world: (_title, fidelity) => ({
    atmosphere: "dappled canopy light, distant birds, cool mist in the hollows",
    lighting: "day",
    skyColor: "#7eb6d9",
    groundColor: "#2a4a30",
    accentGroundColor: "#3d6b45",
    worldRadius: 28,
    terrain: defaultTerrain("rolling", fidelity),
    postFx: defaultPostFx(fidelity),
    zones: [
      {
        id: "clearing",
        name: "Sunlit Clearing",
        purpose: "player spawn and orientation",
        center: { x: 0, z: 4 },
        radius: 5,
        landmarks: ["wooden supply crate"],
        ambientDensity: 0.4,
        mood: "safe, open",
      },
      {
        id: "path",
        name: "Moss Path",
        purpose: "guide the player north",
        center: { x: 0, z: -3 },
        radius: 4,
        landmarks: ["path stone", "glowing moss patches"],
        ambientDensity: 0.6,
        mood: "inviting",
      },
      {
        id: "ruins",
        name: "Fallen Sanctum",
        purpose: "primary exploration landmark",
        center: { x: 0, z: -11 },
        radius: 8,
        landmarks: [
          "broken stone archway",
          "ancient well",
          "toppled statue",
          "fallen stone column",
          "ruin wall",
        ],
        ambientDensity: 0.85,
        mood: "mysterious, ancient",
      },
      {
        id: "grove",
        name: "Hollow Grove",
        purpose: "side discovery",
        center: { x: -8, z: -4 },
        radius: 5,
        landmarks: ["gnarled hollow tree", "glowing mushroom"],
        ambientDensity: 1,
        mood: "enchanted",
      },
    ],
    globalAmbient: ["pine tree", "ancient tree", "bush", "mossy boulder"],
    interactive: ["ancient well", "wooden supply crate", "glowing moss patches", "glowing mushroom"],
  }),
};

const RACING_PACK: GenrePack = {
  kind: "racing",
  mechanics: ["drive", "accelerate", "brake", "checkpoint", "lap"],
  theme: {
    genre: "Arcade racing",
    visualStyle: "cinematic arcade — glossy paint, neon accents, dense trackside detail",
    palette: ["#e74c3c", "#00e5ff", "#2c3e50", "#f1c40f"],
    environment: {
      lighting: "dusk",
      atmosphere: "sunset heat shimmer over asphalt, crowd murmur, neon checkpoints",
      fog: true,
      groundColor: "#2a2a2e",
      skyColor: "#f08a4b",
      worldRadius: 40,
      accentGroundColor: "#3a3a40",
      terrain: defaultTerrain("track_bowl", "cinematic"),
      postFx: defaultPostFx("cinematic"),
    },
    defaultAssets: [
      "track checkpoint",
      "track barrier",
      "street lamp",
      "grandstand",
      "cone marker",
      "race car",
    ],
    ambientAssets: ["track barrier", "cone marker", "street lamp"],
    layout: "race_track",
  },
  design: (title, prompt, fidelity) => ({
    title,
    genre: "racing",
    pitch: `An arcade circuit racer with glossy cars and neon gates — inspired by: ${prompt.trim()}`,
    visualStyle: "cinematic arcade racing",
    fidelity,
    palette: ["#e74c3c", "#00e5ff", "#2c3e50", "#f1c40f"],
    systems: {
      controlScheme: "drive",
      cameraMode: "chase",
      objectives: ["Pass every checkpoint", "Complete 3 laps", "Beat the ghost time"],
      winCondition: "Finish 3 laps without missing checkpoints",
      raceLaps: 3,
      checkpointCount: 6,
    },
    artDirection:
      "Polished chassis, asphalt with painted lines, red/white barriers, dusk sky, bloom on neon gates",
  }),
  world: (_title, fidelity) => ({
    atmosphere: "warm dusk over a bowl-shaped asphalt circuit",
    lighting: "dusk",
    skyColor: "#f08a4b",
    groundColor: "#2a2a2e",
    accentGroundColor: "#3a3a40",
    worldRadius: 40,
    terrain: defaultTerrain("track_bowl", fidelity),
    postFx: defaultPostFx(fidelity),
    zones: [
      {
        id: "start",
        name: "Start / Finish",
        purpose: "spawn and lap counting",
        center: { x: 0, z: 14 },
        radius: 6,
        landmarks: ["track checkpoint", "grandstand"],
        ambientDensity: 0.7,
        mood: "hype",
      },
      {
        id: "chicane",
        name: "Neon Chicane",
        purpose: "technical corner",
        center: { x: 16, z: 0 },
        radius: 7,
        landmarks: ["track checkpoint", "track barrier", "cone marker"],
        ambientDensity: 0.9,
        mood: "intense",
      },
      {
        id: "backstraight",
        name: "Sunset Straight",
        purpose: "high speed",
        center: { x: 0, z: -16 },
        radius: 8,
        landmarks: ["track checkpoint", "street lamp"],
        ambientDensity: 0.5,
        mood: "speed",
      },
      {
        id: "hairpin",
        name: "Harbor Hairpin",
        purpose: "tight turn",
        center: { x: -16, z: 0 },
        radius: 7,
        landmarks: ["track checkpoint", "track barrier", "grandstand"],
        ambientDensity: 0.85,
        mood: "tense",
      },
    ],
    globalAmbient: ["track barrier", "cone marker", "street lamp"],
    interactive: ["track checkpoint"],
  }),
};

const SHOOTER_PACK: GenrePack = {
  kind: "shooter",
  mechanics: ["move", "aim", "shoot", "reload", "sprint", "cover"],
  theme: {
    genre: "Sci-fi shooter",
    visualStyle: "cinematic neon sci-fi — reflective metals, volumetric fog, emissive trim",
    palette: ["#00e5ff", "#7c4dff", "#ff4081", "#1de9b6"],
    environment: {
      lighting: "night",
      atmosphere: "cold neon haze over a derelict station deck",
      fog: true,
      groundColor: "#10131f",
      skyColor: "#05060d",
      worldRadius: 22,
      accentGroundColor: "#161b2e",
      terrain: defaultTerrain("flat", "cinematic"),
      postFx: defaultPostFx("cinematic"),
    },
    defaultAssets: ["cargo crate", "energy orb", "antenna pillar", "landing pad", "warning cone"],
    ambientAssets: ["cargo crate", "warning cone", "street lamp"],
    layout: "scatter",
  },
  design: (title, prompt, fidelity) => ({
    title,
    genre: "shooter",
    pitch: `A neon-soaked station raid — inspired by: ${prompt.trim()}`,
    visualStyle: "cinematic neon sci-fi",
    fidelity,
    palette: ["#00e5ff", "#7c4dff", "#ff4081", "#1de9b6"],
    systems: {
      controlScheme: "fps",
      cameraMode: "orbit_follow",
      objectives: ["Secure the landing pad", "Collect energy orbs"],
      winCondition: "Collect 5 energy orbs",
      collectibleGoal: 5,
    },
    artDirection: "Anodized metal, cyan/magenta trim, wet floor reflections, heavy fog",
  }),
  world: (_title, fidelity) => ({
    atmosphere: "cold neon haze",
    lighting: "night",
    skyColor: "#05060d",
    groundColor: "#10131f",
    accentGroundColor: "#161b2e",
    worldRadius: 22,
    terrain: defaultTerrain("flat", fidelity),
    postFx: defaultPostFx(fidelity),
    zones: [
      {
        id: "deck",
        name: "Hangar Deck",
        purpose: "main arena",
        center: { x: 0, z: 0 },
        radius: 10,
        landmarks: ["landing pad", "cargo crate", "antenna pillar"],
        ambientDensity: 0.8,
        mood: "tense",
      },
    ],
    globalAmbient: ["cargo crate", "warning cone", "street lamp"],
    interactive: ["energy orb", "cargo crate"],
  }),
};

const DUNGEON_PACK: GenrePack = {
  kind: "dungeon",
  mechanics: ["move", "explore", "interact", "combat"],
  theme: {
    genre: "Dungeon crawler",
    visualStyle: "cinematic subterranean stone — torch bloom, wet rock, deep contrast",
    palette: ["#9aa0a6", "#e67e22", "#6c5ce7", "#1b1b22"],
    environment: {
      lighting: "cave",
      atmosphere: "torch-lit damp air, echoing chambers",
      fog: true,
      groundColor: "#15151a",
      skyColor: "#0a0a0e",
      worldRadius: 18,
      accentGroundColor: "#1c1c24",
      terrain: defaultTerrain("caves", "cinematic"),
      postFx: defaultPostFx("cinematic"),
    },
    defaultAssets: ["stone pillar", "treasure chest", "rock boulder", "torch", "iron gate"],
    ambientAssets: ["torch", "rubble", "stone pillar"],
    layout: "dungeon",
  },
  design: (title, prompt, fidelity) => ({
    title,
    genre: "dungeon",
    pitch: `A torch-lit crawl through forgotten stone — inspired by: ${prompt.trim()}`,
    visualStyle: "cinematic subterranean stone",
    fidelity,
    palette: ["#9aa0a6", "#e67e22", "#6c5ce7", "#1b1b22"],
    systems: {
      controlScheme: "walk",
      cameraMode: "orbit_follow",
      objectives: ["Find the iron gate", "Loot the treasure chest"],
      winCondition: "Open the treasure chest",
      collectibleGoal: 1,
    },
    artDirection: "Wet limestone, ember torch light, crushed rubble, oppressive scale",
  }),
  world: (_title, fidelity) => ({
    atmosphere: "damp, torch-lit",
    lighting: "cave",
    skyColor: "#0a0a0e",
    groundColor: "#15151a",
    accentGroundColor: "#1c1c24",
    worldRadius: 18,
    terrain: defaultTerrain("caves", fidelity),
    postFx: defaultPostFx(fidelity),
    zones: [
      {
        id: "hall",
        name: "Pillar Hall",
        purpose: "main chamber",
        center: { x: 0, z: -4 },
        radius: 8,
        landmarks: ["stone pillar", "torch", "treasure chest", "iron gate"],
        ambientDensity: 0.9,
        mood: "ominous",
      },
    ],
    globalAmbient: ["torch", "rubble", "rock boulder"],
    interactive: ["treasure chest", "torch"],
  }),
};

const HORROR_PACK: GenrePack = {
  kind: "horror",
  mechanics: ["move", "explore", "hide", "collect"],
  theme: {
    genre: "Survival horror",
    visualStyle: "cinematic horror — crushed blacks, sickly greens, sparse practical lights",
    palette: ["#2d3436", "#b71540", "#6c5ce7", "#00b894"],
    environment: {
      lighting: "night",
      atmosphere: "oppressive mist, distant metallic groans",
      fog: true,
      groundColor: "#0e0f14",
      skyColor: "#05050a",
      worldRadius: 20,
      accentGroundColor: "#151820",
      terrain: defaultTerrain("rolling", "cinematic"),
      postFx: defaultPostFx("cinematic"),
    },
    defaultAssets: ["gravestone", "dead tree", "wooden crate", "lantern", "iron fence"],
    ambientAssets: ["dead tree", "gravestone", "wooden crate"],
    layout: "scatter",
  },
  design: (title, prompt, fidelity) => ({
    title,
    genre: "horror",
    pitch: `A mist-choked night you should not wander — inspired by: ${prompt.trim()}`,
    visualStyle: "cinematic horror",
    fidelity,
    palette: ["#2d3436", "#b71540", "#6c5ce7", "#00b894"],
    systems: {
      controlScheme: "walk",
      cameraMode: "orbit_follow",
      objectives: ["Reach the lantern", "Collect 3 relics"],
      winCondition: "Survive and collect 3 relics",
      collectibleGoal: 3,
    },
    artDirection: "Desaturated palette, fog walls, practical lantern light only",
  }),
  world: (_title, fidelity) => ({
    atmosphere: "oppressive mist",
    lighting: "night",
    skyColor: "#05050a",
    groundColor: "#0e0f14",
    accentGroundColor: "#151820",
    worldRadius: 20,
    terrain: defaultTerrain("rolling", fidelity),
    postFx: defaultPostFx(fidelity),
    zones: [
      {
        id: "yard",
        name: "Grave Yard",
        purpose: "main space",
        center: { x: 0, z: -2 },
        radius: 9,
        landmarks: ["gravestone", "dead tree", "lantern"],
        ambientDensity: 0.9,
        mood: "dread",
      },
    ],
    globalAmbient: ["dead tree", "gravestone", "wooden crate"],
    interactive: ["lantern", "wooden crate"],
  }),
};

const SURVIVAL_PACK: GenrePack = {
  kind: "survival",
  mechanics: ["move", "gather", "craft", "survive"],
  theme: {
    genre: "Survival adventure",
    visualStyle: "cinematic desert — heat haze, long shadows, sand micro-detail",
    palette: ["#f4d35e", "#ee964b", "#f95738", "#0d3b66"],
    environment: {
      lighting: "dusk",
      atmosphere: "dry wind, shimmering dunes",
      fog: false,
      groundColor: "#c2a86b",
      skyColor: "#f5a05a",
      worldRadius: 26,
      accentGroundColor: "#d4bc7e",
      terrain: defaultTerrain("rolling", "cinematic"),
      postFx: defaultPostFx("cinematic"),
    },
    defaultAssets: ["stone pillar", "clay pot", "cactus", "ancient chest", "sand rock"],
    ambientAssets: ["sand rock", "stone pillar", "clay pot"],
    layout: "scatter",
  },
  design: (title, prompt, fidelity) => ({
    title,
    genre: "survival",
    pitch: `Survive the dunes and uncover buried vaults — inspired by: ${prompt.trim()}`,
    visualStyle: "cinematic desert",
    fidelity,
    palette: ["#f4d35e", "#ee964b", "#f95738", "#0d3b66"],
    systems: {
      controlScheme: "walk",
      cameraMode: "orbit_follow",
      objectives: ["Find water", "Loot the ancient chest"],
      winCondition: "Loot the ancient chest",
      collectibleGoal: 1,
    },
    artDirection: "Warm sand gradients, silhouette landmarks, long dusk shadows",
  }),
  world: (_title, fidelity) => ({
    atmosphere: "dry heat",
    lighting: "dusk",
    skyColor: "#f5a05a",
    groundColor: "#c2a86b",
    accentGroundColor: "#d4bc7e",
    worldRadius: 26,
    terrain: defaultTerrain("rolling", fidelity),
    postFx: defaultPostFx(fidelity),
    zones: [
      {
        id: "oasis",
        name: "Cracked Oasis",
        purpose: "landmark",
        center: { x: 0, z: -8 },
        radius: 7,
        landmarks: ["stone pillar", "ancient chest", "cactus"],
        ambientDensity: 0.6,
        mood: "harsh hope",
      },
    ],
    globalAmbient: ["sand rock", "cactus", "clay pot"],
    interactive: ["ancient chest", "clay pot"],
  }),
};

const SANDBOX_PACK: GenrePack = {
  kind: "sandbox",
  mechanics: ["move", "explore", "interact", "build"],
  theme: {
    genre: "Sandbox adventure",
    visualStyle: "cinematic stylized world — readable silhouettes, rich materials",
    palette: ["#6c5ce7", "#00b894", "#fdcb6e", "#d63031"],
    environment: {
      lighting: "day",
      atmosphere: "bright open playground",
      fog: true,
      groundColor: "#2a4a30",
      skyColor: "#87c4d9",
      worldRadius: 24,
      accentGroundColor: "#3d6b45",
      terrain: defaultTerrain("rolling", "cinematic"),
      postFx: defaultPostFx("cinematic"),
    },
    defaultAssets: ["wooden crate", "stone pillar", "glowing orb", "treasure chest", "warning cone"],
    ambientAssets: ["wooden crate", "stone pillar", "bush"],
    layout: "scatter",
  },
  design: (title, prompt, fidelity) => ({
    title,
    genre: "sandbox",
    pitch: `An open playground shaped by your prompt — ${prompt.trim()}`,
    visualStyle: "cinematic stylized world",
    fidelity,
    palette: ["#6c5ce7", "#00b894", "#fdcb6e", "#d63031"],
    systems: {
      controlScheme: "walk",
      cameraMode: "orbit_follow",
      objectives: ["Explore the space", "Interact with landmarks"],
      winCondition: "Discover every landmark",
    },
    artDirection: "Clear silhouettes, saturated accents, soft fog for depth",
  }),
  world: (_title, fidelity) => ({
    atmosphere: "bright and inviting",
    lighting: "day",
    skyColor: "#87c4d9",
    groundColor: "#2a4a30",
    accentGroundColor: "#3d6b45",
    worldRadius: 24,
    terrain: defaultTerrain("rolling", fidelity),
    postFx: defaultPostFx(fidelity),
    zones: [
      {
        id: "plaza",
        name: "Central Plaza",
        purpose: "hub",
        center: { x: 0, z: 0 },
        radius: 8,
        landmarks: ["stone pillar", "treasure chest", "glowing orb"],
        ambientDensity: 0.7,
        mood: "playful",
      },
    ],
    globalAmbient: ["wooden crate", "bush", "stone pillar"],
    interactive: ["treasure chest", "glowing orb"],
  }),
};
