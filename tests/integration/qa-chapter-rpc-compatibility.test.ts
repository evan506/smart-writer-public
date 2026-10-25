import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SearchService } from "@/lib/services/search.service";
import { createLocalOwnerClient, getLocalSupabaseEnv } from "./helpers/local-supabase";

const env = getLocalSupabaseEnv();
const suite = env.enabled ? describe : describe.skip;

suite("QA chapter RPC compatibility through local PostgREST", () => {
  it("accepts old and new arguments while preserving ownership and rejecting invalid thresholds", async () => {
    if (!env.enabled) throw new Error("Local Supabase is required");
    const owner = await createLocalOwnerClient(env);
    let stranger: Awaited<ReturnType<typeof createLocalOwnerClient>> | undefined;
    const projectId = randomUUID();
    const chapterId = randomUUID();
    try {
      stranger = await createLocalOwnerClient(env);
      const project = await env.service.from("projects").insert({ id: projectId, user_id: owner.userId, title: "RPC compatibility fixture" });
      if (project.error) throw project.error;
      const chapter = await env.service.from("chapters").insert({ id: chapterId, project_id: projectId, chapter_num: 1, title: "붉은 성문", content: "붉은 성문 앞에서 경비병이 기다렸다." });
      if (chapter.error) throw chapter.error;

      const service = new SearchService(owner.client);
      const legacy = await service.searchChaptersBm25(projectId, "붉은 성문", 4);
      expect(legacy.map(row => row.id)).toContain(chapterId);
      expect(await service.searchChaptersBm25(projectId, "붉은 성문", 4, { wordSimilarityThreshold: 0.3 })).toEqual(legacy);
      expect((await service.searchChaptersBm25(projectId, "붉은 성문", 4, { wordSimilarityThreshold: 0.25 })).map(row => row.id)).toContain(chapterId);
      expect(await new SearchService(stranger.client).searchChaptersBm25(projectId, "붉은 성문", 4, { wordSimilarityThreshold: 0.25 })).toEqual([]);

      for (const threshold of [0.2, null]) {
        const response = await owner.client.rpc("search_chapters_bm25", {
          p_project_id: projectId, p_query: "붉은 성문", p_limit: 4,
          p_word_threshold: threshold as number,
        });
        expect(response.error?.code).toBe("22023");
      }
      const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const denied = await anon.rpc("search_chapters_bm25", { p_project_id: projectId, p_query: "붉은 성문", p_limit: 4 });
      expect(denied.error?.code).toBe("42501");
    } finally {
      await env.service.from("projects").delete().eq("id", projectId);
      await env.service.auth.admin.deleteUser(owner.userId);
      if (stranger) await env.service.auth.admin.deleteUser(stranger.userId);
    }
  });
});
