import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AIAnalysisResult } from "@/types/ai-analysis";
import { ContextAssemblyService } from "./context-assembly.service";
import { buildAnalysisPrompt } from "./prompt-templates";
import { callLLM } from "./llm.service";
import { getLLMModel } from "./llm-models";
import { getPromptTemplateVersion } from "./prompt-versions";
import { createLLMUsageLogger } from "./llm-usage-logger.service";

export class AIAnalysisService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async analyze(
    projectId: string,
    chapterId: string,
    content: string,
    options: { userId?: string | null } = {}
  ): Promise<AIAnalysisResult> {
    const assembler = new ContextAssemblyService(this.supabase);
    const ctx = await assembler.assemble(projectId, chapterId, content);

    const { system, user } = buildAnalysisPrompt(ctx);
    const raw = await callLLM({
      system,
      user,
      maxTokens: 4096,
      model: getLLMModel("analysis"),
      onComplete: createLLMUsageLogger(this.supabase, {
        projectId,
        userId: options.userId ?? null,
        feature: "analysis",
        promptTemplateKey: "analysis.chapter",
        promptTemplateVersion: getPromptTemplateVersion("analysis.chapter"),
      }),
    });

    // Parse JSON response — strip markdown code fences first
    try {
      const stripped = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions
          : [],
        references: Array.isArray(parsed.references) ? parsed.references : [],
      };
    } catch {
      return {
        conflicts: [],
        suggestions: [],
        references: [],
        rawResponse: raw,
      };
    }
  }
}
