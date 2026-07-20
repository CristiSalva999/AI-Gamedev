import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  composeSetupPrompt,
  type BuildEvent,
  type BuildManifest,
  type GameBlueprint,
  type GameSetupAnswers,
  type GenerationSource,
  type ProjectMeta,
} from "@ai-gamedev/shared";
import { api } from "./lib/api.js";
import { useThreeScene } from "./hooks/useThreeScene.js";
import { ProjectRail } from "./components/ProjectRail.js";
import { ScopeEditor } from "./components/ScopeEditor.js";
import { SetupWizard } from "./components/SetupWizard.js";

type LineKind = "user" | "assistant" | "stage" | "peek" | "artifact" | "error";
type View = "welcome" | "wizard" | "project";

interface ChatLine {
  id: number;
  kind: LineKind;
  text: string;
  source?: GenerationSource;
  action?: { label: string; href: string };
}

let lineSeq = 0;

const STEER_SUGGESTIONS = [
  "make it night",
  "add more crates",
  "player faster",
  "storyline: a lone explorer races the coming storm",
];

export function App(): JSX.Element {
  const { containerRef, setBlueprint, cameraView, setCameraView } = useThreeScene();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentMeta, setCurrentMeta] = useState<ProjectMeta | null>(null);
  const [editingScope, setEditingScope] = useState(false);
  const [view, setView] = useState<View>("welcome");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [building, setBuilding] = useState(false);
  const [blueprint, setBlueprintState] = useState<GameBlueprint | null>(null);
  const [manifest, setManifest] = useState<BuildManifest | null>(null);
  const [llmReachable, setLlmReachable] = useState<boolean | null>(null);
  const [model, setModel] = useState("");
  const [blenderMode, setBlenderMode] = useState<"blender" | "procedural" | null>(null);
  const [assetKitEntries, setAssetKitEntries] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pushLine = useCallback((line: Omit<ChatLine, "id">) => {
    setLines((prev) => [...prev, { id: lineSeq++, ...line }]);
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch {
      // Non-fatal: the rail simply stays as-is.
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, building]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [health, list] = await Promise.all([api.health(), api.listProjects()]);
        if (cancelled) return;
        setLlmReachable(health.llm.reachable);
        setModel(health.llm.model);
        setBlenderMode(health.blender.mode);
        setAssetKitEntries(health.assetKit?.entries ?? null);
        setProjects(list);
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
  }, []);

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

  const runMessage = useCallback(
    async (message: string, projectId: string) => {
      const text = message.trim();
      if (!text || building) return;
      pushLine({ kind: "user", text });
      setBuilding(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await api.chat(text, handleEvent, controller.signal, projectId);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          pushLine({ kind: "assistant", text: "Build cancelled." });
        } else {
          pushLine({ kind: "error", text: `Build failed: ${(err as Error).message}` });
        }
      } finally {
        abortRef.current = null;
        setBuilding(false);
        inputRef.current?.focus();
        void refreshProjects();
      }
    },
    [building, handleEvent, pushLine, refreshProjects],
  );

  const send = useCallback(
    async (message: string) => {
      if (!ready || !activeId) return;
      setInput("");
      await runMessage(message, activeId);
    },
    [ready, activeId, runMessage],
  );

  const openProject = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      setView("project");
      setActiveId(id);
      setEditingScope(false);
      setManifest(null);
      setBlueprintState(null);
      setLines([]);
      try {
        const { meta, context } = await api.getProject(id);
        setCurrentMeta(meta);
        if (context.blueprint) {
          setBlueprint(context.blueprint);
          setBlueprintState(context.blueprint);
        }
        if (context.lastManifest) setManifest(context.lastManifest);
        setLines(
          context.chat.map((msg) => ({
            id: lineSeq++,
            kind: msg.role === "user" ? "user" : "assistant",
            text: msg.content,
          })),
        );
      } catch (err) {
        pushLine({ kind: "error", text: `Could not open project: ${(err as Error).message}` });
      }
    },
    [pushLine, setBlueprint],
  );

  const handleDelete = useCallback(
    async (project: ProjectMeta) => {
      if (!window.confirm(`Delete "${project.title}"? This removes its workspace and cannot be undone.`)) {
        return;
      }
      try {
        await api.deleteProject(project.id);
      } catch (err) {
        pushLine({ kind: "error", text: `Delete failed: ${(err as Error).message}` });
        return;
      }
      if (activeId === project.id) {
        abortRef.current?.abort();
        setActiveId(null);
        setCurrentMeta(null);
        setBlueprintState(null);
        setManifest(null);
        setLines([]);
        setEditingScope(false);
        setView("welcome");
      }
      await refreshProjects();
    },
    [activeId, refreshProjects, pushLine],
  );

  const handleSaveScope = useCallback(
    async (answers: GameSetupAnswers, rebuild: boolean) => {
      if (!activeId) return;
      const meta = await api.updateProject(activeId, answers);
      setCurrentMeta(meta);
      setEditingScope(false);
      await refreshProjects();
      if (rebuild) {
        await runMessage(composeSetupPrompt(answers), activeId);
      }
    },
    [activeId, refreshProjects, runMessage],
  );

  const handleCreate = useCallback(
    async (answers: GameSetupAnswers) => {
      const created = await api.createProject(answers);
      await refreshProjects();
      setActiveId(created.id);
      setCurrentMeta(created);
      setEditingScope(false);
      setManifest(null);
      setBlueprintState(null);
      setView("project");
      setLines([
        {
          id: lineSeq++,
          kind: "assistant",
          text: `Project "${created.title}" created. Kicking off the first build from your setup…`,
        },
      ]);
      await runMessage(created.initialPrompt, created.id);
    },
    [refreshProjects, runMessage],
  );

  const startNew = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
    setBlueprintState(null);
    setManifest(null);
    setLines([]);
    setView("wizard");
  }, []);

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

  const suggestions = useMemo(() => STEER_SUGGESTIONS, []);

  return (
    <div className="layout">
      <ProjectRail
        projects={projects}
        activeId={activeId}
        onSelect={(id) => void openProject(id)}
        onNew={startNew}
        onDelete={(project) => void handleDelete(project)}
      />

      <aside className="panel">
        <header className="brand">
          <h1>AI GameDev</h1>
          <StatusBadge
            reachable={llmReachable}
            model={model}
            blenderMode={blenderMode}
            assetKitEntries={assetKitEntries}
          />
        </header>

        {view === "project" && (
          <div className="game-head">
            <div className="game-head-text">
              <strong>{currentMeta?.title ?? blueprint?.gameTitle ?? "Project"}</strong>
              {currentMeta && <span className="muted"> · {currentMeta.genre}</span>}
            </div>
            <div className="game-head-actions">
              <button
                type="button"
                className="link"
                onClick={() => setEditingScope((v) => !v)}
                disabled={!currentMeta || building}
              >
                {editingScope ? "Close" : "Edit scope"}
              </button>
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
          </div>
        )}

        {view === "wizard" ? (
          <SetupWizard onCreate={handleCreate} onCancel={() => setView("welcome")} />
        ) : view === "welcome" ? (
          <div className="welcome">
            <h2>Start a new game project</h2>
            <p className="muted">
              Answer a few questions and I&apos;ll build a playable game, then steer
              it with follow-ups like &ldquo;make it night&rdquo; or
              &ldquo;storyline: …&rdquo;.
            </p>
            <button type="button" onClick={startNew} disabled={!ready}>
              + New game
            </button>
            {projects.length > 0 && (
              <p className="muted small">…or pick a project on the left.</p>
            )}
          </div>
        ) : editingScope && currentMeta ? (
          <ScopeEditor
            initial={currentMeta.setup}
            busy={building}
            onSave={handleSaveScope}
            onCancel={() => setEditingScope(false)}
          />
        ) : (
          <>
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
                placeholder={building ? "Building…" : "Steer the build or edit the storyline…"}
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
          </>
        )}
      </aside>

      <main className="viewport-wrap">
        <div className="viewport" ref={containerRef} />
        <div className="camera-toggle" role="group" aria-label="Camera mode">
          <button
            type="button"
            className={cameraView === "scene" ? "active" : undefined}
            onClick={() => setCameraView("scene")}
            title="Orbit / chase scene camera"
          >
            Scene
          </button>
          <button
            type="button"
            className={cameraView === "first_person" ? "active" : undefined}
            onClick={() => setCameraView("first_person")}
            title="First-person eye camera"
          >
            First person
          </button>
        </div>
        <div className="hud">
          {blueprint ? (
            <>
              <div>
                {blueprint.runtime
                  ? `${blueprint.runtime.difficulty} · ${primaryObjectiveLabel(blueprint)}`
                  : blueprint.pitch}
              </div>
              <div>
                Click preview · {blueprint.controls?.hudLine ?? "WASD move"}
                {cameraView === "first_person"
                  ? " · first person (mouse look)"
                  : blueprint.controls?.scheme === "fps"
                    ? " · chase cam"
                    : " · drag to orbit"}
              </div>
            </>
          ) : (
            "Your game preview will appear here as the build streams"
          )}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({
  reachable,
  model,
  blenderMode,
  assetKitEntries,
}: {
  reachable: boolean | null;
  model: string;
  blenderMode: "blender" | "procedural" | null;
  assetKitEntries: number | null;
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
  const kitLabel =
    assetKitEntries != null && assetKitEntries > 0 ? ` · kit ${assetKitEntries}` : "";
  return (
    <span className={`status ${state}`} title={model || undefined}>
      {llmLabel}
      {assetLabel}
      {kitLabel}
    </span>
  );
}

function shortModel(model: string): string {
  if (model.length <= 18) return model;
  return `${model.slice(0, 16)}…`;
}

/** Prefer the active required objective so steer leftovers don't clutter the HUD. */
function primaryObjectiveLabel(blueprint: GameBlueprint): string {
  const objectives = blueprint.runtime?.objectives ?? [];
  const primary =
    objectives.find((o) => !o.optional && o.progress < o.target) ??
    objectives.find((o) => !o.optional) ??
    objectives[0];
  return primary?.label ?? blueprint.pitch;
}
