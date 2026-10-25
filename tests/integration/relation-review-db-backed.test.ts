import { describe, expect, it } from "vitest";
import { confirmRelationSuggestion, confirmRelationSuggestionBatch } from "@/lib/services/suggestions/relation.service";
import { createLocalOwnerClient, getLocalSupabaseEnv } from "./helpers/local-supabase";

const env = getLocalSupabaseEnv();
describe.skipIf(!env.enabled)("relation review with approved aliases (local DB)", () => {
  it("confirms approved aliases and preserves ambiguous candidates without canon writes", async () => {
    if (!env.enabled) throw new Error(env.reason);
    const owner = await createLocalOwnerClient(env);
    let projectId: string | undefined;
    try {
      const project = await owner.client.from("projects").insert({ user_id: owner.userId, title: "관계 별칭 검증" }).select("id").single();
      if (project.error) throw project.error;
      projectId = project.data.id;
      const chapter = await owner.client.from("chapters").insert({ project_id: projectId, chapter_num: 1, title: "별칭", content: "검은 늑대가 성문을 지킨다." }).select("id").single();
      if (chapter.error) throw chapter.error;
      const entities = await owner.client.from("entities").insert([
        { project_id: projectId, name: "세란", type: "CHARACTER", aliases: ["검은 늑대"] },
        { project_id: projectId, name: "성 문", type: "PLACE", aliases: [] },
      ]).select("id,name");
      if (entities.error) throw entities.error;
      const meta = { from_name: "검은늑대", to_name: "성문", relation_type: "PROTECTS", direction: "UNI", weight: 0.9 };
      const candidate = await owner.client.from("entity_suggestions").insert({
        project_id: projectId, chapter_id: chapter.data.id, name: "검은늑대 → 성문", type: "RELATION", status: "PENDING", aliases: meta,
      }).select("id,aliases").single();
      if (candidate.error) throw candidate.error;
      await expect(confirmRelationSuggestion(owner.client, candidate.data, projectId)).resolves.toEqual({ error: null });
      await expect(confirmRelationSuggestionBatch(owner.client, [candidate.data], projectId)).resolves.toEqual({ error: null, confirmed: 1 });
      const links = await owner.client.from("entity_links").select("from_id,to_id").in("from_id", entities.data.map((entity) => entity.id));
      expect(links.error).toBeNull();
      expect(links.data).toEqual([{ from_id: entities.data.find((entity) => entity.name === "세란")!.id, to_id: entities.data.find((entity) => entity.name === "성 문")!.id }]);

      const duplicate = await owner.client.from("entities").insert({ project_id: projectId, name: "다른 인물", type: "CHARACTER", aliases: ["검은늑대"] });
      if (duplicate.error) throw duplicate.error;
      const ambiguous = await owner.client.from("entity_suggestions").insert({
        project_id: projectId, chapter_id: chapter.data.id, name: "모호한 관계 후보", type: "RELATION", status: "PENDING", aliases: meta,
      }).select("id,aliases").single();
      if (ambiguous.error) throw ambiguous.error;
      const canonBefore = await owner.client.from("entities").select("*").eq("project_id", projectId).order("id");
      expect(canonBefore.error).toBeNull();
      const single = await confirmRelationSuggestion(owner.client, ambiguous.data, projectId);
      expect(single.error).toBeTruthy();
      await expect(confirmRelationSuggestionBatch(owner.client, [ambiguous.data], projectId)).resolves.toEqual({ error: null, confirmed: 0 });
      const pending = await owner.client.from("entity_suggestions").select("status").eq("id", ambiguous.data.id).single();
      expect(pending.error).toBeNull();
      expect(pending.data?.status).toBe("PENDING");
      const canonAfter = await owner.client.from("entities").select("*").eq("project_id", projectId).order("id");
      expect(canonAfter.error).toBeNull();
      expect(canonAfter.data).toEqual(canonBefore.data);
      const linksAfter = await owner.client.from("entity_links").select("from_id,to_id").in("from_id", entities.data.map((entity) => entity.id));
      expect(linksAfter.error).toBeNull();
      expect(linksAfter.data).toEqual(links.data);
    } finally {
      if (projectId) {
        const cleanup = await env.service.from("projects").delete().eq("id", projectId);
        if (cleanup.error) throw cleanup.error;
      }
      const cleanup = await env.service.auth.admin.deleteUser(owner.userId);
      if (cleanup.error) throw cleanup.error;
    }
  });
});
