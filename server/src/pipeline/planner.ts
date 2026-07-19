import { coercePlan, heuristicPlan, type RequestPlan } from "@ai-gamedev/shared";
import { generatePrompt } from "../prompts.js";
import type { LLMClient } from "../services/llmClient.js";

/**
 * Understand and decompose a build request using the LLM, falling back to a
 * deterministic heuristic when no model is reachable (or it returns something
 * unusable). Always returns a valid, goal-focused {@link RequestPlan}.
 */
export async function planRequest(prompt: string, llm: LLMClient): Promise<RequestPlan> {
  const fallback = heuristicPlan(prompt);
  try {
    const { text, source } = await llm.generate(generatePrompt.planning(prompt), {
      task: "gameDesign",
      system: "You are a precise game director. Output ONLY valid JSON, no prose.",
    });
    if (source !== "llm") return fallback;
    const parsed = extractJson(text);
    return parsed ? coercePlan(parsed, fallback) : fallback;
  } catch {
    return fallback;
  }
}

/** Best-effort JSON extraction from a possibly fenced/chatty completion. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
