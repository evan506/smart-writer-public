"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteProject } from "@/app/(dashboard)/projects/actions";
import { ProjectCardBody } from "./project-card/body";
import { ProjectDeleteDialog } from "./project-card/delete-dialog";
import { ProjectCardHeader } from "./project-card/header";
import type { ProjectCardData } from "./project-card/types";

export type { ProjectCardData } from "./project-card/types";

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await deleteProject(project.id);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`"${project.title}" 프로젝트가 삭제되었습니다`);
      router.refresh();
    }
    setDialogOpen(false);
  }

  return (
    <>
      <Link
        href={`/projects/${project.id}/write`}
        className="block rounded-xl border transition-all duration-150"
        style={{
          background: "var(--sw-bg-elevated)",
          borderColor: "var(--sw-border-default)",
          padding: "20px",
          position: "relative",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "var(--sw-bg-overlay)";
          event.currentTarget.style.borderColor = "var(--sw-border-hover)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "var(--sw-bg-elevated)";
          event.currentTarget.style.borderColor = "var(--sw-border-default)";
        }}
      >
        <ProjectCardHeader
          project={project}
          onDelete={() => setDialogOpen(true)}
        />
        <ProjectCardBody project={project} />
      </Link>

      <ProjectDeleteDialog
        title={project.title}
        open={dialogOpen}
        pending={pending}
        onOpenChange={setDialogOpen}
        onDelete={handleDelete}
      />
    </>
  );
}
