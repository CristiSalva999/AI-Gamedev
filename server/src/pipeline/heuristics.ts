import {
  createBobClip,
  createIdleClip,
  createPatrolClip,
  createPulseClip,
  createSpinClip,
  createWalkClip,
  type BlueprintEntity,
  type EntityRole,
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
  /** Default landmark asset briefs used when world-building yields nothing usable. */
  defaultAssets: string[];
  /** Extra ambient briefs scattered to fill the playable space. */
  ambientAssets: string[];
  /** Layout strategy for placing entities in the level. */
  layout: LayoutStyle;
}

export type LayoutStyle = "ring" | "forest_ruins" | "dungeon" | "scatter";

export interface PlannedPlacement {
  brief: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  role: EntityRole;
  interactive: boolean;
  interactHint?: string;
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
        worldRadius: 16,
        accentGroundColor: "#161b2e",
      },
      defaultAssets: ["cargo crate", "energy orb", "antenna pillar", "landing pad", "warning cone"],
      ambientAssets: ["cargo crate", "warning cone", "antenna pillar"],
      layout: "scatter",
    },
  },
  {
    keywords: ["forest", "jungle", "nature", "woodland", "grove", "druid", "elf", "ruins", "ruin"],
    theme: {
      genre: "Exploration adventure",
      visualStyle: "stylized low-poly nature",
      palette: ["#2ecc71", "#27ae60", "#8b5a2b", "#c4a574"],
      environment: {
        lighting: "day",
        atmosphere: "dappled sunlight through ancient canopy, birdsong over quiet ruins",
        fog: true,
        groundColor: "#2a4a30",
        skyColor: "#87c4d9",
        worldRadius: 22,
        accentGroundColor: "#3d6b45",
      },
      defaultAssets: [
        "broken stone archway",
        "glowing moss patches",
        "ancient well",
        "toppled statue",
        "wooden supply crate",
        "gnarled hollow tree",
      ],
      ambientAssets: [
        "pine tree",
        "ancient tree",
        "bush",
        "mossy boulder",
        "glowing mushroom",
        "stone pillar",
        "ruin wall",
        "rubble",
        "path stone",
      ],
      layout: "forest_ruins",
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
        worldRadius: 14,
        accentGroundColor: "#1c1c24",
      },
      defaultAssets: ["stone pillar", "treasure chest", "rock boulder", "torch", "iron gate"],
      ambientAssets: ["torch", "rubble", "stone pillar", "wooden crate"],
      layout: "dungeon",
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
        worldRadius: 18,
        accentGroundColor: "#d4bc7e",
      },
      defaultAssets: ["stone pillar", "clay pot", "cactus", "ancient chest", "sand rock"],
      ambientAssets: ["sand rock", "stone pillar", "clay pot"],
      layout: "scatter",
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
        worldRadius: 16,
        accentGroundColor: "#151820",
      },
      defaultAssets: ["gravestone", "dead tree", "wooden crate", "lantern", "iron fence"],
      ambientAssets: ["dead tree", "gravestone", "wooden crate"],
      layout: "scatter",
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
    worldRadius: 14,
    accentGroundColor: "#24283b",
  },
  defaultAssets: ["wooden crate", "stone pillar", "glowing orb", "treasure chest", "warning cone"],
  ambientAssets: ["wooden crate", "stone pillar", "bush"],
  layout: "ring",
};

export function deriveTheme(prompt: string): Theme {
  const lower = prompt.toLowerCase();
  // Forest + ruins is the flagship demo — prefer the nature theme when either keyword hits.
  for (const rule of THEMES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      const theme = structuredClone(rule.theme);
      if (lower.includes("ruin") && theme.layout !== "forest_ruins") {
        theme.layout = "forest_ruins";
        theme.defaultAssets = [
          "broken stone archway",
          ...theme.defaultAssets.filter((a) => !a.includes("arch")),
        ].slice(0, 6);
      }
      return theme;
    }
  }
  return structuredClone(FALLBACK_THEME);
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

/**
 * Builds a full level placement list: landmarks first, then ambient fillers
 * (trees, path stones, rubble) so forest/ruins prompts feel explorable.
 */
