import type { PreviewCameraView } from "../lib/cameraView.js";
import type { ViewportInspectorStats } from "../lib/studioChrome.js";

interface ViewportStudioProps {
  cameraView: PreviewCameraView;
  onCameraView: (view: PreviewCameraView) => void;
  stats: ViewportInspectorStats | null;
  helpersVisible: boolean;
  onToggleHelpers: () => void;
  legendVisible: boolean;
  onToggleLegend: () => void;
  controlLine: string | null;
  emptyHint: string;
  onResetRun: () => void;
  onFullscreen: () => void;
}

/**
 * Chrome around (and over) the playable preview: camera modes, helpers,
 * inspector strip, focus/fullscreen — keeps App.tsx from becoming a layout dump.
 */
export function ViewportStudio({
  cameraView,
  onCameraView,
  stats,
  helpersVisible,
  onToggleHelpers,
  legendVisible,
  onToggleLegend,
  controlLine,
  emptyHint,
  onResetRun,
  onFullscreen,
}: ViewportStudioProps): JSX.Element {
  return (
    <>
      <div className="viewport-toolbar">
        <div className="seg" role="group" aria-label="Camera mode">
          <button
            type="button"
            className={cameraView === "scene" ? "active" : undefined}
            onClick={() => onCameraView("scene")}
            title="Scene / chase camera"
          >
            Scene
          </button>
          <button
            type="button"
            className={cameraView === "first_person" ? "active" : undefined}
            onClick={() => onCameraView("first_person")}
            title="First-person camera"
          >
            First person
          </button>
        </div>

        <div className="viewport-toolbar-actions">
          <button
            type="button"
            className="tool"
            onClick={onResetRun}
            title="Restart the run: respawn, restore loot and enemies, reset objectives"
          >
            Reset
          </button>
          <button
            type="button"
            className={`tool${helpersVisible ? " on" : ""}`}
            onClick={onToggleHelpers}
            title="Toggle ground grid helpers"
          >
            Grid
          </button>
          <button
            type="button"
            className={`tool${legendVisible ? " on" : ""}`}
            onClick={onToggleLegend}
            title="Toggle on-canvas control legend"
          >
            Keys
          </button>
          <button type="button" className="tool" onClick={onFullscreen} title="Fullscreen preview">
            Fullscreen
          </button>
        </div>
      </div>

      {cameraView === "first_person" ? <div className="crosshair" aria-hidden /> : null}

      {legendVisible && controlLine ? (
        <div className="control-legend" aria-live="polite">
          {controlLine}
        </div>
      ) : null}

      <div className="inspector-strip">
        {stats ? (
          <>
            <span className="inspector-title">{stats.title}</span>
            <span>{stats.genre}</span>
            <span>{stats.scheme}</span>
            <span>{stats.lighting}</span>
            <span>
              {stats.entities} props
              {stats.enemies > 0 ? ` · ${stats.enemies} foes` : ""}
            </span>
            {stats.difficulty ? <span>{stats.difficulty}</span> : null}
            <span className="inspector-objective">{stats.objective}</span>
          </>
        ) : (
          <span className="inspector-empty">{emptyHint}</span>
        )}
      </div>
    </>
  );
}
