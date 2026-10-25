import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EvalRun } from "@/lib/services/extraction-eval/types";
import { afterEach, it, expect, vi } from "vitest";
import { classifyEvalCandidates, readEvalConfig, evalCompletionStatus, evalStage2ProfileManifest } from "../../../../scripts/ops/run-extraction-eval";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-eval-config-")); directories.push(dir);
  const file = path.join(dir, "golden.json");
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: `M0${i + 1}`, source: "test", chapterText: "원문",
    shouldExtract: ["세란"], shouldNotExtract: [] }));
  fs.writeFileSync(file, JSON.stringify(rows));
  const sha = () => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const args = () => ["--paid-approved=A", "--reconfirm=0", "--max-requests=25", "--budget-usd=1",
    "--providers=anthropic", `--golden=${file}`, `--golden-sha256=${sha()}`];
  return { rows, file, args };
}

it("requires explicit scope and frozen SHA before any paid work", () => {
  expect(() => readEvalConfig([])).toThrow();
  const f = fixture(); expect(readEvalConfig(f.args()).scenarios).toHaveLength(8);
  const args = f.args(); fs.appendFileSync(f.file, " ");
  expect(() => readEvalConfig(args)).toThrow("SHA256 mismatch");
});

it("does not fall back to starter fixtures on missing or malformed golden", () => {
  const f = fixture(), args = f.args(); fs.rmSync(f.file);
  expect(() => readEvalConfig(args)).toThrow();
  fs.writeFileSync(f.file, "{}"); expect(() => readEvalConfig(f.args())).toThrow("exactly");
});

it("rejects conflicting or heldout labels and automatic reconfirmation", () => {
  const f = fixture(); f.rows[0].shouldNotExtract = ["세란"] as never;
  fs.writeFileSync(f.file, JSON.stringify(f.rows)); expect(() => readEvalConfig(f.args())).toThrow("Conflicting");
  f.rows[0].id = "G01"; fs.writeFileSync(f.file, JSON.stringify(f.rows));
  expect(() => readEvalConfig(f.args())).toThrow("out-of-scope");
  expect(() => readEvalConfig(f.args().map((a) => a === "--reconfirm=0" ? "--reconfirm=3" : a))).toThrow();
});

it.each([0, 20, 21])("candidate boundary %i never silently truncates", async (count) => {
  const classify = vi.fn().mockResolvedValue(["result"]);
  const stop = (reason: string): never => { throw new Error(reason); };
  const call = classifyEvalCandidates(Array.from({ length: count }, () => "name"), classify, stop);
  if (count === 21) { await expect(call).rejects.toThrow("exceeds 20"); expect(classify).not.toHaveBeenCalled(); }
  else { await expect(call).resolves.toEqual(count ? ["result"] : []); expect(classify).toHaveBeenCalledTimes(count ? 1 : 0); }
});

it("report persistence errors override a completed model run", () => {
  const run = { status: "completed" } as EvalRun;
  expect(evalCompletionStatus(run)).toBe("completed");
  expect(evalCompletionStatus(run, "response record failed")).toBe("aborted");
});

it("keeps the default profile and requires one exact explicit structured profile", () => {
  const f = fixture();
  expect(readEvalConfig(f.args())).not.toHaveProperty("stage2EvalProfile");
  expect(readEvalConfig([...f.args(), "--stage2-profile=stage2-schema-evidence-v1"]).stage2EvalProfile)
    .toBe("stage2-schema-evidence-v1");
  for (const flags of [["--stage2-profile=unknown"], ["--stage2-profile"], ["--stage2-profile="],
    ["--stage2-profile=stage2-schema-evidence-v1", "--stage2-profile=stage2-schema-evidence-v1"]]) {
    expect(() => readEvalConfig([...f.args(), ...flags])).toThrow("profile");
  }
});


it("records the explicit schema and prompt hashes without changing provider controls", () => {
  const provider = { only: ["anthropic"], allow_fallbacks: false };
  expect(evalStage2ProfileManifest(undefined, provider)).toMatchObject({ profile: "product-default", promptVersion: "v1", contextMode: "narrow-inline" });
  const manifest = evalStage2ProfileManifest("stage2-schema-evidence-v1", provider)!;
  expect(manifest.schemaSha256).toBe(createHash("sha256").update(JSON.stringify(manifest.responseFormat)).digest("hex"));
  expect(manifest.promptProfileSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.provider).toEqual({ ...provider, require_parameters: true });
  expect(provider).not.toHaveProperty("require_parameters");
});

it("accepts batch size 5 only as one explicit option with the existing profile", () => {
  const f = fixture();
  const profile = "--stage2-profile=stage2-schema-evidence-v1";
  expect(readEvalConfig(f.args())).not.toHaveProperty("stage2EvalBatchSize");
  expect(readEvalConfig([...f.args(), profile])).not.toHaveProperty("stage2EvalBatchSize");
  expect(readEvalConfig([...f.args(), profile, "--stage2-batch-size=5"]).stage2EvalBatchSize).toBe(5);
  expect(() => readEvalConfig([...f.args(), "--stage2-batch-size=5"])).toThrow("batch size");
  for (const flags of [["--stage2-batch-size"], ["--stage2-batch-size="], ["--stage2-batch-size=0"],
    ["--stage2-batch-size=-1"], ["--stage2-batch-size=10"], ["--stage2-batch-size=50"],
    ["--stage2-batch-size=5", "--stage2-batch-size=5"], ["--stage2-batch-size-typo=5"]]) {
    expect(() => readEvalConfig([...f.args(), profile, ...flags])).toThrow("batch size");
  }
});

it("records effective batch size without changing schema or prompt hashes", () => {
  const provider = { only: ["anthropic"], allow_fallbacks: false };
  const original = evalStage2ProfileManifest("stage2-schema-evidence-v1", provider)!;
  const smaller = evalStage2ProfileManifest("stage2-schema-evidence-v1", provider, 5)!;
  expect(original.batchSize).toBe(10);
  expect(smaller).toEqual({ ...original, batchSize: 5 });
});

it("accepts compact explicitly without schema controls and rejects compact size 5", () => {
  const f = fixture(), profile = "--stage2-profile=stage2-compact-v3";
  expect(readEvalConfig([...f.args(), profile]).stage2EvalProfile).toBe("stage2-compact-v3");
  expect(() => readEvalConfig([...f.args(), profile, "--stage2-batch-size=5"])).toThrow("batch size");
  expect(() => readEvalConfig([...f.args(), profile, profile])).toThrow("profile");
  const provider = { only: ["anthropic"] };
  const compact = evalStage2ProfileManifest("stage2-compact-v3", provider);
  expect(compact).toMatchObject({ promptVersion: "v3", contextMode: "wide-shared-or-inline", batchSize: 10, provider });
  expect(compact).not.toHaveProperty("responseFormat");
  expect(compact).not.toHaveProperty("schemaSha256");
  expect(compact.provider).not.toHaveProperty("require_parameters");
  const product = evalStage2ProfileManifest(undefined, provider);
  expect(product).not.toHaveProperty("responseFormat");
  expect(product.promptProfileSha256).not.toBe(compact.promptProfileSha256);
});
