import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.types";
import { buildE2ESeedOutput, createE2EEmail } from "../src/lib/services/e2e-data-safety-utils";

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

function readChapterSet(folder: "lastplayer" | "blackiron", count: number) {
  return Array.from({ length: count }, (_, index) => {
    const chapterNum = index + 1;
    const content = readFileSync(
      resolve(process.cwd(), `references/test-data/${folder}/ch${chapterNum}.md`),
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
  });
}

async function main() {
  loadEnv();

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const stamp = Date.now();
  const email = createE2EEmail(stamp);
  const password = "SmartWriter-e2e-1234!";

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
  if (!user) throw new Error("Failed to create authenticated e2e user");

  const projects = [
    {
      key: "lastplayer",
      title: `마지막 플레이어 E2E ${stamp}`,
      genre: "SF",
      description: "마지막 플레이어 30화 테스트 데이터",
      chapters: readChapterSet("lastplayer", 30),
      entities: [
        { name: "아자르 스튜디오", type: "ORGANIZATION", summary: "게임을 제작한 신흥 제작사", aliases: ["Azar Studio"] },
        { name: "제국", type: "ORGANIZATION", summary: "원주민을 침략하는 거대 세력", aliases: [] },
        { name: "넘버즈", type: "ORGANIZATION", summary: "제국의 상위 전투 집단", aliases: [] },
        { name: "파워슈트", type: "ITEM", summary: "개척자들이 사용하는 종결 무장", aliases: [] },
        { name: "꼬꼬마 늑대 수인", type: "CONCEPT", summary: "주인공과 함께하는 늑대 수인", aliases: ["늑대 수인"] },
      ],
      suggestions: [
        { name: "개척자", type: "CHARACTER", summary: "플레이어 역할의 인물 후보", aliases: ["플레이어"] },
        { name: "제국 모함 수용소", type: "PLACE", summary: "원주민들이 처분을 기다리던 수용소", aliases: [] },
      ],
      foreshadow: "석관에서 깨어난 소년의 정체와 제국의 단검 저주",
    },
    {
      key: "blackiron",
      title: `흑철기사단 E2E ${stamp}`,
      genre: "판타지",
      description: "흑철기사단 15화 테스트 데이터",
      chapters: readChapterSet("blackiron", 15),
      entities: [
        { name: "리엔 하르트", type: "CHARACTER", summary: "변경 수비대장으로 발령된 하이엘프", aliases: ["리엔"] },
        { name: "엘프들의 나라", type: "PLACE", summary: "엘프 왕이 통치하는 왕국", aliases: [] },
        { name: "엘프 왕", type: "CHARACTER", summary: "리엔을 전방으로 보낸 왕", aliases: ["왕"] },
        { name: "마족", type: "CONCEPT", summary: "전방 영지의 위협 세력", aliases: [] },
        { name: "영지민", type: "CONCEPT", summary: "리엔이 이끌어야 하는 전방 마을 주민들", aliases: [] },
      ],
      suggestions: [
        { name: "하이엘프", type: "CONCEPT", summary: "리엔과 왕의 종족/계급 후보", aliases: [] },
        { name: "전방 마을", type: "PLACE", summary: "리엔이 영주로 부임할 지역", aliases: [] },
      ],
      foreshadow: "리엔이 수도로 복귀해 엘프 왕에게 복수하겠다는 결심",
    },
  ] as const;

  const created: Record<string, { id: string; firstChapterId: string }> = {};

  for (const project of projects) {
    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: project.title,
        genre: project.genre,
        description: project.description,
      })
      .select("id")
      .single();
    if (projectError) throw projectError;

    const chapterRows = project.chapters.map((chapter) => ({
      project_id: projectRow.id,
      ...chapter,
    }));

    const { data: chapters, error: chapterError } = await supabase
      .from("chapters")
      .insert(chapterRows)
      .select("id, chapter_num");
    if (chapterError) throw chapterError;
    const firstChapter = chapters?.find((chapter) => chapter.chapter_num === 1);
    if (!firstChapter) throw new Error(`Missing first chapter for ${project.title}`);

    const { data: entities, error: entityError } = await supabase
      .from("entities")
      .insert(
        project.entities.map((entity) => ({
          project_id: projectRow.id,
          name: entity.name,
          type: entity.type,
          summary: entity.summary,
          aliases: entity.aliases,
          metadata: { importance: "MAIN" },
        }))
      )
      .select("id, name");
    if (entityError) throw entityError;

    if (entities && entities.length >= 2) {
      const first = entities[0];
      const links = entities.slice(1, 4).map((entity, index) => ({
        from_id: first.id,
        to_id: entity.id,
        relation_type: index === 0 ? "LOCATED_IN" : index === 1 ? "ENEMY" : "USES",
        direction: "UNI",
        weight: 0.75,
      }));
      const { error: linkError } = await supabase.from("entity_links").insert(links);
      if (linkError) throw linkError;
    }

    const { error: suggestionError } = await supabase
      .from("entity_suggestions")
      .insert(
        project.suggestions.map((suggestion) => ({
          project_id: projectRow.id,
          chapter_id: firstChapter.id,
          name: suggestion.name,
          type: suggestion.type,
          summary: suggestion.summary,
          aliases: suggestion.aliases,
          confidence: 0.72,
          context_snippet: `${suggestion.name} 관련 테스트 제안`,
          status: "PENDING",
          suggested_action: "CREATE",
        }))
      );
    if (suggestionError) throw suggestionError;

    const { error: foreshadowError } = await supabase.from("foreshadows").insert({
      project_id: projectRow.id,
      description: project.foreshadow,
      planted_chapter: 1,
      expected_reveal: project.chapters.length,
      entity_ids: entities?.slice(0, 2).map((entity) => entity.id) ?? null,
      status: "PLANTED",
    });
    if (foreshadowError) throw foreshadowError;

    created[project.key] = {
      id: projectRow.id,
      firstChapterId: firstChapter.id,
    };
  }

  console.log(
    JSON.stringify(buildE2ESeedOutput({ email, password, projects: created }), null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
