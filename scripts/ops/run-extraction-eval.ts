/** Opt-in PAID, DB-write-free Stage1/2 eval. Never run as CI or an app request.
 * Requires explicit A-scope approval, frozen golden SHA, request and USD caps.
 * Private rich results/usage are isolated from historical rolling baselines.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../test-extraction/env";
import { runEval } from "../../src/lib/services/extraction-eval/runner";
import { writeRunReport } from "../../src/lib/services/extraction-eval/store";
import { normalizeName } from "../../src/lib/services/extraction-eval/scoring";
import type { GoldenScenario, EvalRun } from "../../src/lib/services/extraction-eval/types";
import { getLLMModel, getLLMProviderRouting, type LLMProviderRouting } from "../../src/lib/services/llm-models";
import { STAGE2_EVAL_PROFILE, STAGE2_EVAL_RESPONSE_FORMAT, STAGE2_COMPACT_EVAL_PROFILE, buildStage2CompactEvalPrompt, buildStage2EvalPrompt, type Stage2EvalProfile } from "../../src/lib/services/entity-extraction/stage2-eval-contract";
import { buildStage2ClassificationPrompt } from "../../src/lib/services/prompt-templates/entity-extraction-stages";
import { createEvalDiagnostics } from "./extraction-eval-diagnostics";
import { EvalRequestBudget } from "./extraction-eval-budget";

const REPORTS_DIR = path.resolve(__dirname, "../../eval-reports/extraction-bounded");
const MODEL = "anthropic/claude-haiku-4.5";

export function readEvalConfig(args: string[]) {
  const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (value("paid-approved") !== "A" || value("reconfirm") !== "0") {
    throw new Error("Require --paid-approved=A --reconfirm=0; no automatic reconfirmation");
  }
  const profileFlags = args.filter((arg) => arg.startsWith("--stage2-profile"));
  const stage2EvalProfile = value("stage2-profile");
  if (profileFlags.length && (profileFlags.length !== 1 || (stage2EvalProfile !== STAGE2_EVAL_PROFILE && stage2EvalProfile !== STAGE2_COMPACT_EVAL_PROFILE) ||
      profileFlags[0] !== `--stage2-profile=${stage2EvalProfile}`)) {
    throw new Error("Unsupported or ambiguous Stage2 evaluation profile");
  }
  const batchFlags = args.filter((arg) => arg.startsWith("--stage2-batch-size"));
  if (batchFlags.length && (batchFlags.length !== 1 || batchFlags[0] !== "--stage2-batch-size=5" ||
      stage2EvalProfile !== STAGE2_EVAL_PROFILE)) {
    throw new Error("Stage2 batch size requires one explicit size 5 and the evaluation profile");
  }
  if (value("guidance")) throw new Error("Prompt changes are outside this baseline run");
  const goldenFile = value("golden");
  const expectedSha = value("golden-sha256");
  if (!goldenFile || !expectedSha || !/^[a-f0-9]{64}$/.test(expectedSha)) {
    throw new Error("Explicit frozen golden file and SHA256 required");
  }
  const raw = fs.readFileSync(goldenFile);
  const sha = createHash("sha256").update(raw).digest("hex");
  if (sha !== expectedSha) throw new Error("Golden SHA256 mismatch");
  const scenarios: unknown = JSON.parse(raw.toString("utf8"));
  if (!Array.isArray(scenarios) || scenarios.length !== 8) throw new Error("A requires exactly M01–M08");
  const ids = new Set<string>();
  for (const row of scenarios) {
    if (!row || typeof row !== "object" || !/^M0[1-8]$/.test(row.id) || ids.has(row.id) ||
        typeof row.source !== "string" || !row.source.trim() ||
        typeof row.chapterText !== "string" || !row.chapterText.trim() ||
        !Array.isArray(row.shouldExtract) || !Array.isArray(row.shouldNotExtract) ||
        ![...row.shouldExtract, ...row.shouldNotExtract].every((n) => typeof n === "string" && n.trim())) {
      throw new Error("Malformed, duplicate or out-of-scope golden scenario");
    }
    ids.add(row.id);
    const good = new Set(row.shouldExtract.map(normalizeName));
    if (row.shouldNotExtract.some((n: string) => good.has(normalizeName(n)))) {
      throw new Error("Conflicting golden labels");
    }
  }
  const maxRequests = Number(value("max-requests"));
  const budgetUsd = Number(value("budget-usd"));
  // Constructor validates numeric limits before any provider call.
  new EvalRequestBudget(maxRequests, budgetUsd, () => {});
  if (value("providers") !== "anthropic") throw new Error("Only reviewed Anthropic endpoint permitted");
  return { scenarios: scenarios as GoldenScenario[], goldenFile, sha, maxRequests, budgetUsd,
    ...(stage2EvalProfile ? { stage2EvalProfile: stage2EvalProfile as Stage2EvalProfile } : {}),
    ...(batchFlags.length ? { stage2EvalBatchSize: 5 as const } : {}) };
}

export function evalStage2ProfileManifest(profile: Stage2EvalProfile | undefined, provider: LLMProviderRouting, batchSize: 5 | 10 = 10) {
  if (profile !== undefined && profile !== STAGE2_EVAL_PROFILE && profile !== STAGE2_COMPACT_EVAL_PROFILE) {
    throw new Error("Unsupported Stage2 evaluation profile");
  }
  if (batchSize === 5 && profile !== STAGE2_EVAL_PROFILE) {
    throw new Error("Stage2 batch size requires the explicit evaluation profile and size 5");
  }
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const strict = profile === STAGE2_EVAL_PROFILE;
  const buildPrompt = strict ? buildStage2EvalPrompt : profile === STAGE2_COMPACT_EVAL_PROFILE
    ? buildStage2CompactEvalPrompt : buildStage2ClassificationPrompt;
  return { profile: profile ?? "product-default", batchSize,
    promptVersion: strict ? STAGE2_EVAL_PROFILE : profile === STAGE2_COMPACT_EVAL_PROFILE ? "v3" : "v1",
    contextMode: profile ? "wide-shared-or-inline" : "narrow-inline",
    promptProfileSha256: hash(buildPrompt("", "(없음)")),
    provider: strict ? { ...provider, require_parameters: true } : { ...provider },
    ...(strict ? { responseFormat: STAGE2_EVAL_RESPONSE_FORMAT, schemaSha256: hash(STAGE2_EVAL_RESPONSE_FORMAT) } : {}) };
}

export function evalCompletionStatus(run: EvalRun | undefined, stopped?: string) {
  return !stopped && run?.status === "completed" ? "completed" : "aborted";
}

export async function classifyEvalCandidates<T>(candidates: string[], classify: () => Promise<T[]>,
  stop: (reason: string) => never): Promise<T[]> {
  if (candidates.length > 20) stop("candidate count exceeds 20");
  return candidates.length ? classify() : [];
}

async function main() {
  const config = readEvalConfig(process.argv.slice(2));
  loadLocalEnv();
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY unavailable");
  if (getLLMModel("extraction") !== MODEL) throw new Error("Approved extraction model mismatch");
  const defaults = getLLMProviderRouting();
  if (defaults?.ignore?.includes("anthropic") ||
      (defaults?.order?.length && !defaults.order.includes("anthropic"))) {
    throw new Error("Approved provider conflicts with existing routing restrictions");
  }
  const provider = { ...defaults, only: ["anthropic"], order: ["anthropic"],
    allow_fallbacks: false, max_price: { prompt: 1, completion: 5, request: 0 } };
  const startedAt = new Date().toISOString();
  const runId = `${Date.now()}-A`;
  const runDir = path.join(REPORTS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const save = (name: string, data: unknown) => fs.writeFileSync(path.join(runDir, name),
    JSON.stringify(data, null, 2), { mode: 0o600 });
  const budget = new EvalRequestBudget(config.maxRequests, config.budgetUsd, (event) => {
    fs.appendFileSync(path.join(runDir, "requests.jsonl"), `${JSON.stringify(event)}\n`, { mode: 0o600 });
  });
  save("manifest.json", { ...config, scenarios: config.scenarios.map(({ id, source }) => ({ id, source })),
    model: MODEL, provider, startedAt, codeSha: execSync("git rev-parse HEAD").toString().trim(),
    labelStatus: "SOURCE_REVIEWED_PROVISIONAL_NOT_HUMAN_GOLD", baselineEligible: false,
    reservationUsd: 0.41024, automaticRetries: 0, automaticReconfirm: 0,
    stage2Experiment: evalStage2ProfileManifest(config.stage2EvalProfile, provider, config.stage2EvalBatchSize) });
  const { callLLM } = await import("../../src/lib/services/llm.service");
  const { stage1ExtractNouns, stage2Classify } = await import(
    "../../src/lib/services/entity-extraction/stage-llm-wrappers");
  const opts = { onComplete: budget.onComplete, beforeRequest: budget.beforeRequest,
    maxRetries: 0, providerRouting: provider, stage2Concurrency: 1 };
  const diagnostics = (context: string) => createEvalDiagnostics(context, budget.onComplete, save,
    (reason) => budget.stop(reason));
  let run: EvalRun | undefined;
  let current = 0;
  try {
    await callLLM({ system: "Reply with OK.", user: "OK", maxTokens: 5,
      model: MODEL, maxRetries: 0, provider,
      beforeRequest: budget.beforeRequest, ...diagnostics("preflight") });
    run = await runEval({ scenarios: config.scenarios, tier: "smoke", runId, startedAt,
      shouldStop: () => budget.reason, stopOnFailure: true,
      extract: async (text) => {
        const id = config.scenarios[current++].id;
        budget.setContext(`${id}:stage1`);
        const candidates = await stage1ExtractNouns(text, [], { ...opts, ...diagnostics(`${id}-stage1`) });
        try { save(`${id}-nouns.json`, candidates); } catch { budget.stop("nouns record failed"); }
        budget.setContext(`${id}:stage2`);
        const classified = await classifyEvalCandidates(candidates,
          () => stage2Classify(candidates, text, [], { ...opts,
            ...(config.stage2EvalProfile ? { stage2EvalProfile: config.stage2EvalProfile } : {}),
            ...(config.stage2EvalBatchSize ? { stage2EvalBatchSize: config.stage2EvalBatchSize } : {}),
            ...diagnostics(`${id}-stage2`) }), (reason) => budget.stop(reason));
        try { save(`${id}-classified.json`, classified); } catch { budget.stop("rich result record failed"); }
        return { names: classified.map((entity) => entity.name) };
      },
    });
    // This directory is never read by the historical baseline loader.
    writeRunReport(runDir, run);
    if (run.status === "aborted") process.exitCode = 2;
  } catch (error) {
    try { budget.stop(error instanceof Error ? error.message : "eval failed"); } catch { /* latch */ }
    process.exitCode = 2;
  } finally {
    save("summary.json", { status: evalCompletionStatus(run, budget.reason), ...budget.snapshot, reason: run?.stopReason ?? budget.reason,
      unexecutedScenarioIds: run?.unexecutedScenarioIds ?? config.scenarios.map((s) => s.id),
      aggregate: run?.aggregate, baselineEligible: false });
    console.log(JSON.stringify({ directory: runDir, ...budget.snapshot, status: evalCompletionStatus(run, budget.reason) }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    // Never print provider request bodies or secrets.
    console.error(error instanceof Error ? error.message : "eval failed");
    process.exitCode = 1;
  });
}
