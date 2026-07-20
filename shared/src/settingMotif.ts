/**
 * Setting-motif detection for offline / mock builds.
 *
 * Genre packs alone hard-code one aesthetic per genre (e.g. shooter → sci-fi
 * hangar). When LM Studio is unreachable the pipeline falls back to those packs
 * and ignores the user's title/setting — producing "nonsense" worlds
 * (landing pads in a dwarven archery range). Motifs rewrite assets, palette,
 * and atmosphere from the prompt so mock builds still match intent.
 */

export type SettingLighting = "day" | "dusk" | "night" | "cave";

export type SettingMotifId =
  | "archery_medieval"
  | "forest_ruins"
  | "sci_fi"
  | "dungeon_crypt"
  | "coastal"
  | "desert"
  | "snow"
  | "generic";

export interface SettingMotif {
  id: SettingMotifId;
  label: string;
  visualStyle: string;
  palette: string[];
  landmarks: string[];
  ambient: string[];
  interactive: string[];
  groundColor: string;
  skyColor: string;
  accentGroundColor: string;
  atmosphere: string;
  /** Prefer this terrain kind when adapting a world recipe. */
  terrainKind?: "flat" | "rolling" | "mountainous" | "track_bowl" | "caves";
}

const MOTIFS: Array<{ id: SettingMotifId; re: RegExp; motif: Omit<SettingMotif, "id"> }> = [
  {
    id: "archery_medieval",
    re: /\b(archerl?y|bow|crossbow|quiver|longbow|marksman|hay\s*bale|target\s*range|practice\s*range|medieval|castle|dwarf|dwarven|dwarv\w*|viking|knight)\b/i,
    motif: {
      label: "medieval archery grounds",
      visualStyle:
        "cinematic medieval training yard — timber, straw, weathered stone, warm daylight materials",
      palette: ["#8b5a2b", "#c4a574", "#6b7280", "#3d6b45"],
      landmarks: [
        "dwarf raider",
        "dwarf scout",
        "dwarf berserker",
        "dwarf archer",
        "archery target",
        "hay bale barrier",
        "quiver rack",
        "timber practice post",
        "stone watch post",
      ],
      ambient: ["hay bale barrier", "wooden supply crate", "pine tree", "bush", "torch", "dwarf wanderer"],
      interactive: ["wooden supply crate", "quiver rack"],
      groundColor: "#3d4a32",
      skyColor: "#87b7d9",
      accentGroundColor: "#4a5a3a",
      atmosphere: "warm daylight over packed earth, straw dust drifting between timber posts",
      terrainKind: "rolling",
    },
  },
  {
    id: "forest_ruins",
    re: /\b(forest|ruin|ruins|grove|woodland|jungle|moss|canopy|ancient\s+tree|glade)\b/i,
    motif: {
      label: "forest ruins",
      visualStyle:
        "cinematic detailed nature with weathered stone, layered foliage, and soft god-rays",
      palette: ["#2d6a3e", "#8b5a2b", "#c4a574", "#87c4d9"],
      landmarks: [
        "broken stone archway",
        "ancient well",
        "toppled statue",
        "ruin wall",
        "glowing moss patches",
        "gnarled hollow tree",
      ],
      ambient: ["pine tree", "ancient tree", "bush", "mossy boulder", "fallen stone column"],
      interactive: ["ancient well", "wooden supply crate", "glowing moss patches"],
      groundColor: "#2a4a30",
      skyColor: "#7eb6d9",
      accentGroundColor: "#3d6b45",
      atmosphere: "dappled canopy light over quiet ruins",
      terrainKind: "rolling",
    },
  },
  {
    id: "sci_fi",
    re: /\b(sci-?fi|space\s*station|neon|hangar|cyber|orbital|android|laser|blaster)\b/i,
    motif: {
      label: "sci-fi station",
      visualStyle: "cinematic neon sci-fi — reflective metals, volumetric fog, emissive trim",
      palette: ["#00e5ff", "#7c4dff", "#ff4081", "#1de9b6"],
      landmarks: ["landing pad", "cargo crate", "antenna pillar", "energy orb", "warning cone"],
      ambient: ["cargo crate", "warning cone", "street lamp"],
      interactive: ["energy orb", "cargo crate"],
      groundColor: "#10131f",
      skyColor: "#05060d",
      accentGroundColor: "#161b2e",
      atmosphere: "cold neon haze over a derelict station deck",
      terrainKind: "flat",
    },
  },
  {
    id: "dungeon_crypt",
    re: /\b(dungeon|crypt|tomb|catacomb|undercroft|cavern|cave)\b/i,
    motif: {
      label: "torch-lit dungeon",
      visualStyle: "cinematic subterranean stone — torch bloom, wet rock, deep contrast",
      palette: ["#9aa0a6", "#e67e22", "#6c5ce7", "#1b1b22"],
      landmarks: ["stone pillar", "treasure chest", "iron gate", "torch", "rock boulder"],
      ambient: ["torch", "rubble", "stone pillar"],
      interactive: ["treasure chest", "torch"],
      groundColor: "#15151a",
      skyColor: "#0a0a0e",
      accentGroundColor: "#1c1c24",
      atmosphere: "torch-lit damp air, echoing chambers",
      terrainKind: "caves",
    },
  },
  {
    id: "coastal",
    re: /\b(coast|coastal|beach|shore|harbor|harbour|sea|ocean|cliff)\b/i,
    motif: {
      label: "coastal cliffs",
      visualStyle: "cinematic coastal light — salt-worn wood, pale stone, bright horizon haze",
      palette: ["#4a90a4", "#d4c4a8", "#8b5a2b", "#f0e6d3"],
      landmarks: ["wooden supply crate", "stone pillar", "ruin wall", "street lamp", "ancient well"],
      ambient: ["bush", "boulder", "wooden supply crate"],
      interactive: ["wooden supply crate", "ancient well"],
      groundColor: "#6b5b45",
      skyColor: "#9ec9e0",
      accentGroundColor: "#7a6a52",
      atmosphere: "salt breeze and bright coastal haze",
      terrainKind: "rolling",
    },
  },
  {
    id: "desert",
    re: /\b(desert|dune|canyon|arid|oasis|sandstorm)\b/i,
    motif: {
      label: "desert canyon",
      visualStyle: "cinematic arid canyon — sun-bleached rock, sparse scrub, hard shadows",
      palette: ["#c4a574", "#e67e22", "#8b5a2b", "#f5e6c8"],
      landmarks: ["rock boulder", "ruin wall", "stone pillar", "wooden supply crate", "toppled statue"],
      ambient: ["rock boulder", "bush", "rubble"],
      interactive: ["wooden supply crate", "toppled statue"],
      groundColor: "#b8956a",
      skyColor: "#f0c878",
      accentGroundColor: "#a8845a",
      atmosphere: "dry heat shimmer over sun-baked stone",
      terrainKind: "mountainous",
    },
  },
  {
    id: "snow",
    re: /\b(snow|arctic|tundra|frozen|ice|winter|blizzard)\b/i,
    motif: {
      label: "frozen wilds",
      visualStyle: "cinematic winter landscape — pale snow, dark timber, cold blue shadows",
      palette: ["#dfe6e9", "#74b9ff", "#636e72", "#b2bec3"],
      landmarks: ["pine tree", "wooden supply crate", "stone pillar", "torch", "ruin wall"],
      ambient: ["pine tree", "bush", "boulder"],
      interactive: ["wooden supply crate", "torch"],
      groundColor: "#d8dee4",
      skyColor: "#a8c0d8",
      accentGroundColor: "#c5ced6",
      atmosphere: "cold breath mist over a quiet snowfield",
      terrainKind: "rolling",
    },
  },
];

