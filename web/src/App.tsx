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
}

let lineSeq = 0;

const BUILD_SUGGESTIONS = [
  "Create a forest exploration game with ruins",
  "Build a neon sci-fi shooter on a space station",
  "Make a spooky dungeon crawler",
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const pushLine = useCallback((line: Omit<ChatLine, "id">) => {
    setLines((prev) => [...prev, { id: lineSeq++, ...line }]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [health, ctx] = await Promise.all([api.health(), api.getContext()]);
        if (cancelled) return;
        setLlmReachable(health.llm.reachable);
        setModel(health.llm.model);
        if (ctx.blueprint) {
          setBlueprint(ctx.blueprint);
          setBlueprintState(ctx.blueprint);
        }
        for (const msg of ctx.chat) {
          pushLine({ kind: msg.role === "user" ? "user" : "assistant", text: msg.content });
        }
        pushLine({
          kind: "assistant",
          text: health.llm.reachable
            ? `Connected to LM Studio (${health.llm.model}). Describe a game and I'll build it.`
            : `Ready in offline mock mode (${health.llm.model}). Describe a game and I'll build it — e.g. "${BUILD_SUGGESTIONS[0]}".`,
        });
      } catch (err) {
        if (!cancelled) pushLine({ kind: "error", text: `Init failed: ${(err as Error).message}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setBlueprint, pushLine]);

  const handleEvent = useCallback(
    (event: BuildEvent) => {
      switch (event.type) {
        case "message":
          pushLine({ kind: "assistant", text: event.content });
          break;
        case "stage-start":
          pushLine({ kind: "stage", text: `▶ ${event.label}` });
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
            text: `Packaged "${event.manifest.name}" on ${event.manifest.branch} · ${event.manifest.entityCount} objects · ~${event.manifest.approxSizeKb} KB`,
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
          // Exhaustiveness guard: new BuildEvent variants must be handled.
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
      if (!text || building) return;
      setInput("");
      pushLine({ kind: "user", text });
      setBuilding(true);
      try {
        await api.chat(text, handleEvent);
      } catch (err) {
        pushLine({ kind: "error", text: `Build failed: ${(err as Error).message}` });
      } finally {
        setBuilding(false);
      }
    },
    [building, handleEvent, pushLine],
  );

  const downloadBlueprint = useCallback(() => {
    if (!blueprint) return;
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${blueprint.gameTitle.replace(/\s+/g, "_").toLowerCase()}.aigame.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [blueprint]);

  const suggestions = useMemo(
    () => (blueprint ? STEER_SUGGESTIONS : BUILD_SUGGESTIONS),
    [blueprint],
  );

  return (
    <div className="layout">
      <aside className="panel">
        <header className="brand">
          <h1>AI GameDev</h1>
          <StatusBadge reachable={llmReachable} model={model} />
        </header>

        {blueprint && (
          <div className="game-head">
            <div>
              <strong>{blueprint.gameTitle}</strong>
              <span className="muted"> · {blueprint.gameGenre}</span>
            </div>
            <button className="link" onClick={downloadBlueprint} disabled={!manifest}>
              ⤓ blueprint
            </button>
          </div>
        )}

        <div className="chat" ref={scrollRef}>
          {lines.map((line) => (
            <div key={line.id} className={`line ${line.kind}`}>
              {line.text}
            </div>
          ))}
          {building && <div className="line stage pulse">building…</div>}
        </div>

        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => void send(s)} disabled={building}>
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={blueprint ? "Steer the build…" : "Describe a game to create…"}
            disabled={building}
          />
          <button type="submit" disabled={building || !input.trim()}>
            {building ? "…" : "Send"}
          </button>
        </form>
      </aside>

      <main className="viewport-wrap">
        <div className="viewport" ref={containerRef} />
        <div className="hud">
          {blueprint
            ? "WASD / arrows to move · drag to orbit"
            : "Your game preview will appear here"}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({
  reachable,
  model,
}: {
  reachable: boolean | null;
  model: string;
}): JSX.Element {
  const state = reachable === null ? "pending" : reachable ? "online" : "mock";
  const label =
    reachable === null ? "…" : reachable ? `LLM: ${model}` : "mock mode";
  return <span className={`status ${state}`}>{label}</span>;
}