export function planLevelPlacements(
  theme: Theme,
  landmarkBriefs: string[],
  interactiveNames: Set<string>,
  options: { maxLandmarks?: number; maxAmbient?: number } = {},
): PlannedPlacement[] {
  const maxLandmarks = options.maxLandmarks ?? 8;
  const maxAmbient = options.maxAmbient ?? 18;
  const landmarks = landmarkBriefs.slice(0, maxLandmarks);
  const placements: PlannedPlacement[] = [];

  switch (theme.layout) {
    case "forest_ruins":
      placements.push(...forestRuinsLayout(landmarks, interactiveNames));
      placements.push(...forestAmbient(theme.ambientAssets, maxAmbient, placements));
      break;
    case "dungeon":
      placements.push(...dungeonLayout(landmarks, interactiveNames));
      placements.push(...scatterAmbient(theme.ambientAssets, maxAmbient, placements, 10));
      break;
    case "scatter":
      landmarks.forEach((brief, i) => {
        const pos = ringPosition(i, landmarks.length);
        placements.push(placementFor(brief, pos, interactiveNames, i));
      });
      placements.push(...scatterAmbient(theme.ambientAssets, maxAmbient, placements, 14));
      break;
    case "ring":
      landmarks.forEach((brief, i) => {
        placements.push(placementFor(brief, ringPosition(i, landmarks.length), interactiveNames, i));
      });
      break;
    default: {
      const _never: never = theme.layout;
      return _never;
    }
  }

  return placements;
}

function forestRuinsLayout(
  landmarks: string[],
  interactiveNames: Set<string>,
): PlannedPlacement[] {
  const ruinCenter = { x: 0, y: 0, z: -9 };
  const slots: Array<{ x: number; z: number; rotationY?: number }> = [
    { x: ruinCenter.x, z: ruinCenter.z, rotationY: 0 }, // arch gateway
    { x: -2.5, z: -6.5 }, // moss
    { x: 2.8, z: -7.2 }, // well
    { x: -4.2, z: -10.5, rotationY: 0.4 }, // statue
    { x: 4.5, z: -4.5 }, // crate
    { x: -6.5, z: -3.5 }, // hollow tree
    { x: 5.5, z: -11 }, // extra landmark
    { x: -1.5, z: -12.5 }, // extra landmark
  ];

  const out: PlannedPlacement[] = [];
  landmarks.forEach((brief, i) => {
    const slot = slots[i] ?? {
      x: ruinCenter.x + Math.cos(i) * 4,
      z: ruinCenter.z + Math.sin(i) * 4,
    };
    const lower = brief.toLowerCase();
    const interactive =
      interactiveNames.has(lower) ||
      /\b(well|crate|chest|moss|mushroom|supply)\b/.test(lower);
    out.push({
      brief,
      position: { x: Number(slot.x.toFixed(2)), y: 0, z: Number(slot.z.toFixed(2)) },
      rotationY: slot.rotationY ?? 0,
      role: "landmark",
      interactive,
      interactHint: interactive ? hintFor(brief) : undefined,
    });
  });

  // Stepping stones from spawn clearing toward the ruins.
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6;
    out.push({
      brief: "path stone",
      position: {
        x: Number((Math.sin(i * 0.7) * 0.6).toFixed(2)),
        y: 0,
        z: Number((-1.2 - t * 6.5).toFixed(2)),
      },
      rotationY: i * 0.35,
      role: "path",
      interactive: false,
    });
  }

  return out;
}

function forestAmbient(
  briefs: string[],
  max: number,
  existing: PlannedPlacement[],
): PlannedPlacement[] {
  const occupied = existing.map((p) => p.position);
  const out: PlannedPlacement[] = [];
  // Outer tree ring — dense forest edge around the clearing.
  for (let i = 0; i < 14 && out.length < max; i++) {
    const angle = (i / 14) * Math.PI * 2 + 0.15;
    const radius = 11.5 + (i % 4) * 1.15;
    const pos = {
      x: Number((Math.cos(angle) * radius).toFixed(2)),
      y: 0,
      z: Number((Math.sin(angle) * radius - 2.5).toFixed(2)),
    };
    if (tooClose(pos, occupied, 1.9)) continue;
    const brief = i % 3 === 0 ? "pine tree" : "ancient tree";
    out.push({
      brief,
      position: pos,
      rotationY: angle,
      role: "ambient",
      interactive: false,
    });
    occupied.push(pos);
  }

  // Inner grove — trees flanking the path so the walk to the ruins feels wooded.
  const grove: Array<{ x: number; z: number; brief: string }> = [
    { x: -3.8, z: -1.5, brief: "ancient tree" },
    { x: 4.2, z: -2.0, brief: "pine tree" },
    { x: -5.5, z: -5.0, brief: "pine tree" },
    { x: 6.0, z: -6.2, brief: "ancient tree" },
    { x: -7.2, z: -8.5, brief: "ancient tree" },
    { x: 7.0, z: -9.0, brief: "pine tree" },
  ];
  for (const spot of grove) {
    if (out.length >= max) break;
    if (tooClose(spot, occupied, 2.0)) continue;
    out.push({
      brief: spot.brief,
      position: { x: spot.x, y: 0, z: spot.z },
      rotationY: spot.x * 0.2,
      role: "ambient",
      interactive: false,
    });
    occupied.push(spot);
  }

  const fillers = [
    "bush",
    "mossy boulder",
    "glowing mushroom",
    "bush",
    "rubble",
    "stone pillar",
    "ruin wall",
    "glowing mushroom",
    "bush",
    "rubble",
  ];
  for (let i = 0; i < fillers.length && out.length < max; i++) {
    const brief = fillers[i] ?? briefs[i % briefs.length];
    const angle = 0.7 + i * 0.85;
    const radius = 4.5 + (i % 5) * 2.1;
    const pos = {
      x: Number((Math.cos(angle) * radius + (i % 2 === 0 ? 1.2 : -1.1)).toFixed(2)),
      y: 0,
      z: Number((Math.sin(angle) * radius - 3.5).toFixed(2)),
    };
    if (tooClose(pos, occupied, 1.6)) continue;
    const loot = /\b(mushroom|moss)\b/.test(brief);
    out.push({
      brief,
      position: pos,
      rotationY: angle * 0.5,
      role: loot ? "loot" : "ambient",
      interactive: loot,
      interactHint: loot ? hintFor(brief) : undefined,
    });
    occupied.push(pos);
  }

  return out;
}

