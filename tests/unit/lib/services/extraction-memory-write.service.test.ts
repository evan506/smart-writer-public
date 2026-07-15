import { describe, expect, it, vi } from "vitest";
import {
  insertDistilledProposals,
  removeExcludedTerm,
} from "@/lib/services/extraction-memory/write.service";
import type { PreparedRule } from "@/lib/services/extraction-memory/distillation";

describe("insertDistilledProposals", () => {
  it("no-ops on an empty rule list", async () => {
    const supabase = { from: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertDistilledProposals(supabase as any, "p1", []);
    expect(result).toEqual({ inserted: 0, error: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("maps rules to inserts and reports inserted count", async () => {
    const upsert = vi.fn(() => ({
      select: vi.fn(() =>
        Promise.resolve({ data: [{ id: "1" }], error: null })
      ),
    }));
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const rules: PreparedRule[] = [
      {
        key: "k1",
        text: "회상 중복 제외",
        kind: "EXCLUDE_PATTERN",
        source: "DISTILLED",
        status: "DISABLED",
        evidence: ["무명 병사"],
      },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertDistilledProposals(supabase as any, "p1", rules);
    expect(result).toEqual({ inserted: 1, error: null });
    const [inserts, options] = upsert.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      Record<string, unknown>,
    ];
    expect(inserts[0]).toMatchObject({
      project_id: "p1",
      kind: "EXCLUDE_PATTERN",
      rule_key: "k1",
      status: "DISABLED",
      evidence: { dismissed: ["무명 병사"] },
    });
    expect(options).toMatchObject({
      onConflict: "project_id,kind,rule_key",
      ignoreDuplicates: true,
    });
  });
});

describe("removeExcludedTerm", () => {
  function mockProjects(excluded: unknown, captureUpdate: (v: unknown) => void) {
    const updateChain = {
      eq: vi.fn(() => Promise.resolve({ error: null })),
    };
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { excluded_terms: excluded },
                error: null,
              })
            ),
          })),
        })),
        update: vi.fn((payload: { excluded_terms: unknown }) => {
          captureUpdate(payload.excluded_terms);
          return updateChain;
        }),
      })),
    };
  }

  it("removes the matching name from the list", async () => {
    let updated: unknown = null;
    const supabase = mockProjects(["무명 병사", "지나가던 상인"], (v) => {
      updated = v;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await removeExcludedTerm(supabase as any, "p1", "무명 병사");
    expect(result.error).toBeNull();
    expect(updated).toEqual(["지나가던 상인"]);
  });

  it("is a no-op when the name is not in the list", async () => {
    const updateSpy = vi.fn();
    const supabase = mockProjects(["다른 이름"], updateSpy);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await removeExcludedTerm(supabase as any, "p1", "무명 병사");
    expect(result.error).toBeNull();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
