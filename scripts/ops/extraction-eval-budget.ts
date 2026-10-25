import { LLMBudgetError } from "../../src/lib/services/llm-budget.service";
import type { LLMUsageMetadata } from "../../src/lib/services/llm.service";

// Haiku4.5: entire 200K context at 2x cache-write input price + 2048 output.
// Reserve the same conservative bound for preflight/Stage1/Stage2.
export const EVAL_REQUEST_RESERVATION_USD = 0.41024;
const SCALE = 100_000_000;
const RESERVATION = 41_024_000;

export type EvalBudgetEvent = {
  kind: "reserved" | "completed" | "stopped";
  context: string;
  attempts: number;
  spentUsd: number;
  reservedUsd: number;
  reason?: string;
  metadata?: LLMUsageMetadata;
};

/** Eval-local guard only. Never reads/writes operational budgets or Supabase. */
export class EvalRequestBudget {
  private attempts = 0;
  private spent = 0;
  private reserved = 0;
  private stopped?: string;
  private context = "preflight";
  private readonly limit: number;

  constructor(
    private readonly maxRequests: number,
    budgetUsd: number,
    private readonly persist: (event: EvalBudgetEvent) => void,
  ) {
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 25 ||
        !Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 1) {
      throw new Error("Eval requires at most 25 requests and $1; limits must be positive");
    }
    this.limit = Math.floor(budgetUsd * SCALE);
  }

  setContext(context: string) { this.context = context; }
  get reason() { return this.stopped; }
  get snapshot() {
    return { attempts: this.attempts, spentUsd: this.spent / SCALE,
      reservedUsd: this.reserved / SCALE, reason: this.stopped };
  }

  stop(reason: string): never {
    this.stopped ??= reason;
    try { this.emit("stopped"); } catch { /* latch stays closed even if disk fails */ }
    const error = new LLMBudgetError("unavailable");
    error.message = `EVAL_STOP: ${this.stopped}`;
    throw error;
  }

  beforeRequest = async (): Promise<void> => {
    if (this.stopped) this.stop(this.stopped);
    if (this.reserved !== 0) this.stop("unsettled or concurrent request");
    if (this.attempts >= this.maxRequests) this.stop("request cap");
    if (this.spent + RESERVATION > this.limit) this.stop("cost reservation cap");
    this.attempts += 1;
    this.reserved = RESERVATION;
    try { this.emit("reserved"); } catch { this.stop("request record failed before send"); }
  };

  onComplete = async (metadata: LLMUsageMetadata): Promise<void> => {
    // Unknown or failed requests keep their reservation; never invent zero cost.
    const cost = metadata.costUsd;
    const known = typeof cost === "number" && Number.isFinite(cost) && cost >= 0;
    if (this.reserved === 0) this.stop("unexpected or duplicate completion");
    if (known) {
      const units = Math.ceil(cost * SCALE);
      if (!Number.isSafeInteger(units)) this.stop("invalid cost units");
      this.spent += units;
      if (units > this.reserved) this.stopped = "actual cost exceeded reservation";
      this.reserved = 0;
    }
    try { this.emit("completed", metadata); } catch { this.stop("response record failed"); }
    const validUsage = metadata.usage && [metadata.usage.prompt_tokens,
      metadata.usage.completion_tokens, metadata.usage.total_tokens].every(
      (value) => Number.isSafeInteger(value) && value >= 0);
    if (!validUsage || (metadata.usage?.prompt_tokens ?? 0) > 200000 ||
        (metadata.usage?.completion_tokens ?? 0) > 2048) this.stop("missing or out-of-bound token usage");
    if (!metadata.success || metadata.retryCount !== 0 || !known) {
      this.stop(!known ? "unknown cost" : "provider failure or unexpected retry");
    }
    if (this.stopped) this.stop(this.stopped);
  };

  private emit(kind: EvalBudgetEvent["kind"], metadata?: LLMUsageMetadata) {
    this.persist({ kind, context: this.context, ...this.snapshot, metadata });
  }
}
