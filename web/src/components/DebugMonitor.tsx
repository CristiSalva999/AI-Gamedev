import type { PreviewDebugSnapshot } from "../lib/debugMonitor.js";
import { debugMonitorSections } from "../lib/debugMonitor.js";

interface DebugMonitorProps {
  snapshot: PreviewDebugSnapshot | null;
  visible: boolean;
}

/**
 * On-canvas real-time variable monitor. Pointer-events none so it never
 * steals WASD focus; the toolbar "Debug" toggle owns visibility.
 */
export function DebugMonitor({ snapshot, visible }: DebugMonitorProps): JSX.Element | null {
  if (!visible || !snapshot) return null;
  const sections = debugMonitorSections(snapshot);
  return (
    <aside className="debug-monitor" aria-label="Real-time preview debug monitor">
      <header className="debug-monitor-head">
        <span>Debug</span>
        <span className="debug-monitor-fps">{Math.round(snapshot.fps)} fps</span>
      </header>
      {sections.map((section) => (
        <section key={section.title} className="debug-monitor-section">
          <h3>{section.title}</h3>
          <dl>
            {section.rows.map((row) => (
              <div key={row.label} className="debug-monitor-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </aside>
  );
}
