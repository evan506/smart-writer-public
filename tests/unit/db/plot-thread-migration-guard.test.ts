import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLOT_THREAD_ROW_KINDS } from "@/lib/planning/plot-thread-constants";

// Docker-free, CI-runnable guard. `pnpm db:replay-verify` (which actually
// exercises the trigger) needs Docker and does not run in CI, so this test
// statically pins the DB-level allowlist to the TS allowlist, proves the
// remote-safe verify companion is mutation-free, and proves the behavioral
// rejection check lives in a local-only fixture run only by the replay runner.

const ROOT = process.cwd();
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260621120000_v3_3_plot_threads.sql"
);
const VERIFY = join(
  ROOT,
  "supabase/migrations/companions/20260621120000_v3_3_plot_threads.verify.sql"
);
const FIXTURE = join(
  ROOT,
  "supabase/migrations/companions/20260621120000_v3_3_plot_threads.fixture.sql"
);
const RUNNER = join(ROOT, "scripts/db-replay-verify.sh");

const migrationSql = readFileSync(MIGRATION, "utf8");
const verifySql = readFileSync(VERIFY, "utf8");
const fixtureSql = readFileSync(FIXTURE, "utf8");
const runnerSh = readFileSync(RUNNER, "utf8");

describe("plot-thread DB trigger allowlist (migration guard)", () => {
  it("enforces the row-kind allowlist at the DB level via block_kind NOT IN (...)", () => {
    const match = migrationSql.match(/block_kind\s+NOT IN\s*\(([^)]*)\)/i);
    expect(match, "block_kind NOT IN (...) allowlist not found in trigger").toBeTruthy();
    const dbKinds = Array.from(match![1].matchAll(/'([A-Z_]+)'/g)).map((m) => m[1]);
    expect(new Set(dbKinds)).toEqual(new Set(PLOT_THREAD_ROW_KINDS));
  });

  it("does NOT allow ROOT, CHARACTER_PLAN, or PLACE_PLAN in the DB allowlist", () => {
    const match = migrationSql.match(/block_kind\s+NOT IN\s*\(([^)]*)\)/i);
    const dbKinds = Array.from(match![1].matchAll(/'([A-Z_]+)'/g)).map((m) => m[1]);
    for (const banned of ["ROOT", "CHARACTER_PLAN", "PLACE_PLAN"]) {
      expect(dbKinds).not.toContain(banned);
    }
  });

  it("raises SQLSTATE 23514 when a disallowed kind is linked", () => {
    expect(migrationSql).toMatch(/cannot be linked to a plot thread/);
    expect(migrationSql).toContain("ERRCODE = '23514'");
  });
});

describe("plot-thread verify companion (remote-safe, mutation-free)", () => {
  it("performs NO INSERT / UPDATE / DELETE (safe to run on the shared remote)", () => {
    // Strip comment lines, then assert no DML keyword remains.
    const code = verifySql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\bINSERT\b/i);
    expect(code).not.toMatch(/\bUPDATE\b/i);
    expect(code).not.toMatch(/\bDELETE\b/i);
  });

  it("checks the trigger function source encodes the allowlist + 23514", () => {
    expect(verifySql).toContain("pg_get_functiondef");
    expect(verifySql).toContain("EPISODE");
    expect(verifySql).toContain("PROMISE");
    expect(verifySql).toContain("23514");
  });

  it("does not use a schema heuristic to detect the environment", () => {
    expect(verifySql).not.toMatch(/auth\.users/i);
    expect(verifySql).not.toMatch(/information_schema/i);
  });
});

describe("plot-thread behavioral fixture (local-only)", () => {
  it("behaviorally rejects CHARACTER_PLAN and PLACE_PLAN with 23514 and accepts EPISODE", () => {
    expect(fixtureSql).toContain("CHARACTER_PLAN");
    expect(fixtureSql).toContain("PLACE_PLAN");
    expect(fixtureSql).toMatch(/check_violation/);
    expect(fixtureSql).toContain("EPISODE link was rejected"); // positive control
  });

  it("wraps its work in a transaction it rolls back (no residue)", () => {
    expect(fixtureSql).toMatch(/^\s*BEGIN;/m);
    expect(fixtureSql).toMatch(/^\s*ROLLBACK;/m);
  });

  it("is run only by the replay runner via the *.fixture.sql path", () => {
    expect(runnerSh).toContain("*.fixture.sql");
    // and the runner still runs verify companions separately
    expect(runnerSh).toContain("*.verify.sql");
  });
});
