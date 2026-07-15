import type { ForeshadowStatus } from "@/types";

export const FORESHADOW_STATUSES = ["PLANTED", "REVEALED", "ABANDONED"] as const;

export type ForeshadowFormPayload = {
  projectId: string;
  foreshadowId?: string;
  description: string | null;
  plantedChapter: number;
  expectedReveal: number | null;
  status: ForeshadowStatus;
  entityIds: string[] | null;
};

export type ForeshadowMetricRow = {
  status: string | null;
  expected_reveal: number | null;
};

export function isForeshadowStatus(value: unknown): value is ForeshadowStatus {
  return typeof value === "string" && FORESHADOW_STATUSES.includes(value as ForeshadowStatus);
}

function parsePositiveChapter(
  value: FormDataEntryValue | null,
  label: string
): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, error: `${label} 올바르게 입력하세요` };
  }
  return { ok: true, value: parsed };
}

export function parseForeshadowFormData(
  formData: FormData,
  options?: {
    requireForeshadowId?: boolean;
    requireStatus?: boolean;
  }
): { ok: true; payload: ForeshadowFormPayload } | { ok: false; error: string } {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return { ok: false, error: "프로젝트를 찾을 수 없습니다" };

  const foreshadowId = String(formData.get("foreshadowId") ?? "").trim();
  if (options?.requireForeshadowId && !foreshadowId) {
    return { ok: false, error: "복선을 찾을 수 없습니다" };
  }

  const planted = parsePositiveChapter(formData.get("planted_chapter"), "심은 회차를");
  if (!planted.ok) return { ok: false, error: planted.error };

  const expectedRevealRaw = String(formData.get("expected_reveal") ?? "").trim();
  let expectedReveal: number | null = null;
  if (expectedRevealRaw) {
    const expected = parsePositiveChapter(expectedRevealRaw, "회수 예정 회차를");
    if (!expected.ok) return { ok: false, error: expected.error };
    expectedReveal = expected.value;
  }

  const rawStatus = formData.get("status");
  const status = rawStatus ?? "PLANTED";
  if ((options?.requireStatus || rawStatus != null) && !isForeshadowStatus(status)) {
    return { ok: false, error: "복선 상태를 올바르게 선택하세요" };
  }

  const description = String(formData.get("description") ?? "").trim() || null;
  const entityIds = Array.from(
    new Set(
      formData
        .getAll("entity_ids")
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );

  return {
    ok: true,
    payload: {
      projectId,
      foreshadowId: foreshadowId || undefined,
      description,
      plantedChapter: planted.value,
      expectedReveal,
      status: isForeshadowStatus(status) ? status : "PLANTED",
      entityIds: entityIds.length > 0 ? entityIds : null,
    },
  };
}

export function buildForeshadowListMetrics(rows: ForeshadowMetricRow[]) {
  const counts: Record<ForeshadowStatus | "ALL", number> = {
    ALL: rows.length,
    PLANTED: 0,
    REVEALED: 0,
    ABANDONED: 0,
  };

  for (const row of rows) {
    if (isForeshadowStatus(row.status)) counts[row.status] += 1;
  }

  return {
    counts,
    unscheduledCount: rows.filter((row) => !row.expected_reveal).length,
  };
}

export function isForeshadowOwnedByProject(
  row: { project_id: string } | null | undefined,
  projectId: string
) {
  return Boolean(row && row.project_id === projectId);
}

export function getForeshadowRevalidationPaths(
  projectId: string,
  foreshadowId?: string
) {
  return [
    `/projects/${projectId}/foreshadows`,
    ...(foreshadowId ? [`/projects/${projectId}/foreshadows/${foreshadowId}`] : []),
    `/projects/${projectId}`,
  ];
}
