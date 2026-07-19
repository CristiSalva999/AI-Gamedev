/**
 * Request understanding & decomposition.
 *
 * Before building, the pipeline clarifies the user's request in its entirety
 * and breaks it down hierarchically:
 *
 *   request → sub-requests → tasks → subtasks
 *
 * then merges everything back into a single, goal-focused {@link RequestPlan}
 * that drives the rest of the build. An LLM produces this when available; a
 * deterministic heuristic ({@link heuristicPlan}) provides the same shape
 * offline so the pipeline never loses the plot.
 */
import { inferGenreKind, type GenreKind } from "./gameDesign.js";

export interface PlannedTask {
  title: string;
  subtasks: string[];
}

export interface PlannedSubRequest {
  title: string;
  tasks: PlannedTask[];
}

export interface RequestPlan {
  /** One focused sentence capturing the whole request. */
  goal: string;
  genre: GenreKind;
  title: string;
  setting: string;
  objective: string;
  /** Merged, deduped, goal-focused feature list. */
  keyFeatures: string[];
  /** request → sub-requests → tasks → subtasks. */
  subRequests: PlannedSubRequest[];
  /** How the plan was produced. */
  source: "llm" | "heuristic";
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "create",
  "make",
  "build",
  "generate",
  "start",
  "new",
  "game",
  "please",
  "with",
  "of",
  "in",
  "on",
  "for",
  "and",
  "to",
  "called",
  "set",
]);

export function extractTitle(prompt: string): string {
  const quoted = prompt.match(/\bcalled\s+"([^"]{1,60})"/i) ?? prompt.match(/"([^"{}]{2,60})"/);
  if (quoted) return quoted[1].trim();
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  const picked = words.slice(0, 3).join(" ");
  return picked || "Untitled Game";
}

export function extractObjective(prompt: string): string {
  const m = prompt.match(/\bobjective\s*[:-]\s*([^.\n]{3,160})/i);
  return m ? m[1].trim() : "";
}

