import { useState } from "react";
import {
  DEFAULT_SETUP_ANSWERS,
  SETUP_QUESTIONS,
  type GameSetupAnswers,
  type SetupQuestion,
} from "@ai-gamedev/shared";

interface SetupWizardProps {
  onCreate: (answers: GameSetupAnswers) => Promise<void>;
  onCancel: () => void;
}

export function SetupWizard({ onCreate, onCancel }: SetupWizardProps): JSX.Element {
  const [answers, setAnswers] = useState<GameSetupAnswers>({ ...DEFAULT_SETUP_ANSWERS });
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = SETUP_QUESTIONS[step];
  const isLast = step === SETUP_QUESTIONS.length - 1;
  const value = String(answers[question.id]);

  function update(id: keyof GameSetupAnswers, next: string): void {
    setAnswers((prev) => ({ ...prev, [id]: next }));
  }

  async function next(): Promise<void> {
    setError(null);
    if (question.id === "title" && !answers.title.trim()) {
      setError("Please give your game a title.");
      return;
    }
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    setSubmitting(true);
    try {
      await onCreate(answers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="wizard">
      <div className="wizard-card">
        <div className="wizard-top">
          <span className="wizard-progress">
            Question {step + 1} of {SETUP_QUESTIONS.length}
          </span>
          <button type="button" className="link" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        </div>
        <h2>{question.label}</h2>
        <p className="wizard-help">{question.help}</p>
        <QuestionInput question={question} value={value} onChange={(v) => update(question.id, v)} />
        {error && <p className="line error">{error}</p>}
        <div className="wizard-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Back
          </button>
          <button type="button" onClick={() => void next()} disabled={submitting}>
            {submitting ? "Building…" : isLast ? "Create game" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: SetupQuestion;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  if (question.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {question.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (question.type === "textarea") {
    return (
      <textarea
        value={value}
        placeholder={question.placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      placeholder={question.placeholder}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
    />
  );
}
