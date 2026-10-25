import type { LLMUsageCallback } from "../../src/lib/services/llm.service";
import type { ExtractionValidationDiagnostic } from "../../src/lib/services/entity-extraction/stage-llm-wrappers";

/** Private sidecars only. Persist accounting first, including when it stops the run. */
export function createEvalDiagnostics(
  context: string,
  account: LLMUsageCallback,
  save: (name: string, data: unknown) => void,
  stop: (reason: string) => never
) {
  const responseIds = new Map<number, string | undefined>();
  const onBatchComplete = (batch: number, candidates: string[]): LLMUsageCallback => async (metadata) => {
    const { responseDiagnostics, ...usage } = metadata;
    try {
      await account(usage);
    } finally {
      responseIds.set(batch, metadata.providerResponseId);
      try {
        save(`${context}-batch${batch}-response.json`, { context, batch, candidates,
          ...usage, responseDiagnostics });
      } catch {
        stop("response diagnostic record failed");
      }
    }
    // A complete JSON value can still be an incomplete model generation.
    // Stop only after accounting and raw persistence, without changing product calls.
    if (responseDiagnostics?.finishReason === "length") {
      stop("provider output reached length limit");
    }
  };
  const onValidation = (diagnostic: ExtractionValidationDiagnostic) => {
    try {
      save(`${context}-batch${diagnostic.batch}-validation.json`, {
        context, ...diagnostic, providerResponseId: responseIds.get(diagnostic.batch),
      });
    } catch {
      stop("validation diagnostic record failed");
    }
  };
  return { captureResponseDiagnostics: true, onComplete: onBatchComplete(1, []),
    onBatchComplete, onValidation };
}
