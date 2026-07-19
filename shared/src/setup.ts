/**
 * Project setup contract shared by the web wizard and the server.
 *
 * A "project" groups one game's chat + build history (Cursor-style). Creating a
 * project runs a short Q&A whose answers are composed into the very first build
 * prompt, so the autonomous pipeline knows what the user wants to play.
 */
import type { GenreKind } from "./gameDesign.js";

export const GENRE_KINDS: readonly GenreKind[] = [
  "exploration",
  "racing",
  "shooter",
  "dungeon",
  "survival",
  "horror",
  "sandbox",
];

export type SetupTimeOfDay = "day" | "dusk" | "night";

export const SETUP_TIMES: readonly SetupTimeOfDay[] = ["day", "dusk", "night"];

export interface GameSetupAnswers {
  title: string;
  genre: GenreKind;
  setting: string;
  timeOfDay: SetupTimeOfDay;
  goal: string;
  storyline: string;
}

export interface SetupQuestion {
  id: keyof GameSetupAnswers;
  label: string;
  help: string;
  type: "text" | "textarea" | "select";
  options?: readonly string[];
  placeholder?: string;
}

export const SETUP_QUESTIONS: readonly SetupQuestion[] = [
  {
    id: "title",
    label: "What should we call your game?",
    help: "This becomes the project name in the sidebar and the game title.",
    type: "text",
    placeholder: "Forest Exploration Ruins",
  },
  {
    id: "genre",
    label: "What kind of game is it?",
    help: "Sets the gameplay systems, controls, and level layout.",
    type: "select",
    options: GENRE_KINDS,
  },
  {
    id: "setting",
    label: "Describe the world / setting.",
    help: "Where does it take place? e.g. a misty forest with ancient ruins.",
    type: "text",
    placeholder: "forest with ancient ruins",
  },
  {
    id: "timeOfDay",
    label: "What time of day is it?",
    help: "Drives the lighting and mood of the scene.",
    type: "select",
    options: SETUP_TIMES,
  },
  {
    id: "goal",
    label: "What is the player trying to do?",
    help: "The core objective shown in the game.",
    type: "text",
    placeholder: "Explore the ruins and collect every relic",
  },
  {
    id: "storyline",
    label: "Give us the storyline / hook.",
    help: "You can refine this anytime with follow-up messages.",
    type: "textarea",
    placeholder: "An explorer uncovers glowing ruins hidden deep in the woods.",
  },
];

export const DEFAULT_SETUP_ANSWERS: GameSetupAnswers = {
  title: "",
  genre: "exploration",
  setting: "forest with ancient ruins",
  timeOfDay: "day",
  goal: "Explore the ruins and collect every relic",
  storyline: "",
};

/**
 * Turn wizard answers into a natural-language build prompt. The phrasing is
 * intentionally "Create a … game …" so the server's build detector routes it to
 * a full build (not a steer).
 */
export function composeSetupPrompt(answers: GameSetupAnswers): string {
  const title = answers.title.trim() || "Untitled Game";
  const setting = answers.setting.trim();
  const segments = [`Create a ${answers.genre} game called "${title}"`];
  if (setting) segments.push(`set in ${setting}`);
  segments.push(`during the ${answers.timeOfDay}`);

  let prompt = `${segments.join(" ")}.`;
  const goal = answers.goal.trim();
  if (goal) prompt += ` Objective: ${goal}.`;
  const storyline = answers.storyline.trim();
  if (storyline) prompt += ` Storyline: ${storyline}.`;
  return prompt;
}

/** Metadata describing a saved project (without its full chat/context). */
export interface ProjectMeta {
  id: string;
  slug: string;
  title: string;
  genre: string;
  setup: GameSetupAnswers;
  createdAt: number;
  updatedAt: number;
  /** True once at least one successful build exists for the project. */
  hasBuild: boolean;
}
