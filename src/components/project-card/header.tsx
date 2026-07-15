import { ProjectCardMenu } from "./menu";
import type { ProjectCardData } from "./types";

export function ProjectCardHeader({
  project,
  onDelete,
}: {
  project: ProjectCardData;
  onDelete: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {project.genre && (
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold"
            style={{
              color: "var(--sw-accent)",
              background: "var(--sw-accent-bg)",
            }}
          >
            {project.genre}
          </span>
        )}
        {project.isRecentlyActive && (
          <div className="flex items-center gap-1">
            <span
              className="inline-block rounded-full"
              style={{
                width: 6,
                height: 6,
                background: "var(--sw-accent)",
              }}
            />
            <span
              className="text-[9px] font-semibold"
              style={{ color: "var(--sw-accent)" }}
            >
              작업 중
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {project.pendingCount > 0 && <PendingBadge count={project.pendingCount} />}
        <ProjectCardMenu projectId={project.id} onDelete={onDelete} />
      </div>
    </div>
  );
}

function PendingBadge({ count }: { count: number }) {
  return (
    <div
      className="flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        background: "rgba(232,168,56,0.1)",
        border: "1px solid rgba(232,168,56,0.15)",
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: 5,
          height: 5,
          background: "var(--sw-warning)",
        }}
      />
      <span
        className="text-[9px] font-bold"
        style={{ color: "var(--sw-warning)" }}
      >
        {count}
      </span>
    </div>
  );
}
