import type { ProjectCardData } from "./types";
import { timeAgo } from "./utils";

export function ProjectCardBody({ project }: { project: ProjectCardData }) {
  return (
    <>
      <div
        className="mb-1 line-clamp-1 text-base font-bold"
        style={{ color: "var(--sw-text-primary)" }}
      >
        {project.title}
      </div>

      {project.description && (
        <div
          className="mb-2.5 truncate text-[11px]"
          style={{
            color: "var(--sw-text-muted)",
            lineHeight: 1.5,
          }}
        >
          {project.description}
        </div>
      )}

      <ProjectStats project={project} />
      <ProjectLastChapter project={project} />
    </>
  );
}

function ProjectStats({ project }: { project: ProjectCardData }) {
  return (
    <div
      className="mb-2.5 flex gap-3 text-[11px]"
      style={{ color: "var(--sw-text-muted)" }}
    >
      <StatValue value={project.chapterCount} label="챕터" />
      <StatValue value={project.entityCount} label="설정" />
      <StatValue value={project.wordCount.toLocaleString()} label="자" />
    </div>
  );
}

function StatValue({ value, label }: { value: number | string; label: string }) {
  return (
    <span>
      <span
        className="mr-0.5 font-bold"
        style={{
          color: "var(--sw-text-primary)",
          fontFamily: "var(--sw-font-mono)",
        }}
      >
        {value}
      </span>
      {label}
    </span>
  );
}

function ProjectLastChapter({ project }: { project: ProjectCardData }) {
  if (!project.lastChapter) {
    return (
      <div
        className="flex items-center justify-between rounded-md px-2.5 py-1.5"
        style={{
          background: "rgba(125,211,168,0.08)",
          border: "1px solid rgba(125,211,168,0.16)",
        }}
      >
        <span
          className="text-[11px] font-semibold"
          style={{ color: "var(--sw-accent)" }}
        >
          첫 챕터 쓰기
        </span>
        <span className="text-[10px]" style={{ color: "var(--sw-text-muted)" }}>
          저장하면 작품 기억이 시작됩니다
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between rounded-md px-2.5 py-1.5"
      style={{
        background: "var(--sw-bg-hover)",
        border: "1px solid var(--sw-border-subtle)",
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="shrink-0 text-[10px]"
          style={{
            color: "var(--sw-text-muted)",
            fontFamily: "var(--sw-font-mono)",
          }}
        >
          Ch.{project.lastChapter.chapterNum}
        </span>
        <span
          className="truncate text-[11px]"
          style={{ color: "var(--sw-text-secondary)" }}
        >
          {project.lastChapter.title || "제목 없음"}
        </span>
      </div>
      <span
        className="ml-2 shrink-0 text-[10px]"
        style={{ color: "var(--sw-text-muted)" }}
      >
        {timeAgo(project.lastChapter.updatedAt)}
      </span>
    </div>
  );
}
