import type { UploadProject } from "../state/recorder-state";

type ProjectPickerProps = {
  projects: UploadProject[] | undefined;
  selectedProjectId: string | null;
  disabled?: boolean;
  onSelect: (projectId: UploadProject["projectId"]) => void;
};

export function ProjectPicker({
  projects,
  selectedProjectId,
  disabled = false,
  onSelect,
}: ProjectPickerProps) {
  return (
    <section className="setup-section">
      <div className="setup-section-header">
        <div>
          <p className="eyebrow">upload project</p>
          <h2>Send recordings to the right Loam project</h2>
        </div>
      </div>

      {projects === undefined ? (
        <p className="support-copy">Loading uploadable projects from Convex.</p>
      ) : null}

      {projects !== undefined && projects.length === 0 ? (
        <p className="support-copy">
          No uploadable project is available for this account yet.
        </p>
      ) : null}

      {projects && projects.length > 0 ? (
        <div className="choice-grid">
          {projects.map((project) => (
            <button
              key={project.projectId}
              className={`choice-card${selectedProjectId === project.projectId ? " is-selected" : ""}`}
              disabled={disabled}
              type="button"
              onClick={() => {
                onSelect(project.projectId);
              }}
            >
              <strong>{project.projectName}</strong>
              <span>{project.teamName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
