import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { EmbedOptions } from "./embedding.service";
import { createLLMBudgetGuard, LLMBudgetError } from "./llm-budget.service";
import { createLLMUsageLogger, type LLMUsageLogContext } from "./llm-usage-logger.service";

/** Shared paid boundary: attribute usage, log each batch, recheck each attempt. */
export function createBudgetedEmbeddingOptions(
  supabase: SupabaseClient<Database>,
  context: LLMUsageLogContext
): EmbedOptions {
  const check = createLLMBudgetGuard(supabase, context);
  let loggingFailed = false;
  const log = createLLMUsageLogger(supabase, context, {
    failOnError: true,
    onFailure: () => { loggingFailed = true; },
  });
  return {
    incrementalUsage: true,
    beforeRequest: async () => {
      if (loggingFailed) throw new LLMBudgetError("unavailable");
      await check();
    },
    onComplete: async (metadata) => {
      try {
        await log(metadata);
      } catch (error) {
        loggingFailed = true;
        console.error("[Embedding] usage persistence unavailable:", error);
        throw new LLMBudgetError("unavailable");
      }
    },
  };
}
