import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BuildEvent,
  BuildManifest,
  GameBlueprint,
  GenerationSource,
} from "@ai-gamedev/shared";
import { api } from "./lib/api.js";
import { useThreeScene } from "./hooks/useThreeScene.js";

type LineKind = "user" | "assistant" | "stage" | "peek" | "artifact" | "error";

interface ChatLine {
  id: number;
  kind: LineKind;
  text: string;
  source?: GenerationSource;
  /** Optional action rendered under artifact lines. */
  action?: { label: string; href: string };
}

let lineSeq = 0;

const BUILD_SUGGESTIONS = [
  "Create a forest exploration game with ruins",
  "Genera un gioco di macchine arcade su un circuito al tramonto",
  "Build a neon sci-fi shooter on a space station",
];

const STEER_SUGGESTIONS = ["make it night", "add more crates", "player faster", "make it day"];

export function App(): JSX.Element {
  const { containerRef, setBlueprint } = useThreeScene();
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [building, setBuilding] = useState(false);
  const [blueprint, setBlueprintState] = useState<GameBlueprint | null>(null);
  const [manifest, setManifest] = useState<BuildManifest | null>(null);
  const [llmReachable, setLlmReachable] = useState<boolean | null>(null);
  const [model, setModel] = useState("");
  const [blenderMode, setBlenderMode] = useState<"blender" | "procedural" | null>(null);
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pushLine = useCallback((line: Omit<ChatLine, "id">) => {
    setLines((prev) => [...prev, { id: lineSeq++, ...line }]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, building]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [health, ctx] = await Promise.all([api.health(), api.getContext()]);
        if (cancelled) return;
        setLlmReachable(health.llm.reachable);
        setModel(health.llm.model);
        setBlenderMode(health.blender.mode);
        if (ctx.blueprint) {
          setBlueprint(ctx.blueprint);
          setBlueprintState(ctx.blueprint);
        }
        if (ctx.lastManifest) setManifest(ctx.lastManifest);

        const history: ChatLine[] = ctx.chat.map((msg) => ({
          id: lineSeq++,
          kind: msg.role === "user" ? "user" : "assistant",
          text: msg.content,
        }));

        // Only greet when the transcript is empty — avoid duplicating the
        // welcome message on every page reload.
        if (history.length === 0) {
          history.push({
            id: lineSeq++,
            kind: "assistant",
            text: health.llm.reachable
              ? `Connected to LM Studio (${health.llm.model}). Describe a game and I'll build it end-to-end.`
              : `Ready in offline mock mode. Describe a game — e.g. "${BUILD_SUGGESTIONS[0]}" — and I'll build it with live sneak peeks.`,
          });
        }
        setLines(history);
      } catch (err) {
        if (!cancelled) {
          setLines([
            {
              id: lineSeq++,
              kind: "error",
              text: `Init failed: ${(err as Error).message}. Is the server running on :3001?`,
            },
          ]);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [setBlueprint]);

  const handleEvent = useCallback(
    (event: BuildEvent) => {
      switch (event.type) {
        case "message":
          pushLine({ kind: "assistant", text: event.content });
          break;
        case "stage-start":
          pushLine({ kind: "stage", text: event.label });
          break;
        case "sneak-peek":
          pushLine({ kind: "peek", text: event.note });
          setBlueprint(event.blueprint);
          setBlueprintState(event.blueprint);
          break;
        case "stage-complete":
          break;
        case "artifact":
          setManifest(event.manifest);
          pushLine({
            kind: "artifact",
            text: `Ready: "${event.manifest.name}" · ${event.manifest.entityCount} objects · ${event.manifest.animationCount} clips · ~${event.manifest.approxSizeKb} KB`,
            action: {
              label: "Download install zip",
              href: api.artifactUrl(event.manifest.downloadUrl),
            },
          });
          break;
        case "done":
          setBlueprint(event.blueprint);
          setBlueprintState(event.blueprint);
          break;
        case "error":
          pushLine({ kind: "error", text: event.message });
          break;
        default: {
          const _never: never = event;
          return _never;
        }
      }
    },
    [pushLine, setBlueprint],
  );

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || building || !ready) return;
      setInput("");
      pushLine({ kind: "user", text });
      setBuilding(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await api.chat(text, handleEvent, controller.signal);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          pushLine({ kind: "assistant", text: "Build cancelled." });
        } else {
          pushLine({ kind: "error", text: `Build failed: ${(err as Error).message}` });
        }
      } finally {
        abortRef.current = null;
        setBuilding(false);
        // Return focus to the composer so the next steer is one keystroke away.
        inputRef.current?.focus();
      }
    },
    [building, ready, handleEvent, pushLine],
  );

  const cancelBuild = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const downloadZip = useCallback(() => {
    if (!manifest) return;
    const a = document.createElement("a");
    a.href = api.artifactUrl(manifest.downloadUrl);
    a.download = `${manifest.slug}.zip`;
    a.rel = "noopener";
    a.click();
  }, [manifest]);

  const suggestions = useMemo(
    () => (blueprint ? STEER_SUGGESTIONS : BUILD_SUGGESTIONS),
    [blueprint],
  );

  return (
    <div className="layout">
      <aside className="panel">
        <header className="brand">
          <h1>AI GameDev</h1>
          <StatusBadge reachable={llmReachable} model={model} blenderMode={blenderMode} />
        </header>

        {blueprint && (
          <div className="game-head">
            <div className="game-head-text">
              <strong>{blueprint.gameTitle}</strong>
              <span className="muted"> · {blueprint.gameGenre}</span>
            </div>
            <button
              type="button"
              className="link"
              onClick={downloadZip}
              disabled={!manifest}
              title={manifest ? "Download playable zip" : "Finish a build to unlock download"}
            >
              Download zip
            </button>
          </div>
        )}

        <div className="chat" ref={scrollRef} aria-live="polite">
          {lines.map((line) => (
            <div key={line.id} className={`line ${line.kind}`}>
              {line.kind === "stage" ? <span className="stage-mark">▶ </span> : null}
              {line.text}
              {line.action ? (
                <a className="artifact-link" href={line.action.href} download>
                  {line.action.label}
                </a>
              ) : null}
            </div>
          ))}
          {building && <div className="line stage pulse">Building…</div>}
        </div>

        <div className="suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              onClick={() => void send(s)}
              disabled={building || !ready}
            >
              {s}
            </button>
          ))}
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              !ready
                ? "Connecting…"
                : blueprint
                  ? "Steer the build…"
                  : "Describe a game to create…"
            }
            disabled={building || !ready}
            aria-label="Chat message"
            autoComplete="off"
          />
          {building ? (
            <button type="button" className="secondary" onClick={cancelBuild}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!ready || !input.trim()}>
              Send
            </button>
          )}
        </form>
      </aside>

      <main className="viewport-wrap">
        <div className="viewport" ref={containerRef} />
        <div className="hud">
          {blueprint
            ? blueprint.player.avatar === "car"
              ? "Click preview · WASD to drive · checkpoints auto-count · drag to orbit"
              : "Click preview · WASD to explore · E to collect · drag to orbit"
            : "Your game preview will appear here as the build streams"}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({
  reachable,
  model,
  blenderMode,
}: {
  reachable: boolean | null;
  model: string;
  blenderMode: "blender" | "procedural" | null;
}): JSX.Element {
  const state = reachable === null ? "pending" : reachable ? "online" : "mock";
  const llmLabel =
    reachable === null ? "…" : reachable ? `LLM · ${shortModel(model)}` : "mock mode";
  const assetLabel =
    blenderMode === "blender"
      ? " · blender"
      : blenderMode === "procedural"
        ? " · procedural"
        : "";
  return (
    <span className={`status ${state}`} title={model || undefined}>
      {llmLabel}
      {assetLabel}
    </span>
  );
}

function shortModel(model: string): string {
  if (model.length <= 18) return model;
  return `${model.slice(0, 16)}…`;
}
