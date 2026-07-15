import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GraphRAGService } from "@/lib/services/graph-rag.service";
import { SearchService } from "@/lib/services/search.service";
import {
  buildBlackironSeedContract,
  type BlackironSeedContract,
} from "../fixtures/search/blackiron-seed-contract";
import {
  buildLastplayerSeedContract,
  type LastplayerSeedContract,
} from "../fixtures/search/lastplayer-seed-contract";
import {
  evaluateSearchTopK,
  summarizeSearchRecallByTopK,
  type SearchRecallSummaryByTopK,
  type SearchTopKCase,
} from "../unit/lib/services/search-rag-evaluator";
import {
  createLocalOwnerClient,
  getLocalSupabaseEnv,
  type LocalSupabaseEnv,
} from "./helpers/local-supabase";
import type { IntegrationClient } from "./helpers/env";

type SeededProject = {
  userId: string;
  projectId: string;
  seed: SearchRAGSeedContract;
  ownerClient: IntegrationClient;
};

type SearchRAGSeedContract = BlackironSeedContract | LastplayerSeedContract;

type SearchRAGSeedCase = {
  name: string;
  buildSeed: () => SearchRAGSeedContract;
};

const seedCases: SearchRAGSeedCase[] = [
  {
    name: "blackiron",
    buildSeed: buildBlackironSeedContract,
  },
  {
    name: "lastplayer",
    buildSeed: buildLastplayerSeedContract,
  },
];

const env = getLocalSupabaseEnv();
const runner = env.enabled ? describe : describe.skip;

async function cleanupSeed(activeEnv: Extract<LocalSupabaseEnv, { enabled: true }>, seeded: SeededProject | null) {
  if (!seeded) return;
  await activeEnv.service.from("projects").delete().eq("id", seeded.projectId);
  await activeEnv.service.auth.admin.deleteUser(seeded.userId);
}

async function seedContract(
  activeEnv: Extract<LocalSupabaseEnv, { enabled: true }>,
  buildSeed: () => SearchRAGSeedContract
): Promise<SeededProject> {
  const owner = await createLocalOwnerClient(activeEnv);
  const seed = buildSeed();
  const project = {
    ...seed.project,
    user_id: owner.userId,
  };

  const projectInsert = await activeEnv.service.from("projects").insert(project);
  if (projectInsert.error) throw projectInsert.error;

  const chapterInsert = await activeEnv.service.from("chapters").insert(seed.chapters);
  if (chapterInsert.error) throw chapterInsert.error;

  const chunkInsert = await activeEnv.service.from("chunks").insert(seed.chunks);
  if (chunkInsert.error) throw chunkInsert.error;

  const entityInsert = await activeEnv.service.from("entities").insert(seed.entities);
  if (entityInsert.error) throw entityInsert.error;

  const linkInsert = await activeEnv.service.from("entity_links").insert(seed.entityLinks);
  if (linkInsert.error) throw linkInsert.error;

  return {
    userId: owner.userId,
    projectId: seed.ids.projectId,
    seed,
    ownerClient: owner.client,
  };
}

async function countSeedRows(
  activeEnv: Extract<LocalSupabaseEnv, { enabled: true }>,
  seed: SearchRAGSeedContract
) {
  const [projects, chapters, entities, links] = await Promise.all([
    activeEnv.service.from("projects").select("id", { count: "exact", head: true }).eq("id", seed.ids.projectId),
    activeEnv.service.from("chapters").select("id", { count: "exact", head: true }).eq("project_id", seed.ids.projectId),
    activeEnv.service.from("entities").select("id", { count: "exact", head: true }).eq("project_id", seed.ids.projectId),
    activeEnv.service
      .from("entity_links")
      .select("id", { count: "exact", head: true })
      .in("from_id", Object.values(seed.entityIdsByName)),
  ]);

  return {
    projects: projects.count ?? 0,
    chapters: chapters.count ?? 0,
    entities: entities.count ?? 0,
    entityLinks: links.count ?? 0,
  };
}

