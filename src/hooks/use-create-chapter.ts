"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { createChapter } from "@/app/(dashboard)/projects/[id]/chapters-actions";
import type { Chapter } from "@/types";

/** Hold this hook once per workspace; every create button shares the same request. */
export function useCreateChapter(projectId: string, onCreated: (chapter: Chapter) => void | Promise<void>) {
  const [isCreating, setIsCreating] = useState(false);
  const inFlight = useRef(false);
  const pending = useRef<{ projectId: string; requestId: string } | null>(null);

  const create = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsCreating(true);
    try {
      if (pending.current?.projectId !== projectId) {
        pending.current = { projectId, requestId: crypto.randomUUID() };
      }
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("requestId", pending.current.requestId);
      formData.set("title", "");
      const result = await createChapter(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.chapter) throw new Error("Missing created chapter");
      await onCreated(result.chapter);
      pending.current = null;
    } catch {
      toast.error("챕터가 만들어졌는지 확인하지 못했습니다. 다시 눌러 확인해 주세요.");
    } finally {
      inFlight.current = false;
      setIsCreating(false);
    }
  }, [projectId, onCreated]);

  return { create, isCreating };
}
