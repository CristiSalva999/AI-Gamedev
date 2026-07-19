import { useCallback, useEffect, useState } from "react";
import type { GameContext, GenerationSource } from "@ai-gamedev/shared";
import { api } from "./lib/api.js";
import { useThreeScene } from "./hooks/useThreeScene.js";

interface LogEntry {
  id: number;
  kind: "asset" | "dialogue" | "info" | "error";
  text: string;
  source?: GenerationSource;
}

let logSeq = 0;

export function App(): JSX.Element {
  const { containerRef, addAsset, clear } = useThreeScene();
  const [context, setContext] = useState<GameContext | null>(null);
  const [llmReachable, setLlmReachable] = useState<boolean | null>(null);
  const [model, setModel] = useState<string>("");
  const [brief, setBrief] = useState("wooden crate");
  const [playerAction, setPlayerAction] = useState("offers a rare herb");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const pushLog = useCallback((entry: Omit<LogEntry, "id">) => {
    setLog((prev) => [{ id: logSeq++, ...entry }, ...prev].slice(0, 40));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [health, ctx] = await Promise.all([
          api.health(),
          api.getContext(),
        ]);
        if (cancelled) return;
        setLlmReachable(health.llm.reachable);
        setModel(health.llm.model);
        setContext(ctx);
        // Render any assets that already live in the persisted context.
        for (const asset of Object.values(ctx.assets.models)) addAsset(asset.spec);
        pushLog({
          kind: "info",
          text: health.llm.reachable
            ? `Connected to LM Studio (${health.llm.model}).`
            : `LM Studio not reachable — using deterministic mock (${health.llm.model}).`,
        });
      } catch (err) {
        if (!cancelled) {
          pushLog({ kind: "error", text: `Init failed: ${(err as Error).message}` });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addAsset, pushLog]);

  const onGenerateAsset = useCallback(async () => {
    if (!brief.trim()) return;
    setBusy(true);
    try {
      const res = await api.generateAsset(brief.trim());
      addAsset(res.asset.spec);
      pushLog({
        kind: "asset",
        source: res.source,
        text: `Asset "${res.asset.name}" → ${res.asset.spec.shape} (${res.asset.spec.color}).`,
      });
    } catch (err) {
      pushLog({ kind: "error", text: `Asset failed: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [brief, addAsset, pushLog]);

  const onGenerateDialogue = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api.generate({
        task: "npcDialogue",
        params: { playerAction },
      });
      pushLog({ kind: "dialogue", source: res.source, text: res.text });
    } catch (err) {
      pushLog({ kind: "error", text: `Dialogue failed: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [playerAction, pushLog]);

  const npcName =
    context && Object.values(context.assets.characters)[0]?.name;

  return (
    <div className="layout">
      <aside className="panel">
        <h1>AI GameDev</h1>
        <p className="subtitle">Three.js viewport · local LLM · mock Blender</p>

        <StatusBadge reachable={llmReachable} model={model} />

        {context && (
          <section className="card">
            <h2>{context.gameTitle}</h2>
            <p className="muted">
              {context.gameGenre} · {context.visualStyle}
            </p>
            {context.currentMission && (
              <p className="mission">Mission: {context.currentMission}</p>
            )}
          </section>
        )}

        <section className="card">
          <h3>Generate asset (mock Blender)</h3>
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. golden chest, stone pillar"
          />
          <button onClick={onGenerateAsset} disabled={busy}>
            {busy ? "Working…" : "Generate & render"}
          </button>
          <button className="ghost" onClick={clear} disabled={busy}>
            Clear scene
          </button>
        </section>

        <section className="card">
          <h3>NPC dialogue{npcName ? ` · ${npcName}` : ""}</h3>
          <input
            value={playerAction}
            onChange={(e) => setPlayerAction(e.target.value)}
            placeholder="player action"
          />
          <button onClick={onGenerateDialogue} disabled={busy}>
            {busy ? "Working…" : "Ask the LLM"}
          </button>
        </section>

        <section className="card log">
          <h3>Activity</h3>
          <ul>
            {log.map((entry) => (
              <li key={entry.id} className={entry.kind}>
                {entry.source && <span className={`tag ${entry.source}`}>{entry.source}</span>}
                {entry.text}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <div className="viewport" ref={containerRef} />
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
  const state =
    reachable === null ? "pending" : reachable ? "online" : "mock";
  const label =
    reachable === null
      ? "Checking LLM…"
      : reachable
        ? `LLM online: ${model}`
        : `Mock mode (${model})`;
  return <div className={`status ${state}`}>{label}</div>;
}