async function buildRecallCases(
  activeEnv: Extract<LocalSupabaseEnv, { enabled: true }>,
  seeded: SeededProject
): Promise<SearchTopKCase[]> {
  const search = new SearchService(seeded.ownerClient);
  const graph = new GraphRAGService(activeEnv.service);
  const cases: SearchTopKCase[] = [];

  for (const query of seeded.seed.expectedQueries) {
    const [entities, chapters] = await Promise.all([
      search.searchEntitiesBm25(seeded.projectId, query.query, query.acceptableTopK),
      search.searchChaptersBm25(seeded.projectId, query.query, query.acceptableTopK),
    ]);

    cases.push({
      id: query.id,
      query: query.query,
      expectedEntityIds: query.expectedEntityIds,
      expectedChapterIds: query.expectedChapterIds,
      requiredSources: ["bm25"],
      results: [
        ...entities.map((entity) => ({
          id: entity.id,
          source: "bm25" as const,
          type: "entity" as const,
          title: entity.name ?? "",
          score: entity.rank ?? 0,
        })),
        ...chapters.map((chapter) => ({
          id: chapter.id,
          source: "bm25" as const,
          type: "chapter" as const,
          title: chapter.title ?? "",
          score: chapter.rank ?? 0,
        })),
      ],
    });
  }

  for (const vectorQuery of seeded.seed.expectedVectorQueries) {
    const chunks = await search.matchChunks(vectorQuery.queryEmbedding, {
      projectId: seeded.projectId,
      matchCount: vectorQuery.acceptableTopK,
      matchThreshold: 0,
    });

    cases.push({
      id: vectorQuery.id,
      query: vectorQuery.query,
      expectedEntityIds: [],
      expectedChapterIds: [],
      expectedChunkIds: vectorQuery.expectedChunkIds,
      requiredSources: ["vector"],
      results: chunks.map((chunk) => ({
        id: chunk.id,
        source: "vector",
        type: "chunk",
        title: chunk.summary ?? chunk.content.slice(0, 80),
        score: chunk.similarity ?? 0,
      })),
    });
  }

  for (const graphQuery of seeded.seed.expectedGraphQueries) {
    const related = await graph.findRelatedEntities(graphQuery.startEntityId, graphQuery.maxDepth);

    cases.push({
      id: graphQuery.id,
      query: graphQuery.id,
      expectedEntityIds: graphQuery.expectedEntityIds,
      expectedChapterIds: [],
      requiredSources: ["graph"],
      results: related.map((entity) => ({
        id: entity.entity_id,
        source: "graph",
        type: "entity",
        title: entity.entity_name,
        score: entity.cumulative_weight ?? 0,
      })),
    });
  }

  return cases;
}