function dungeonLayout(
  landmarks: string[],
  interactiveNames: Set<string>,
): PlannedPlacement[] {
  return landmarks.map((brief, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return placementFor(
      brief,
      { x: (col - 1) * 3.5, y: 0, z: -2 - row * 3.5 },
      interactiveNames,
      i,
    );
  });
}

function scatterAmbient(
  briefs: string[],
  max: number,
  existing: PlannedPlacement[],
  radius: number,
): PlannedPlacement[] {
  const occupied = existing.map((p) => p.position);
  const out: PlannedPlacement[] = [];
  for (let i = 0; i < max; i++) {
    const brief = briefs[i % briefs.length];
    const angle = i * 2.4;
    const r = 4 + (i % 5) * (radius / 5);
    const pos = {
      x: Number((Math.cos(angle) * r).toFixed(2)),
      y: 0,
      z: Number((Math.sin(angle) * r).toFixed(2)),
    };
    if (tooClose(pos, occupied, 1.6)) continue;
    out.push({
      brief,
      position: pos,
      rotationY: angle,
      role: "ambient",
      interactive: false,
    });
    occupied.push(pos);
  }
  return out;
}

function placementFor(
  brief: string,
  position: { x: number; y: number; z: number },
  interactiveNames: Set<string>,
  index: number,
): PlannedPlacement {
  const lower = brief.toLowerCase();
  const interactive =
    interactiveNames.has(lower) ||
    index < 2 ||
    /\b(crate|chest|well|orb|mushroom|moss)\b/.test(lower);
  return {
    brief,
    position,
    rotationY: 0,
    role: interactive ? "loot" : "landmark",
    interactive,
    interactHint: interactive ? hintFor(brief) : undefined,
  };
}

function hintFor(brief: string): string {
  const lower = brief.toLowerCase();
  if (/\bwell\b/.test(lower)) return "Draw water from the ancient well";
  if (/\bcrate|chest|supply\b/.test(lower)) return "Search the supply crate";
  if (/\bmoss\b/.test(lower)) return "Gather glowing moss";
  if (/\bmushroom\b/.test(lower)) return "Pick a glowing mushroom";
  return `Inspect ${brief}`;
}

function tooClose(
  pos: { x: number; z: number },
  others: Array<{ x: number; z: number }>,
  minDist: number,
): boolean {
  return others.some((o) => Math.hypot(o.x - pos.x, o.z - pos.z) < minDist);
}

export function behaviorFor(
  role: EntityRole,
  interactive: boolean,
  index: number,
  brief = "",
): BlueprintEntity["behavior"] {
  if (interactive || role === "loot") return "bob";
  if (role === "ambient" || role === "path") return "static";
  const lower = brief.toLowerCase();
  // Only small magical props should spin; architecture stays planted.
  if (/\b(orb|gem|crystal|ring)\b/.test(lower)) return "spin";
  if (/\b(moss|mushroom|lantern|torch|magic)\b/.test(lower)) return "pulse";
  // Mild variety for remaining landmarks without making trees/arches rotate.
  return index % 3 === 1 ? "pulse" : "static";
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
  const radius = theme.environment.worldRadius ?? 14;
  return {
    color: theme.palette[0] ?? "#ffffff",
    speed: 7,
    spawn: { x: 0, y: 0.6, z: Math.min(4, radius * 0.25) },
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

export function worldBound(theme: Theme): number {
  return theme.environment.worldRadius ?? 14;
}
