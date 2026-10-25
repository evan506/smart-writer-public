/** An analysis failure, independent of provider success and usage accounting. */
export class ExtractionStageError extends Error {
  constructor(
    readonly stage: "stage1" | "stage2" | "stage3",
    reason: "invalid response" | "request failed",
    cause?: unknown
  ) {
    super(`${stage}: ${reason}`, { cause });
    this.name = "ExtractionStageError";
  }
}
