import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChapterSafely, CHAPTER_CREATE_ERROR, type CreateChapterInput } from "@/lib/services/chapter-create";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
const owner = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/ownership", () => ({ requireProjectOwner: owner }));
const input: CreateChapterInput = { projectId: "11111111-1111-4111-8111-111111111111", requestId: "22222222-2222-4222-8222-222222222222", title: null };
const row = { id: input.requestId, project_id: input.projectId, chapter_num: 7, title: "원본 제목" };
const ok = (data: unknown = null) => ({ data, error: null });
const conflict = { data: null, error: { code: "23505", message: "unique index" } };

function clientFor(responses: unknown[]) {
  const insert = vi.fn();
  const eq = vi.fn();
  const client = {
    from: vi.fn(() => {
      const response = responses.shift();
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((...args: unknown[]) => { eq(...args); return query; }),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        insert: vi.fn((value: unknown) => { insert(value); return query; }),
        maybeSingle: vi.fn(async () => response),
        single: vi.fn(async () => response),
      };
      return query;
    }),
  };
  return { client: client as unknown as SupabaseClient<Database>, from: client.from, insert, eq };
}

describe("safe chapter allocation", () => {
  beforeEach(() => { vi.clearAllMocks(); owner.mockResolvedValue({ ok: true, userId: "owner" }); });
  it("returns an existing request scoped to the project without writing", async () => {
    const db = clientFor([ok(row)]);
    expect(await createChapterSafely(db.client, input)).toEqual({ error: null, id: row.id, chapter: row });
    expect(db.eq.mock.calls).toEqual([["project_id", input.projectId], ["id", input.requestId]]);
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("reallocates the next number after a unique race and returns actual stored fields", async () => {
    const db = clientFor([ok(), ok({ chapter_num: 5 }), conflict, ok(), ok({ chapter_num: 6 }), ok(row)]);
    expect(await createChapterSafely(db.client, input)).toEqual({ error: null, id: row.id, chapter: row });
    expect(db.insert.mock.calls.map(([value]) => value.chapter_num)).toEqual([6, 7]);
    expect(db.insert.mock.calls.every(([value]) => value.id === input.requestId)).toBe(true);
  });
  it("recovers a concurrent duplicate of its own request", async () => {
    const db = clientFor([ok(), ok({ chapter_num: 6 }), conflict, ok(row)]);
    expect((await createChapterSafely(db.client, input)).chapter).toEqual(row);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
  it("bounds sustained contention with a friendly retry message", async () => {
    const db = clientFor([ok(), ...Array.from({ length: 8 }, () => [ok(), conflict, ok()]).flat()]);
    const result = await createChapterSafely(db.client, input);
    expect(result.error).toContain("잠시 후");
    expect(result.error).not.toContain("unique");
    expect(db.insert).toHaveBeenCalledTimes(8);
  });
  it("does not retry non-unique write failures", async () => {
    const db = clientFor([ok(), ok(), { data: null, error: { code: "42501" } }]);
    expect((await createChapterSafely(db.client, input)).error).toBe(CHAPTER_CREATE_ERROR);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
  it("rejects ownership before reading chapters", async () => {
    owner.mockResolvedValue({ ok: false, error: "권한 없음" });
    const db = clientFor([]);
    expect((await createChapterSafely(db.client, input)).error).toBe("권한 없음");
    expect(db.from).not.toHaveBeenCalled();
  });
  it.each([{ projectId: "bad" }, { requestId: "bad" }, { title: "가".repeat(501) }])("validates input before database or ownership access: %j", async (invalid) => {
    const db = clientFor([]);
    expect((await createChapterSafely(db.client, { ...input, ...invalid })).error).toContain("올바르지");
    expect(owner).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });
});
