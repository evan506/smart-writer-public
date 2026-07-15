"use server";

import { requireProjectOwner } from "@/lib/auth/ownership";
import { createClient } from "@/lib/supabase/server";
import {
  renderReportMarkdown,
  ReportService,
  type ReportData,
  type ReportDataOptions,
  type ReportMarkdownOptions,
} from "@/lib/services";

export interface ReportMarkdownRequestOptions extends ReportDataOptions {
  includeOperatorNotes?: ReportMarkdownOptions["includeOperatorNotes"];
}

export async function getProjectReportData(
  projectId: string,
  options: ReportDataOptions = {}
): Promise<{ data: ReportData | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const owner = await requireProjectOwner(supabase, projectId);
    if (!owner.ok) return { data: null, error: owner.error };

    const service = new ReportService(supabase);
    const data = await service.getReportData(projectId, options);

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "리포트 데이터를 불러오는 중 오류가 발생했습니다.",
    };
  }
}

export async function getProjectReportMarkdown(
  projectId: string,
  options: ReportMarkdownRequestOptions = {}
): Promise<{ markdown: string | null; error: string | null }> {
  const result = await getProjectReportData(projectId, options);
  if (result.error || !result.data) {
    return { markdown: null, error: result.error };
  }

  return {
    markdown: renderReportMarkdown(result.data, {
      includeOperatorNotes: options.includeOperatorNotes,
    }),
    error: null,
  };
}
