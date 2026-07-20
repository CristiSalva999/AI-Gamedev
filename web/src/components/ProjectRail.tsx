import type { ProjectMeta } from "@ai-gamedev/shared";

interface ProjectRailProps {
  projects: ProjectMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (project: ProjectMeta) => void;
}

export function ProjectRail({
  projects,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ProjectRailProps): JSX.Element {
  return (
    <nav className="rail" aria-label="Projects">
      <div className="rail-brand">
        <span className="rail-mark" aria-hidden />
        <div>
          <div className="rail-brand-name">GameDev</div>
          <div className="rail-brand-sub">Studio</div>
        </div>
      </div>

      <button type="button" className="rail-new" onClick={onNew}>
        New game
      </button>

      <div className="rail-label">Projects</div>
      {projects.length === 0 ? (
        <p className="rail-empty">No games yet — start one.</p>
      ) : (
        <ul className="rail-list">
          {projects.map((project) => (
            <li key={project.id} className="rail-row">
              <button
                type="button"
                className={`rail-item${project.id === activeId ? " active" : ""}`}
                onClick={() => onSelect(project.id)}
                title={project.title}
              >
                <span className="rail-item-title">{project.title}</span>
                <span className="rail-item-sub">
                  {project.genre}
                  {project.hasBuild ? "" : " · draft"}
                </span>
              </button>
              <button
                type="button"
                className="rail-delete"
                title={`Delete "${project.title}"`}
                aria-label={`Delete ${project.title}`}
                onClick={() => onDelete(project)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