export function extractSetting(prompt: string): string {
  // Avoid capturing pasted JSON blobs ("set in { ... }").
  const m = prompt.match(/\bset in\s+(?!\s*\{)([^.\n{]{3,80})/i);
  return m ? m[1].trim() : "";
}

const FEATURE_SIGNALS: Array<{ re: RegExp; feature: string }> = [
  { re: /\b(surviv\w+|hunger|thirst|stamina|scavenge)\b/i, feature: "survival resource management" },
  { re: /\b(collect\w*|relic|loot|gather|pickup)\b/i, feature: "collectibles" },
  { re: /\b(craft\w*)\b/i, feature: "crafting" },
  { re: /\b(lap|laps|race|racing|checkpoint)\b/i, feature: "timed racing / checkpoints" },
  { re: /\b(shoot\w*|combat|fight|boss|enemy|enemies)\b/i, feature: "combat encounters" },
  { re: /\b(npc|dialogue|quest|questline)\b/i, feature: "NPCs & quests" },
  { re: /\b(day|night|dawn|dusk|weather)\b/i, feature: "day–night / weather cycle" },
  { re: /\b(puzzle|riddle|maze)\b/i, feature: "puzzles" },
  { re: /\b(explore|exploration|biome|open world)\b/i, feature: "open exploration" },
];

function extractFeatures(prompt: string): string[] {
  const found = new Set<string>();
  for (const { re, feature } of FEATURE_SIGNALS) {
    if (re.test(prompt)) found.add(feature);
  }
  return [...found];
}

const GENRE_LABEL: Record<GenreKind, string> = {
  exploration: "exploration adventure",
  racing: "arcade racing",
  shooter: "shooter",
  dungeon: "dungeon crawler",
  survival: "survival",
  horror: "survival horror",
  sandbox: "sandbox",
};

/**
 * Deterministic, offline decomposition. Produces the same hierarchical shape an
 * LLM would, grounded in details extracted from the prompt, so the build stays
 * focused on the requested goal even without a model.
 */
export function heuristicPlan(prompt: string): RequestPlan {
  const genre = inferGenreKind(prompt);
  const title = extractTitle(prompt);
  const objective = extractObjective(prompt) || `Complete the ${GENRE_LABEL[genre]} experience`;
  const setting = extractSetting(prompt) || `a ${GENRE_LABEL[genre]} world`;
  const features = extractFeatures(prompt);
  const keyFeatures = features.length > 0 ? features : ["core loop", "explorable world", "clear objective"];

  const goal = `Build a ${GENRE_LABEL[genre]} game${title ? ` called "${title}"` : ""} set in ${setting}, where the player must ${objective.toLowerCase()}.`;

  const subRequests: PlannedSubRequest[] = [
    {
      title: "Clarify concept & intent",
      tasks: [
        {
          title: "Pin down the core genre and goal",
          subtasks: [`Genre: ${genre}`, `Player goal: ${objective}`],
        },
        {
          title: "Establish setting and mood",
          subtasks: [`Setting: ${setting}`, "Derive lighting/time-of-day from the request"],
        },
      ],
    },
    {
      title: "Design the world",
      tasks: [
        {
          title: "Plan zones and landmarks",
          subtasks: ["Spawn/orientation zone", "Primary objective zone", "Optional side areas"],
        },
        {
          title: "Choose environment assets",
          subtasks: ["Select genre-appropriate props", "Set ambient density and terrain"],
        },
      ],
    },
    {
      title: "Author gameplay systems",
      tasks: [
        {
          title: "Define controls & camera",
          subtasks: [`Control scheme for ${genre}`, "Camera mode"],
        },
        {
          title: "Define objectives, win & lose",
          subtasks: [`Objective: ${objective}`, ...keyFeatures.map((f) => `Support: ${f}`)],
        },
      ],
    },
    {
      title: "Generate content & assemble build",
      tasks: [
        {
          title: "Produce assets and animations",
          subtasks: ["Generate meshes/GLB", "Attach keyframe animations"],
        },
        {
          title: "Author gameplay script and package",
          subtasks: ["Write gameplay rules module", "Package play.html + downloadable zip"],
        },
      ],
    },
  ];

  return { goal, genre, title, setting, objective, keyFeatures, subRequests, source: "heuristic" };
}

/** Clamp/validate a raw (LLM) plan, filling gaps from the heuristic fallback. */
export function coercePlan(raw: unknown, fallback: RequestPlan): RequestPlan {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;

  const genre = typeof r.genre === "string" && isGenre(r.genre) ? r.genre : fallback.genre;
  const title = str(r.title) || fallback.title;
  const setting = str(r.setting) || fallback.setting;
  const objective = str(r.objective) || fallback.objective;
  const goal = str(r.goal) || fallback.goal;
  const keyFeatures = strArray(r.keyFeatures);
  const subRequests = coerceSubRequests(r.subRequests);

  return {
    goal,
    genre,
    title,
    setting,
    objective,
    keyFeatures: keyFeatures.length > 0 ? keyFeatures : fallback.keyFeatures,
    subRequests: subRequests.length > 0 ? subRequests : fallback.subRequests,
    source: "llm",
  };
}

function coerceSubRequests(value: unknown): PlannedSubRequest[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((sr) => {
      const o = (sr ?? {}) as Record<string, unknown>;
      const tasks = Array.isArray(o.tasks)
        ? o.tasks.slice(0, 8).map((t) => {
            const to = (t ?? {}) as Record<string, unknown>;
            return { title: str(to.title), subtasks: strArray(to.subtasks).slice(0, 8) };
          })
        : [];
      return { title: str(o.title), tasks: tasks.filter((t) => t.title) };
    })
    .filter((sr) => sr.title);
}

function isGenre(value: string): value is GenreKind {
  return ["exploration", "racing", "shooter", "dungeon", "survival", "horror", "sandbox"].includes(
    value,
  );
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v)).filter(Boolean).slice(0, 12);
}

/** Render a plan as a readable chat summary showing the full decomposition. */
export function summarizePlan(plan: RequestPlan): string {
  const lines: string[] = [];
  lines.push(`Clarified goal: ${plan.goal}`);
  lines.push(`Identified genre: ${plan.genre}${plan.source === "llm" ? " (AI)" : " (offline heuristic)"}`);
  if (plan.keyFeatures.length > 0) {
    lines.push(`Key features: ${plan.keyFeatures.join(", ")}`);
  }
  lines.push(`Broke the request into ${plan.subRequests.length} sub-requests:`);
  plan.subRequests.forEach((sr, i) => {
    lines.push(`${i + 1}. ${sr.title}`);
    sr.tasks.forEach((task) => {
      lines.push(`   • ${task.title}${task.subtasks.length ? `: ${task.subtasks.join("; ")}` : ""}`);
    });
  });
  return lines.join("\n");
}
