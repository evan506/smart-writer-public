import type { Database } from "@/types/database.types";

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ChapterInsert = Database["public"]["Tables"]["chapters"]["Insert"];
type EntityInsert = Database["public"]["Tables"]["entities"]["Insert"];
type EntitySuggestionInsert =
  Database["public"]["Tables"]["entity_suggestions"]["Insert"];
type EntityLinkInsert = Database["public"]["Tables"]["entity_links"]["Insert"];

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function testRunId() {
  return RUN_ID;
}

export function uniqueName(prefix: string) {
  return `${prefix} ${RUN_ID}`;
}

export function projectFactory(
  overrides: Partial<ProjectInsert> = {}
): ProjectInsert {
  return {
    title: uniqueName("통합 테스트 프로젝트"),
    genre: "판타지",
    description: "integration test fixture",
    metadata: { testRunId: RUN_ID },
    excluded_terms: [],
    ...overrides,
  };
}

export function chapterFactory(
  projectId: string,
  overrides: Partial<ChapterInsert> = {}
): ChapterInsert {
  return {
    project_id: projectId,
    chapter_num: 1,
    title: "제1화",
    content: "리엔은 검은 서고에서 오래된 단서를 발견했다.",
    word_count: 22,
    ...overrides,
  };
}

export function entityFactory(
  projectId: string,
  name: string,
  overrides: Partial<EntityInsert> = {}
): EntityInsert {
  return {
    project_id: projectId,
    name,
    type: "CHARACTER",
    summary: `${name} 테스트 항목`,
    aliases: [],
    metadata: { importance: "MINOR", testRunId: RUN_ID },
    ...overrides,
  };
}

export function entitySuggestionFactory(
  projectId: string,
  chapterId: string,
  name: string,
  overrides: Partial<EntitySuggestionInsert> = {}
): EntitySuggestionInsert {
  return {
    project_id: projectId,
    chapter_id: chapterId,
    name,
    type: "CHARACTER",
    summary: `${name} 확인 후보`,
    aliases: [],
    confidence: 0.82,
    context_snippet: `${name} 후보가 본문에 등장함`,
    status: "PENDING",
    suggested_action: "CREATE",
    ...overrides,
  };
}

export function relationSuggestionFactory(
  projectId: string,
  chapterId: string,
  fromName: string,
  toName: string,
  overrides: Partial<EntitySuggestionInsert> = {}
): EntitySuggestionInsert {
  return entitySuggestionFactory(
    projectId,
    chapterId,
    `${fromName}-${toName}-관계`,
    {
      type: "RELATION",
      summary: null,
      aliases: {
        from_name: fromName,
        to_name: toName,
        relation_type: "ALLY",
        direction: "BI",
        weight: 0.8,
      },
      suggested_action: "CREATE",
      ...overrides,
    }
  );
}

export function entityLinkFactory(
  fromId: string,
  toId: string,
  overrides: Partial<EntityLinkInsert> = {}
): EntityLinkInsert {
  return {
    from_id: fromId,
    to_id: toId,
    relation_type: "ALLY",
    direction: "BI",
    weight: 0.8,
    ...overrides,
  };
}
