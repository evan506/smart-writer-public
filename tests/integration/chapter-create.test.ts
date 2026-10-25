import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChapterSafely } from "@/lib/services/chapter-create";
import { projectFactory } from "../factories/smart-writer";
import { createLocalOwnerClient, getLocalSupabaseEnv } from "./helpers/local-supabase";

const env = getLocalSupabaseEnv();
const runner = env.enabled ? describe : describe.skip;
type Owner = Awaited<ReturnType<typeof createLocalOwnerClient>>;

runner("chapter allocation against authenticated local Postgres", () => {
  const owners: Owner[] = [];
  const projects: string[] = [];
  let owner: Owner;
  let projectId: string;
  beforeEach(async () => {
    if (!env.enabled) return;
    owner = await createLocalOwnerClient(env);
    owners.push(owner);
    const result = await owner.client.from("projects").insert(projectFactory({ user_id: owner.userId })).select("id").single();
    if (result.error) throw result.error;
    projectId = result.data.id;
    projects.push(projectId);
  });
  afterEach(async () => {
    if (!env.enabled) return;
    for (const id of projects.splice(0)) {
      const { error } = await env.service.from("projects").delete().eq("id", id);
      expect(error).toBeNull();
    }
    for (const account of owners.splice(0)) {
      await account.client.auth.signOut();
      const { error } = await env.service.auth.admin.deleteUser(account.userId);
      expect(error).toBeNull();
    }
  });
  it("allocates distinct sequential numbers for six simultaneous creates", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      createChapterSafely(owner.client, { projectId, requestId: randomUUID(), title: null })));
    expect(results.map((r) => r.error)).toEqual(Array(6).fill(null));
    expect(results.map((r) => r.chapter?.chapter_num).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const rows = await owner.client.from("chapters").select("id").eq("project_id", projectId);
    expect(rows.data).toHaveLength(6);
  });
  it("coalesces concurrent and later retries with the same identity into one row", async () => {
    const requestId = randomUUID();
    const input = { projectId, requestId, title: "원래 제목" };
    const results = await Promise.all(Array.from({ length: 4 }, () => createChapterSafely(owner.client, input)));
    const retry = await createChapterSafely(owner.client, { ...input, title: "응답 유실 후 재시도" });
    expect([...results, retry].every((r) => r.error === null && r.id === requestId && r.chapter?.chapter_num === 1 && r.chapter.title === "원래 제목")).toBe(true);
    const rows = await owner.client.from("chapters").select("id").eq("project_id", projectId);
    expect(rows.data).toEqual([{ id: requestId }]);
  });
  it("rejects another authenticated owner without inserting a row", async () => {
    if (!env.enabled) return;
    const stranger = await createLocalOwnerClient(env);
    owners.push(stranger);
    const result = await createChapterSafely(stranger.client, { projectId, requestId: randomUUID(), title: null });
    expect(result.error).toContain("권한");
    const rows = await owner.client.from("chapters").select("id").eq("project_id", projectId);
    expect(rows.data).toEqual([]);
  });
});
