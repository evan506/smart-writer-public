import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { supersedeFactSuggestion } from "@/lib/services/canon-facts/suggestions.service";
import {
  chapterFactory,
  entityFactory,
  projectFactory,
} from "../factories/smart-writer";
import {
  createLocalOwnerClient,
  getLocalSupabaseEnv,
  type LocalSupabaseEnv,
} from "./helpers/local-supabase";

type EnabledLocalSupabaseEnv = Extract<LocalSupabaseEnv, { enabled: true }>;
type OwnerClient = Awaited<ReturnType<typeof createLocalOwnerClient>>;

async function seedFactCanonProject(
  env: EnabledLocalSupabaseEnv,
  owner: OwnerClient
) {
  const { data: project, error: projectError } = await owner.client
    .from("projects")
    .insert(projectFactory({ user_id: owner.userId }))
    .select("id")
    .single();
  if (projectError) throw projectError;

  const { data: chapter, error: chapterError } = await owner.client
    .from("chapters")
    .insert(chapterFactory(project.id, { title: "정체", chapter_num: 2 }))
    .select("id")
    .single();
  if (chapterError) throw chapterError;

  const { data: entity, error: entityError } = await owner.client
    .from("entities")
    .insert(entityFactory(project.id, "리엔"))
    .select("id")
    .single();
  if (entityError) throw entityError;

  const { data: facts, error: factError } = await owner.client
    .from("canon_facts")
    .insert([
      {
        project_id: project.id,
        entity_id: entity.id,
        fact_type: "ATTRIBUTE",
        fact_key: "species",
        value: "하이엘프다",
        status: "APPROVED",
        established_chapter_id: chapter.id,
        valid_from_chapter_id: chapter.id,
      },
      {
        project_id: project.id,
        entity_id: entity.id,
        fact_type: "ABILITY",
        fact_key: "combat",
        value: "검술에 능하다",
        status: "APPROVED",
        established_chapter_id: chapter.id,
        valid_from_chapter_id: chapter.id,
      },
    ])
    .select("id, fact_type, fact_key");
  if (factError) throw factError;

  const { data: suggestions, error: suggestionError } = await owner.client
    .from("fact_suggestions")
    .insert([
      {
        project_id: project.id,
        chapter_id: chapter.id,
        matched_entity_id: entity.id,
        fact_type: "ATTRIBUTE",
        fact_key: "species",
        value: "인간이다",
        evidence_text: "리엔은 인간이라고 불렸다.",
        status: "PENDING",
      },
      {
        project_id: project.id,
        chapter_id: chapter.id,
        matched_entity_id: entity.id,
        fact_type: "ABILITY",
        fact_key: "combat",
        value: "마법도 다룬다",
        evidence_text: "리엔은 전투 중 마법을 사용했다.",
        status: "PENDING",
      },
    ])
    .select("id, fact_type, fact_key");
  if (suggestionError) throw suggestionError;

  const speciesFact = facts?.find((fact) => fact.fact_type === "ATTRIBUTE");
  const speciesSuggestion = suggestions?.find(
    (suggestion) => suggestion.fact_type === "ATTRIBUTE"
  );
  if (!speciesFact || !speciesSuggestion) {
    throw new Error("Failed to seed species fact canon rows");
  }

  return {
    projectId: project.id,
    chapterId: chapter.id,
    speciesFactId: speciesFact.id,
    speciesSuggestionId: speciesSuggestion.id,
    cleanup: async () => {
      await env.service.from("projects").delete().eq("id", project.id);
    },
  };
}

const env = getLocalSupabaseEnv();
const runner = env.enabled ? describe : describe.skip;

runner("fact canon DB flow", () => {
  let owner: OwnerClient | null = null;
  let cleanupProject: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    if (!env.enabled) return;
    owner = await createLocalOwnerClient(env);
  });

  afterEach(async () => {
    if (!env.enabled || !owner) return;
    await cleanupProject?.();
    await env.service.auth.admin.deleteUser(owner.userId);
    owner = null;
    cleanupProject = null;
  });

  it("previews only single-value conflicts and persists explicit supersede history", async () => {
    if (!env.enabled || !owner) throw new Error("integration env unavailable");
    const seeded = await seedFactCanonProject(env, owner);
    cleanupProject = seeded.cleanup;

    const { data: reviewRows, error: reviewError } = await owner.client.rpc(
      "list_pending_fact_review_items",
      { p_project_id: seeded.projectId }
    );

    expect(reviewError).toBeNull();
    const speciesReview = reviewRows?.find(
      (row) => row.fact_type === "ATTRIBUTE" && row.fact_key === "species"
    );
    const abilityReview = reviewRows?.find(
      (row) => row.fact_type === "ABILITY" && row.fact_key === "combat"
    );
    expect(speciesReview).toEqual(
      expect.objectContaining({
        conflicting_fact_id: seeded.speciesFactId,
        conflicting_value: "하이엘프다",
        approval_mode: "CREATE_FACT",
      })
    );
    expect(abilityReview).toEqual(
      expect.objectContaining({
        conflicting_fact_id: null,
        conflicting_value: null,
        approval_mode: "CREATE_FACT",
      })
    );

    const result = await supersedeFactSuggestion(
      owner.client as never,
      seeded.speciesSuggestionId,
      seeded.projectId,
      seeded.speciesFactId
    );

    expect(result.error).toBeNull();
    expect(result.mode).toBe("superseded");

    const { data: supersededFact } = await owner.client
      .from("canon_facts")
      .select("status, superseded_by, valid_until_chapter_id")
      .eq("id", seeded.speciesFactId)
      .single();
    expect(supersededFact).toEqual({
      status: "SUPERSEDED",
      superseded_by: result.factId,
      valid_until_chapter_id: seeded.chapterId,
    });

    const { data: replacementFact } = await owner.client
      .from("canon_facts")
      .select("id, status, value, established_chapter_id")
      .eq("id", result.factId!)
      .single();
    expect(replacementFact).toEqual({
      id: result.factId,
      status: "APPROVED",
      value: "인간이다",
      established_chapter_id: seeded.chapterId,
    });

    const { data: sources } = await owner.client
      .from("canon_fact_sources")
      .select("fact_id, chapter_id, evidence_text")
      .eq("fact_id", result.factId!);
    expect(sources).toEqual([
      {
        fact_id: result.factId,
        chapter_id: seeded.chapterId,
        evidence_text: "리엔은 인간이라고 불렸다.",
      },
    ]);

    const { data: suggestion } = await owner.client
      .from("fact_suggestions")
      .select("status, resulting_fact_id")
      .eq("id", seeded.speciesSuggestionId)
      .single();
    expect(suggestion).toEqual({
      status: "APPROVED",
      resulting_fact_id: result.factId,
    });
  });
});
