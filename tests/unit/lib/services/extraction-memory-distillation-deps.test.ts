import { describe, expect, it } from "vitest";
import { createDistillationDeps } from "@/lib/services/extraction-memory/distillation.service";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

// This file covers only the DB-backed deps returned by createDistillationDeps
// (loadRecentDismissedNames / loadApprovedEntityNames / loadExistingRuleKeys).
// proposeRules calls the real LLM via callLLM and is intentionally NOT
// exercised here — see extraction-memory-distillation.service.test.ts for
// runExtractionDistillation()/parseDistillationResponse() coverage using an
// injected fake DistillationDeps.

const projectId = "project-1";

describe("createDistillationDeps", () => {
  it("exposes proposeRules as a function without invoking it", () => {
    const { client } = createSupabaseMock({});
    const deps = createDistillationDeps(client as never);

    expect(typeof deps.proposeRules).toBe("function");
  });

  describe("loadRecentDismissedNames", () => {
    it("filters status=DISMISSED, excludes type=RELATION, orders desc, and limits", async () => {
      const { client, calls } = createSupabaseMock({
        entity_suggestions: [
          { data: [{ name: "이름1" }, { name: "이름2" }], error: null },
        ],
      });
      const deps = createDistillationDeps(client as never);

      const names = await deps.loadRecentDismissedNames(projectId, 40);

      expect(names).toEqual(["이름1", "이름2"]);
      const call = calls.find((c) => c.table === "entity_suggestions");
      expect(call).toBeDefined();
      expect(call!.operation).toBe("select");
      expect(call!.filters).toEqual(
        expect.arrayContaining([
          { method: "eq", args: ["project_id", projectId] },
          { method: "eq", args: ["status", "DISMISSED"] },
          { method: "neq", args: ["type", "RELATION"] },
          { method: "order", args: ["updated_at", { ascending: false }] },
          { method: "limit", args: [40] },
        ])
      );
    });

    it("returns an empty array when the query returns no rows", async () => {
      const { client } = createSupabaseMock({
        entity_suggestions: [{ data: null, error: null }],
      });
      const deps = createDistillationDeps(client as never);

      const names = await deps.loadRecentDismissedNames(projectId, 40);

      expect(names).toEqual([]);
    });
  });

  describe("loadApprovedEntityNames", () => {
    it("returns entity names scoped to the project", async () => {
      const { client, calls } = createSupabaseMock({
        entities: [{ data: [{ name: "카이" }, { name: "리엔" }], error: null }],
      });
      const deps = createDistillationDeps(client as never);

      const names = await deps.loadApprovedEntityNames(projectId);

      expect(names).toEqual(["카이", "리엔"]);
      const call = calls.find((c) => c.table === "entities");
      expect(call!.filters).toEqual(
        expect.arrayContaining([
          { method: "eq", args: ["project_id", projectId] },
        ])
      );
    });

    it("returns an empty array when the query returns no rows", async () => {
      const { client } = createSupabaseMock({
        entities: [{ data: null, error: null }],
      });
      const deps = createDistillationDeps(client as never);

      const names = await deps.loadApprovedEntityNames(projectId);

      expect(names).toEqual([]);
    });
  });

  describe("loadExistingRuleKeys", () => {
    it("returns a Set of rule_key filtered to kind=EXCLUDE_PATTERN", async () => {
      const { client, calls } = createSupabaseMock({
        extraction_memory: [
          {
            data: [{ rule_key: "flashback" }, { rule_key: "unnamed_extra" }],
            error: null,
          },
        ],
      });
      const deps = createDistillationDeps(client as never);

      const keys = await deps.loadExistingRuleKeys(projectId);

      expect(keys).toEqual(new Set(["flashback", "unnamed_extra"]));
      const call = calls.find((c) => c.table === "extraction_memory");
      expect(call!.filters).toEqual(
        expect.arrayContaining([
          { method: "eq", args: ["project_id", projectId] },
          { method: "eq", args: ["kind", "EXCLUDE_PATTERN"] },
        ])
      );
    });

    it("returns an empty Set when the query returns no rows", async () => {
      const { client } = createSupabaseMock({
        extraction_memory: [{ data: null, error: null }],
      });
      const deps = createDistillationDeps(client as never);

      const keys = await deps.loadExistingRuleKeys(projectId);

      expect(keys).toEqual(new Set());
    });
  });
});
