import { afterEach, beforeEach, expect, it } from "vitest";
import { buildRelationBatchConfirmationPlan } from "@/lib/services/suggestion-action-utils";
import {
  chapterFactory,
  entityFactory,
  entityLinkFactory,
  entitySuggestionFactory,
  projectFactory,
  relationSuggestionFactory,
} from "../factories/smart-writer";
import { describeIntegration, type IntegrationClient } from "./helpers/env";

async function seedProject(supabase: IntegrationClient) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert(projectFactory())
    .select("id")
    .single();
  if (projectError) throw projectError;

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert(chapterFactory(project.id))
    .select("id")
    .single();
  if (chapterError) throw chapterError;

  return { projectId: project.id, chapterId: chapter.id };
}

describeIntegration("suggestion DB flow", ({ supabase }) => {
  const projectIds: string[] = [];

  beforeEach(async () => {
    projectIds.length = 0;
  });

  afterEach(async () => {
    for (const projectId of projectIds) {
      await supabase.from("projects").delete().eq("id", projectId);
    }
  });

  it("seeds project/chapter/suggestions and cascades cleanup from projects", async () => {
    const { projectId, chapterId } = await seedProject(supabase);

    const { data: inserted, error: suggestionError } = await supabase
      .from("entity_suggestions")
      .insert([
        entitySuggestionFactory(projectId, chapterId, "리엔"),
        entitySuggestionFactory(projectId, chapterId, "검은 서고", {
          type: "PLACE",
        }),
      ])
      .select("id");

    expect(suggestionError).toBeNull();
    expect(inserted).toHaveLength(2);

    const { error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);
    expect(deleteError).toBeNull();

    const { data: remainingSuggestions } = await supabase
      .from("entity_suggestions")
      .select("id")
      .eq("project_id", projectId);
    const { data: remainingChapters } = await supabase
      .from("chapters")
      .select("id")
      .eq("project_id", projectId);

    expect(remainingSuggestions).toEqual([]);
    expect(remainingChapters).toEqual([]);
  });

  it("enforces one suggestion name per chapter", async () => {
    const { projectId, chapterId } = await seedProject(supabase);
    projectIds.push(projectId);

    const first = await supabase
      .from("entity_suggestions")
      .insert(entitySuggestionFactory(projectId, chapterId, "리엔"));
    expect(first.error).toBeNull();

    const duplicate = await supabase
      .from("entity_suggestions")
      .insert(
        entitySuggestionFactory(projectId, chapterId, "리엔", {
          summary: "중복 후보",
        })
      );

    expect(duplicate.error?.code).toBe("23505");
  });

  it("confirms relation suggestions idempotently with entity_links upsert", async () => {
    const { projectId, chapterId } = await seedProject(supabase);
    projectIds.push(projectId);

    const { data: entities, error: entityError } = await supabase
      .from("entities")
      .insert([
        entityFactory(projectId, "리엔"),
        entityFactory(projectId, "검은 서고", { type: "PLACE" }),
      ])
      .select("id, name");
    expect(entityError).toBeNull();
    expect(entities).toHaveLength(2);

    const { data: suggestions, error: suggestionError } = await supabase
      .from("entity_suggestions")
      .insert([
        relationSuggestionFactory(projectId, chapterId, "리엔", "검은 서고"),
        relationSuggestionFactory(projectId, chapterId, "리엔", "없는 인물", {
          name: "리엔-없는 인물-관계",
        }),
      ])
      .select("id, aliases");
    expect(suggestionError).toBeNull();
    expect(suggestions).toHaveLength(2);

    const plan = buildRelationBatchConfirmationPlan(
      suggestions ?? [],
      entities ?? []
    );

    expect(plan.confirmedIds).toHaveLength(1);
    expect(plan.dismissedIds).toHaveLength(1);

    const firstUpsert = await supabase
      .from("entity_links")
      .upsert(plan.linkInserts, {
        onConflict: "from_id,to_id,relation_type",
        ignoreDuplicates: true,
      });
    expect(firstUpsert.error).toBeNull();

    const secondUpsert = await supabase
      .from("entity_links")
      .upsert(plan.linkInserts, {
        onConflict: "from_id,to_id,relation_type",
        ignoreDuplicates: true,
      });
    expect(secondUpsert.error).toBeNull();

    await supabase
      .from("entity_suggestions")
      .update({ status: "CONFIRMED" })
      .in("id", plan.confirmedIds);
    await supabase
      .from("entity_suggestions")
      .update({ status: "DISMISSED" })
      .in("id", plan.dismissedIds);

    const { data: links } = await supabase
      .from("entity_links")
      .select("id, relation_type")
      .eq("from_id", plan.linkInserts[0].from_id)
      .eq("to_id", plan.linkInserts[0].to_id)
      .eq("relation_type", plan.linkInserts[0].relation_type);
    const { data: statuses } = await supabase
      .from("entity_suggestions")
      .select("id, status")
      .in("id", suggestions?.map((suggestion) => suggestion.id) ?? [])
      .order("status");

    expect(links).toHaveLength(1);
    expect(statuses?.map((row) => row.status).sort()).toEqual([
      "CONFIRMED",
      "DISMISSED",
    ]);
  });

  it("rejects invalid entity_link weights at the database boundary", async () => {
    const { projectId } = await seedProject(supabase);
    projectIds.push(projectId);

    const { data: entities } = await supabase
      .from("entities")
      .insert([entityFactory(projectId, "리엔"), entityFactory(projectId, "카이")])
      .select("id");

    expect(entities).toHaveLength(2);

    const invalid = await supabase.from("entity_links").insert(
      entityLinkFactory(entities![0].id, entities![1].id, {
        weight: 1.5,
      })
    );

    expect(invalid.error?.code).toBe("23514");
  });
});