async function writeRecallArtifact(
  seedName: string,
  cases: SearchTopKCase[],
  summaryByTopK: SearchRecallSummaryByTopK
) {
  const topKs = Object.keys(summaryByTopK).map(Number);
  const artifact = {
    generatedAt: new Date().toISOString(),
    seed: seedName,
    topKs,
    summaryByTopK,
    cases: cases.map((testCase) => ({
      id: testCase.id,
      query: testCase.query,
      expectedEntityIds: testCase.expectedEntityIds,
      expectedChapterIds: testCase.expectedChapterIds,
      expectedChunkIds: testCase.expectedChunkIds ?? [],
      requiredSources: testCase.requiredSources,
      evaluationsByTopK: Object.fromEntries(
        topKs.map((topK) => [topK, evaluateSearchTopK(testCase, topK)])
      ),
      results: testCase.results,
    })),
  };
  const outputDir = path.join(process.cwd(), "test-results", "search-rag-recall");

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, `${seedName}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8"
  );
}

runner("Search/RAG DB-backed seed runner", () => {
  if (!env.enabled) {
    it(`skipped: ${env.reason}`, () => {});
    return;
  }

  let seeded: SeededProject | null = null;

  afterEach(async () => {
    await cleanupSeed(env, seeded);
    seeded = null;
  });

  it.each(seedCases)("finds $name entities and chapters through authenticated BM25 RPCs", async ({ buildSeed }) => {
    seeded = await seedContract(env, buildSeed);
    const search = new SearchService(seeded.ownerClient);

    for (const query of seeded.seed.expectedQueries) {
      const [entities, chapters] = await Promise.all([
        search.searchEntitiesBm25(seeded.projectId, query.query, query.acceptableTopK),
        search.searchChaptersBm25(seeded.projectId, query.query, query.acceptableTopK),
      ]);

      const evaluation = evaluateSearchTopK(
        {
          id: query.id,
          query: query.query,
          expectedEntityIds: query.expectedEntityIds,
          expectedChapterIds: query.expectedChapterIds,
          requiredSources: ["bm25"],
          results: [
            ...entities.map((entity) => ({
              id: entity.id,
              source: "bm25" as const,
              type: "entity" as const,
              title: entity.name ?? "",
              score: entity.rank ?? 0,
            })),
            ...chapters.map((chapter) => ({
              id: chapter.id,
              source: "bm25" as const,
              type: "chapter" as const,
              title: chapter.title ?? "",
              score: chapter.rank ?? 0,
            })),
          ],
        },
        query.acceptableTopK
      );

      if (evaluation.missingEntityIds.length > 0 || evaluation.missingChapterIds.length > 0) {
        const counts = await countSeedRows(env, seeded.seed);
        throw new Error(
          JSON.stringify(
            {
              counts,
              evaluation,
              entityResults: entities.map((entity) => ({
                id: entity.id,
                name: entity.name,
                rank: entity.rank,
              })),
              chapterResults: chapters.map((chapter) => ({
                id: chapter.id,
                title: chapter.title,
                rank: chapter.rank,
              })),
            },
            null,
            2
          )
        );
      }

      expect(evaluation.missingEntityIds).toEqual([]);
      expect(evaluation.missingChapterIds).toEqual([]);
    }
  });

  it.each(seedCases)("finds $name chunks through vector RPCs", async ({ buildSeed }) => {
    seeded = await seedContract(env, buildSeed);
    const search = new SearchService(seeded.ownerClient);

    for (const vectorQuery of seeded.seed.expectedVectorQueries) {
      const chunks = await search.matchChunks(vectorQuery.queryEmbedding, {
        projectId: seeded.projectId,
        matchCount: vectorQuery.acceptableTopK,
        matchThreshold: 0,
      });

      const chunkEvaluation = evaluateSearchTopK(
        {
          id: vectorQuery.id,
          query: vectorQuery.query,
          expectedEntityIds: [],
          expectedChapterIds: [],
          expectedChunkIds: vectorQuery.expectedChunkIds,
          requiredSources: ["vector"],
          results: chunks.map((chunk) => ({
            id: chunk.id,
            source: "vector",
            type: "chunk",
            title: chunk.summary ?? chunk.content.slice(0, 80),
            score: chunk.similarity ?? 0,
          })),
        },
        vectorQuery.acceptableTopK
      );

      if (chunkEvaluation.missingChunkIds.length > 0) {
        const counts = await countSeedRows(env, seeded.seed);
        throw new Error(
          JSON.stringify(
            {
              counts,
              chunkEvaluation,
              chunkResults: chunks.map((chunk) => ({
                id: chunk.id,
                chapter_id: chunk.chapter_id,
                similarity: chunk.similarity,
                position: chunk.position,
                content: chunk.content.slice(0, 120),
              })),
            },
            null,
            2
          )
        );
      }

      expect(chunkEvaluation.missingChunkIds).toEqual([]);
      expect(chunks[0]?.similarity).toBeGreaterThan(0.99);
    }
  });

  it.each(seedCases)("expands $name relations through graph RPC", async ({ buildSeed }) => {
    seeded = await seedContract(env, buildSeed);
    const graph = new GraphRAGService(env.service);

    for (const graphQuery of seeded.seed.expectedGraphQueries) {
      const related = await graph.findRelatedEntities(
        graphQuery.startEntityId,
        graphQuery.maxDepth
      );
      const relatedIds = new Set(related.map((entity) => entity.entity_id));

      for (const expectedEntityId of graphQuery.expectedEntityIds) {
        expect(relatedIds.has(expectedEntityId)).toBe(true);
      }
    }
  });

  it.each(seedCases)("summarizes $name recall at top-3 and top-8", async ({ name, buildSeed }) => {
    seeded = await seedContract(env, buildSeed);
    const cases = await buildRecallCases(env, seeded);
    const summaryByTopK = summarizeSearchRecallByTopK(cases, [3, 8]);
    await writeRecallArtifact(name, cases, summaryByTopK);

    if (summaryByTopK[8].missingCaseIds.length > 0 || summaryByTopK[8].overallRecall !== 1) {
      const counts = await countSeedRows(env, seeded.seed);
      throw new Error(
        JSON.stringify(
          {
            counts,
            summaryByTopK,
            caseIds: cases.map((testCase) => testCase.id),
          },
          null,
          2
        )
      );
    }

    expect(Object.keys(summaryByTopK)).toEqual(["3", "8"]);
    expect(summaryByTopK[8].missingCaseIds).toEqual([]);
    expect(summaryByTopK[8].overallRecall).toBe(1);
  });
});