const GENERIC: SettingMotif = {
  id: "generic",
  label: "open grounds",
  visualStyle: "cinematic stylized world — readable silhouettes, rich materials",
  palette: ["#6c5ce7", "#00b894", "#fdcb6e", "#d63031"],
  landmarks: ["wooden supply crate", "stone pillar", "glowing moss patches", "bush"],
  ambient: ["bush", "boulder", "wooden supply crate"],
  interactive: ["wooden supply crate", "glowing moss patches"],
  groundColor: "#2a4a30",
  skyColor: "#87c4d9",
  accentGroundColor: "#3d6b45",
  atmosphere: "clear air over an open playable space",
  terrainKind: "rolling",
};

/**
 * Pick the strongest setting motif from free text (title + setting + storyline).
 * Explicit sci-fi / archery / forest cues win over the genre pack default.
 */
export function detectSettingMotif(...texts: Array<string | undefined>): SettingMotif {
  const haystack = texts.filter(Boolean).join(" \n ");
  if (!haystack.trim()) return GENERIC;
  for (const entry of MOTIFS) {
    if (entry.re.test(haystack)) {
      return { id: entry.id, ...entry.motif };
    }
  }
  return GENERIC;
}

/** Lighting from setup phrasing ("during the day/dusk/night") or free text. */
export function detectLightingFromPrompt(text: string): SettingLighting | null {
  const p = text.toLowerCase();
  if (/\bduring the night\b|\bat night\b|\bnight(?:time)?\b|\bmoonlit\b|\bmidnight\b/.test(p)) {
    return "night";
  }
  if (/\bduring the dusk\b|\bat dusk\b|\bsunset\b|\bevening\b|\bgolden hour\b/.test(p)) {
    return "dusk";
  }
  if (/\bduring the day\b|\bdaylight\b|\bsunny\b|\bbright day\b/.test(p)) {
    return "day";
  }
  if (/\bcave\b|\bcavern\b|\bunderground\b/.test(p)) return "cave";
  return null;
}

/** Storyline excerpt from composed setup prompts ("Storyline: …"). */
export function extractStoryline(prompt: string): string {
  const m = prompt.match(/\bstoryline\s*[:-]\s*([^.\n]{3,200})/i);
  return m ? m[1].trim() : "";
}
