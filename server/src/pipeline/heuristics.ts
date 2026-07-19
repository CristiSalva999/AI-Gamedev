import {
  createBobClip,
  createIdleClip,
  createPatrolClip,
  createPulseClip,
  createSpinClip,
  createWalkClip,
  type BlueprintEntity,
  type EnvironmentSpec,
  type LightingMood,
  type PlayerSpec,
} from "@ai-gamedev/shared";

/**
 * Deterministic, dependency-free heuristics that translate a natural-language
 * game prompt into concrete design decisions. Keeping these pure and testable
 * means the pipeline produces sensible output even when the LLM is mocked or
 * returns unstructured text.
 */
export interface Theme {
  genre: string;
  visualStyle: string;
  palette: string[];
  environment: EnvironmentSpec;
  /** Default asset briefs used when world-building yields nothing usable. */
  defaultAssets: string[];
}

interface ThemeRule {
  keywords: string[];
  theme: Theme;
}

const THEMES: ThemeRule[] = [
  {
    keywords: ["space", "sci-fi", "scifi", "galaxy", "star", "alien", "cyber", "neon", "robot"],
    theme: {
      genre: "Sci-fi shooter",
      visualStyle: "sleek low-poly neon",
      palette: ["#00e5ff", "#7c4dff", "#ff4081", "#1de9b6"],
      environment: {
        lighting: "night",
        atmosphere: "cold, humming with distant machinery",
        fog: true,
        groundColor: "#10131f",
        skyColor: "#05060d",
      },
      defaultAssets: ["cargo crate", "energy orb", "antenna pillar", "landing pad", "warning cone"],
    },
  },
  {
    keywords: ["forest", "jungle", "nature", "woodland", "grove", "druid", "elf"],
    theme: {
      genre: "Exploration adventure",
      visualStyle: "stylized low-poly nature",
      palette: ["#2ecc71", "#27ae60", "#8b5a2b", "#f1c40f"],
      environment: {
        lighting: "day",
        atmosphere: "dappled sunlight, birdsong",
        fog: false,
        groundColor: "#1e3a24",
        skyColor: "#7ec8e3",
      },
      defaultAssets: ["ancient tree", "mossy boulder", "wooden crate", "glowing mushroom", "stone pillar"],
    },
  },
  {
    keywords: ["dungeon", "cave", "crypt", "cavern", "mine", "underground", "tomb"],
    theme: {
      genre: "Dungeon crawler",
      visualStyle: "gritty low-poly stone",
      palette: ["#9aa0a6", "#6c5ce7", "#e67e22", "#c0392b"],
      environment: {
        lighting: "cave",
        atmosphere: "damp, torch-lit, echoing",
        fog: true,
        groundColor: "#15151a",
        skyColor: "#0a0a0e",
      },
      defaultAssets: ["stone pillar", "treasure chest", "rock boulder", "torch", "iron gate"],
    },
  },
  {
    keywords: ["desert", "sand", "dune", "oasis", "pyramid", "egypt"],
    theme: {
      genre: "Survival adventure",
      visualStyle: "warm low-poly desert",
      palette: ["#f4d35e", "#ee964b", "#f95738", "#0d3b66"],
      environment: {
        lighting: "dusk",
        atmosphere: "dry heat, shifting sands",
        fog: false,
        groundColor: "#c2a86b",
        skyColor: "#f5a05a",
      },
      defaultAssets: ["stone pillar", "clay pot", "cactus", "ancient chest", "sand rock"],
    },
  },
  {
    keywords: ["horror", "haunted", "zombie", "ghost", "spooky", "nightmare", "dark"],
    theme: {
      genre: "Survival horror",
      visualStyle: "moody low-poly",
      palette: ["#6c5ce7", "#2d3436", "#b71540", "#00b894"],
      environment: {
        lighting: "night",
        atmosphere: "oppressive silence, cold mist",
        fog: true,
        groundColor: "#0e0f14",
        skyColor: "#05050a",
      },
      defaultAssets: ["gravestone", "dead tree", "wooden crate", "lantern", "iron fence"],
    },
  },
];

const FALLBACK_THEME: Theme = {
  genre: "Action RPG",
  visualStyle: "stylized low-poly",
  palette: ["#6c5ce7", "#00b894", "#fdcb6e", "#d63031"],
  environment: {
    lighting: "day",
    atmosphere: "bright and inviting",
    fog: false,
    groundColor: "#1b1e2b",
    skyColor: "#12131a",
  },
  defaultAssets: ["wooden crate", "stone pillar", "glowing orb", "treasure chest", "warning cone"],
};

export function deriveTheme(prompt: string): Theme {
  const lower = prompt.toLowerCase();
  for (const rule of THEMES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.theme;
  }
  return FALLBACK_THEME;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "game", "about", "with", "create", "make", "build",
  "generate", "please", "me", "of", "for", "and", "to", "in", "on", "my",
  "want", "new", "prototype", "small", "simple",
]);

export function deriveTitle(prompt: string): string {
  const words = prompt
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 3);
  if (words.length === 0) return "Untitled Quest";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Lays entities out on a ring so the generated scene reads clearly. */
export function ringPosition(index: number, total: number): { x: number; y: number; z: number } {
  const radius = Math.max(3, total * 0.9);
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  return {
    x: Number((Math.cos(angle) * radius).toFixed(2)),
    y: 0,
    z: Number((Math.sin(angle) * radius).toFixed(2)),
  };
}

export function behaviorFor(interactive: boolean, index: number): BlueprintEntity["behavior"] {
  if (interactive) return "bob";
  // Mix patrol / pulse / spin so sneak peeks show living motion.
  switch (index % 4) {
    case 0:
      return "spin";
    case 1:
      return "patrol";
    case 2:
      return "pulse";
    default:
      return "static";
  }
}

/** Attaches a keyframe clip matching the entity's behavior. */
export function animationFor(
  behavior: BlueprintEntity["behavior"],
  entityId: string,
): BlueprintEntity["animation"] {
  switch (behavior) {
    case "spin":
      return createSpinClip(`anim_${entityId}_spin`);
    case "bob":
      return createBobClip(`anim_${entityId}_bob`);
    case "patrol":
      return createPatrolClip(`anim_${entityId}_patrol`);
    case "pulse":
      return createPulseClip(`anim_${entityId}_pulse`);
    case "static":
      return undefined;
    default: {
      const _never: never = behavior;
      return _never;
    }
  }
}

/** Picks a player color that contrasts with the environment ground. */
export function playerFor(theme: Theme): PlayerSpec {
  return {
    color: theme.palette[0] ?? "#ffffff",
    speed: 6,
    spawn: { x: 0, y: 0.5, z: 0 },
    animations: {
      idle: createIdleClip(),
      walk: createWalkClip(),
    },
  };
}

export function moodLabel(mood: LightingMood): string {
  switch (mood) {
    case "day":
      return "bright daylight";
    case "dusk":
      return "warm dusk";
    case "night":
      return "moonlit night";
    case "cave":
      return "torch-lit gloom";
    default: {
      // Exhaustiveness guard for LightingMood.
      const _never: never = mood;
      return _never;
    }
  }
}

export function slugify(text: string): string {
  return text.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "game";
}
