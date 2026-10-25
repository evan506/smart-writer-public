import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chapterFactory, entityFactory, projectFactory } from "../factories/smart-writer";
import {
  createLocalOwnerClient,
  getLocalSupabaseEnv,
  type LocalSupabaseEnv,
} from "./helpers/local-supabase";

type EnabledEnv = Extract<LocalSupabaseEnv, { enabled: true }>;
type Owner = Awaited<ReturnType<typeof createLocalOwnerClient>>;

const env = getLocalSupabaseEnv();
const runner = env.enabled ? describe : describe.skip;

runner("atomic Codex entity mutations", () => {
  const owners: Owner[] = [];
  const projectIds: string[] = [];
  let owner: Owner;

  beforeEach(async () => {
    if (!env.enabled) return;
    owner = await createLocalOwnerClient(env);
    owners.push(owner);
  });

  afterEach(async () => {
    if (!env.enabled) return;
    for (const projectId of projectIds.splice(0)) {
      await env.service.from("projects").delete().eq("id", projectId);
    }
    for (const account of owners.splice(0)) {
      await env.service.auth.admin.deleteUser(account.userId);
    }
  });

  async function seedProject(activeEnv: EnabledEnv, activeOwner: Owner) {
    const { data: project, error: projectError } = await activeOwner.client
      .from("projects")
      .insert(projectFactory({ user_id: activeOwner.userId }))
      .select("id")
      .single();
    if (projectError) throw projectError;
    projectIds.push(project.id);

    const { data: chapter, error: chapterError } = await activeOwner.client
      .from("chapters")
      .insert(chapterFactory(project.id))
      .select("id")
      .single();
    if (chapterError) throw chapterError;

    const { data: chunk, error: chunkError } = await activeOwner.client
      .from("chunks")
      .insert({ chapter_id: chapter.id, type: "SCENE", content: "리엔과 왕이 만났다." })
      .select("id")
      .single();
    if (chunkError) throw chunkError;

    const { data: entities, error: entityError } = await activeOwner.client
      .from("entities")
      .insert([
        entityFactory(project.id, "엘프왕", { aliases: ["왕"] }),
        entityFactory(project.id, "엘프들의 왕", { aliases: ["엘프 군주"] }),
        entityFactory(project.id, "왕궁", { type: "PLACE" }),
      ])
      .select("id, name");
    if (entityError) throw entityError;

    const byName = new Map(entities.map((entity) => [entity.name, entity.id]));
    return {
      projectId: project.id,
      chapterId: chapter.id,
      chunkId: chunk.id,
      sourceId: byName.get("엘프왕")!,
      targetId: byName.get("엘프들의 왕")!,
      otherId: byName.get("왕궁")!,
    };
  }

  it("moves all dependent data and reconciles duplicate links and facts", async () => {
    if (!env.enabled) throw new Error("integration env unavailable");
    const seeded = await seedProject(env, owner);

    const { error: seedError } = await owner.client.from("mentions").insert([
      { chunk_id: seeded.chunkId, entity_id: seeded.sourceId, count: 2 },
      { chunk_id: seeded.chunkId, entity_id: seeded.targetId, count: 3 },
    ]);
    if (seedError) throw seedError;

    const { error: linkError } = await owner.client.from("entity_links").insert([
      {
        from_id: seeded.sourceId,
        to_id: seeded.otherId,
        relation_type: "LOCATED_IN",
        direction: "UNI",
        weight: 0.9,
      },
      {
        from_id: seeded.targetId,
        to_id: seeded.otherId,
        relation_type: "LOCATED_IN",
        direction: "BI",
        weight: 0.5,
      },
    ]);
    if (linkError) throw linkError;

    const { error: suggestionError } = await owner.client
      .from("entity_suggestions")
      .insert({
        project_id: seeded.projectId,
        chapter_id: seeded.chapterId,
        name: "엘프왕 후보",
        type: "CHARACTER",
        matched_entity_id: seeded.sourceId,
      });
    if (suggestionError) throw suggestionError;

    const { data: facts, error: factError } = await owner.client
      .from("canon_facts")
      .insert([
        {
          project_id: seeded.projectId,
          entity_id: seeded.sourceId,
          fact_type: "ROLE",
          fact_key: "title",
          value: "왕",
          status: "APPROVED",
        },
        {
          project_id: seeded.projectId,
          entity_id: seeded.targetId,
          fact_type: "ROLE",
          fact_key: "title",
          value: "왕",
          status: "APPROVED",
        },
        {
          project_id: seeded.projectId,
          entity_id: seeded.sourceId,
          fact_type: "ATTRIBUTE",
          fact_key: "race",
          value: "엘프",
          status: "APPROVED",
        },
      ])
      .select("id, entity_id, fact_type");
    if (factError) throw factError;
    const sourceDuplicate = facts.find(
      (fact) => fact.entity_id === seeded.sourceId && fact.fact_type === "ROLE"
    )!;
    const targetDuplicate = facts.find(
      (fact) => fact.entity_id === seeded.targetId && fact.fact_type === "ROLE"
    )!;

    const { error: sourceError } = await owner.client.from("canon_fact_sources").insert({
      fact_id: sourceDuplicate.id,
      chapter_id: seeded.chapterId,
      evidence_text: "왕이라는 근거",
    });
    if (sourceError) throw sourceError;

    const { error: foreshadowError } = await owner.client.from("foreshadows").insert({
      project_id: seeded.projectId,
      planted_chapter: 1,
      entity_ids: [seeded.sourceId, seeded.targetId, seeded.otherId],
    });
    if (foreshadowError) throw foreshadowError;

    const { data, error } = await owner.client.rpc("merge_codex_entity_as_alias", {
      p_project_id: seeded.projectId,
      p_source_entity_id: seeded.sourceId,
      p_target_entity_id: seeded.targetId,
    });

    expect(error).toBeNull();
    expect(data?.[0]).toEqual(
      expect.objectContaining({ source_name: "엘프왕", target_name: "엘프들의 왕" })
    );

    const [entityResult, mentionResult, linkResult, factResult, factSourceResult, foreshadowResult] =
      await Promise.all([
        owner.client.from("entities").select("id, aliases").eq("id", seeded.targetId).single(),
        owner.client.from("mentions").select("entity_id, count").eq("chunk_id", seeded.chunkId),
        owner.client.from("entity_links").select("from_id, to_id, weight, direction"),
        owner.client.from("canon_facts").select("id, entity_id").eq("project_id", seeded.projectId),
        owner.client.from("canon_fact_sources").select("fact_id, evidence_text"),
        owner.client.from("foreshadows").select("entity_ids").eq("project_id", seeded.projectId).single(),
      ]);

    expect(entityResult.data?.aliases).toEqual(["엘프 군주", "엘프왕", "왕"]);
    expect(mentionResult.data).toEqual([{ entity_id: seeded.targetId, count: 5 }]);
    expect(linkResult.data).toEqual([
      { from_id: seeded.targetId, to_id: seeded.otherId, weight: 0.9, direction: "BI" },
    ]);
    expect(factResult.data).toHaveLength(2);
    expect(factResult.data?.every((fact) => fact.entity_id === seeded.targetId)).toBe(true);
    expect(factSourceResult.data).toContainEqual({
      fact_id: targetDuplicate.id,
      evidence_text: "왕이라는 근거",
    });
    expect(foreshadowResult.data?.entity_ids).toEqual([seeded.targetId, seeded.otherId]);
  });

  it("rejects another user without changing either entity", async () => {
    if (!env.enabled) throw new Error("integration env unavailable");
    const seeded = await seedProject(env, owner);
    const stranger = await createLocalOwnerClient(env);
    owners.push(stranger);

    const { error } = await stranger.client.rpc("merge_codex_entity_as_alias", {
      p_project_id: seeded.projectId,
      p_source_entity_id: seeded.sourceId,
      p_target_entity_id: seeded.targetId,
    });

    expect(error).not.toBeNull();
    const { count } = await env.service
      .from("entities")
      .select("id", { count: "exact", head: true })
      .in("id", [seeded.sourceId, seeded.targetId]);
    expect(count).toBe(2);
  });

  it("deletes atomically, removes foreshadow references, and blocks the name", async () => {
    if (!env.enabled) throw new Error("integration env unavailable");
    const seeded = await seedProject(env, owner);
    const { error: foreshadowError } = await owner.client.from("foreshadows").insert({
      project_id: seeded.projectId,
      planted_chapter: 1,
      entity_ids: [seeded.sourceId, seeded.otherId],
    });
    if (foreshadowError) throw foreshadowError;

    const { data, error } = await owner.client.rpc("delete_codex_entity", {
      p_project_id: seeded.projectId,
      p_entity_id: seeded.sourceId,
      p_block_term: true,
    });

    expect(error).toBeNull();
    expect(data?.[0]).toEqual({ entity_name: "엘프왕", excluded_term_added: true });
    const [{ data: project }, { data: foreshadow }] = await Promise.all([
      owner.client.from("projects").select("excluded_terms").eq("id", seeded.projectId).single(),
      owner.client.from("foreshadows").select("entity_ids").eq("project_id", seeded.projectId).single(),
    ]);
    expect(project?.excluded_terms).toContain("엘프왕");
    expect(foreshadow?.entity_ids).toEqual([seeded.otherId]);
  });
});
