import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.types";
import { IndexingService } from "../src/lib/services/indexing.service";

type SuggestionRow =
  Database["public"]["Tables"]["entity_suggestions"]["Row"];

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function readChapter(chapterNum: number) {
  const content = readFileSync(
    resolve(process.cwd(), `references/test-data/sample/ch${chapterNum}.md`),
    "utf-8"
  )
    .replace(/^\uFEFF/, "")
    .trim();

  return {
    chapter_num: chapterNum,
    title: `제${chapterNum}화`,
    content,
    word_count: content.replace(/\s/g, "").length,
  };
}

function summarizeSuggestions(rows: SuggestionRow[]) {
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    status: row.status,
    action: row.suggested_action,
    confidence: row.confidence,
    matched: Boolean(row.matched_entity_id),
    hasSnippet: Boolean(row.context_snippet?.trim()),
    snippet: row.context_snippet?.slice(0, 120) ?? null,
  }));
}

async function main() {
  loadEnv();

  const chapterCount = Number(process.argv[2] ?? "3");
  if (!Number.isInteger(chapterCount) || chapterCount < 1) {
    throw new Error("Usage: npx tsx scripts/qa-sample-real-data.ts [chapterCount]");
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const stamp = Date.now();
  const email = `smartwriter.qa.sample.${stamp}@example.com`;
  const password = "SmartWriter-qa-1234!";

  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error) throw signUp.error;

  if (!signUp.data.session) {
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Failed to create authenticated QA user");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: `Sample Fresh QA ${stamp}`,
      genre: "SF",
      description: "sample real-data sequential extraction QA",
    })
    .select("id, title")
    .single();
  if (projectError) throw projectError;

  const indexer = new IndexingService(supabase);
  const chapterResults = [];

  for (let chapterNum = 1; chapterNum <= chapterCount; chapterNum++) {
    const chapter = readChapter(chapterNum);
    const { data: chapterRow, error: chapterError } = await supabase
      .from("chapters")
      .insert({
        project_id: project.id,
        ...chapter,
      })
      .select("id, chapter_num")
      .single();
    if (chapterError) throw chapterError;

    const extraction = await indexer.indexChapterWithExtraction(
      chapterRow.id,
      project.id,
      chapter.content
    );

    const { data: suggestions, error: suggestionError } = await supabase
      .from("entity_suggestions")
      .select("*")
      .eq("project_id", project.id)
      .eq("chapter_id", chapterRow.id)
      .order("status", { ascending: true })
      .order("name", { ascending: true });
    if (suggestionError) throw suggestionError;

    const { data: entities, error: entityError } = await supabase
      .from("entities")
      .select("id, name, type, aliases, summary")
      .eq("project_id", project.id)
      .order("name", { ascending: true });
    if (entityError) throw entityError;

    chapterResults.push({
      chapter: chapterNum,
      chapterId: chapterRow.id,
      extraction,
      entities: entities?.map((entity) => ({
        name: entity.name,
        type: entity.type,
        aliases: entity.aliases,
      })),
      suggestions: summarizeSuggestions(suggestions ?? []),
      targetlessMergeCount:
        suggestions?.filter(
          (row) => row.suggested_action === "MERGE" && !row.matched_entity_id
        ).length ?? 0,
      missingSnippetCount:
        suggestions?.filter((row) => !row.context_snippet?.trim()).length ?? 0,
    });
  }

  const { data: allSuggestions, error: allSuggestionError } = await supabase
    .from("entity_suggestions")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });
  if (allSuggestionError) throw allSuggestionError;

  const { data: finalEntities, error: finalEntityError } = await supabase
    .from("entities")
    .select("id, name, type, aliases, summary")
    .eq("project_id", project.id)
    .order("name", { ascending: true });
  if (finalEntityError) throw finalEntityError;

  console.log(
    JSON.stringify(
      {
        project,
        qaUser: email,
        chaptersInjected: chapterCount,
        chapterResults,
        finalEntities: finalEntities?.map((entity) => ({
          name: entity.name,
          type: entity.type,
          aliases: entity.aliases,
        })),
        allSuggestions: summarizeSuggestions(allSuggestions ?? []),
        checks: {
          targetlessMergeCount:
            allSuggestions?.filter(
              (row) => row.suggested_action === "MERGE" && !row.matched_entity_id
            ).length ?? 0,
          missingSnippetCount:
            allSuggestions?.filter((row) => !row.context_snippet?.trim()).length ??
            0,
          mergeSuggestions:
            allSuggestions
              ?.filter((row) => row.suggested_action === "MERGE")
              .map((row) => ({
                name: row.name,
                type: row.type,
                matched: Boolean(row.matched_entity_id),
                hasSnippet: Boolean(row.context_snippet?.trim()),
              })) ?? [],
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
