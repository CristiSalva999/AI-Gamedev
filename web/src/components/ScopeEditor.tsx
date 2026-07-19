import { useState } from "react";
import {
  GENRE_KINDS,
  SETUP_TIMES,
  type GameSetupAnswers,
} from "@ai-gamedev/shared";

interface ScopeEditorProps {
  initial: GameSetupAnswers;
  busy: boolean;
  onSave: (answers: GameSetupAnswers, rebuild: boolean) => Promise<void>;
  onCancel: () => void;
}

/** Inline editor to steer a project's scope (setup answers), with an optional rebuild. */
export function ScopeEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: ScopeEditorProps): JSX.Element {
  const [answers, setAnswers] = useState<GameSetupAnswers>({ ...initial });
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof GameSetupAnswers>(key: K, value: GameSetupAnswers[K]): void {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function save(rebuild: boolean): Promise<void> {
    setError(null);
    if (!answers.title.trim()) {
      setError("Title cannot be empty.");
      return;
    }
    try {
      await onSave(answers, rebuild);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="scope-editor">
      <h3>Edit scope</h3>
      <label>
        Title
        <input value={answers.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label>
        Genre
        <select value={answers.genre} onChange={(e) => set("genre", e.target.value as GameSetupAnswers["genre"])}>
          {GENRE_KINDS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label>
        Setting
        <input value={answers.setting} onChange={(e) => set("setting", e.target.value)} />
      </label>
      <label>
        Time of day
        <select
          value={answers.timeOfDay}
          onChange={(e) => set("timeOfDay", e.target.value as GameSetupAnswers["timeOfDay"])}
        >
          {SETUP_TIMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Objective
        <input value={answers.goal} onChange={(e) => set("goal", e.target.value)} />
      </label>
      <label>
        Storyline
        <textarea value={answers.storyline} onChange={(e) => set("storyline", e.target.value)} rows={3} />
      </label>
      {error && <p className="line error">{error}</p>}
      <div className="scope-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="secondary" onClick={() => void save(false)} disabled={busy}>
          Save scope
        </button>
        <button type="button" onClick={() => void save(true)} disabled={busy}>
          {busy ? "Rebuilding…" : "Save & rebuild"}
        </button>
      </div>
    </div>
  );
}
