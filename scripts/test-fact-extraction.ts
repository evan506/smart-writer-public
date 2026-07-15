/**
 * Fact-canon extraction smoke test for real manuscript fixtures.
 *
 * Usage:
 *   npx tsx scripts/test-fact-extraction.ts references/test-data/sample/ch1.md
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { loadLocalEnv } from "./test-extraction/env";
import { knownEntityNames, sampleChapterContent } from "./test-extraction/fixtures";
import type { KnownEntity } from "@/lib/services/prompt-templates";
import { buildLastplayerSeedContract } from "../tests/fixtures/search/lastplayer-seed-contract";
import { buildBlackironSeedContract } from "../tests/fixtures/search/blackiron-seed-contract";
import {
  stage1ExtractNouns,
  stage2Classify,
} from "@/lib/services/entity-extraction/stage-llm-wrappers";
import { normalizeClassifiedEntitiesForRunner } from "@/lib/services/entity-extraction/runner";
import {
  filterEntityCandidates,
  normalizedNameSet,
} from "@/lib/services/entity-extraction-utils";

function readFixtureContent(): { label: string; content: string } {
  const inputPath = process.argv[2];
  if (!inputPath) {
    return { label: "embedded sample chapter", content: sampleChapterContent };
  }

  const absolutePath = resolve(process.cwd(), inputPath);
  return {
    label: inputPath,
    content: readFileSync(absolutePath, "utf-8"),
  };
}

function knownEntities(label: string): KnownEntity[] {
  const contract = label.includes("lastplayer")
    ? buildLastplayerSeedContract()
    : label.includes("blackiron")
      ? buildBlackironSeedContract()
      : null;

  if (contract) {
    return contract.entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      summary: entity.summary,
      aliases: Array.isArray(entity.aliases) ? (entity.aliases as string[]) : [],
    }));
  }

  return knownEntityNames.map((name) => ({
    name,
    type: "CHARACTER",
    summary: null,
    aliases: [],
  }));
}

async function main() {
  loadLocalEnv();

  const { label, content } = readFixtureContent();
  const known = knownEntities(label);
  const excludeNames = Array.from(new Set(
    known.flatMap((entity) => [
      entity.name,
      ...(Array.isArray(entity.aliases) ? entity.aliases : []),
    ])
  ));

  console.log(`=== Fact extraction smoke: ${label} ===`);
  console.log(`본문 길이: ${content.length.toLocaleString()} chars`);
  console.log(`known entities: ${known.length}`);

  const candidates = await stage1ExtractNouns(content, excludeNames);
  const filteredCandidates = filterEntityCandidates(
    candidates,
    normalizedNameSet(excludeNames),
    new Set(),
    new Set()
  );
  console.log(`\n--- Stage 1 candidates (${candidates.length}) ---`);
  console.log(candidates.join(", ") || "(none)");
  console.log(`\n--- After known-name filtering (${filteredCandidates.length}) ---`);
  console.log(filteredCandidates.join(", ") || "(none)");

  const classified = await stage2Classify(filteredCandidates, content, known);
  const normalized = normalizeClassifiedEntitiesForRunner(classified, content);

  const rawFactCount = classified.reduce(
    (sum, entity) => sum + (entity.facts?.length ?? 0),
    0
  );
  const keptFactCount = normalized.reduce(
    (sum, entity) => sum + (entity.facts?.length ?? 0),
    0
  );

  console.log(`\n--- Stage 2 classified (${classified.length}) ---`);
  for (const entity of normalized) {
    console.log(
      `[${entity.type}] ${entity.name} (${entity.confidence}) - ${entity.summary}`
    );
    if (entity.context_snippet) console.log(`  근거: ${entity.context_snippet}`);
    for (const fact of entity.facts ?? []) {
      console.log(
        `  FACT [${fact.fact_type}${fact.fact_key ? `/${fact.fact_key}` : ""}] ${fact.value}`
      );
      console.log(`    evidence: ${fact.evidence}`);
      if (fact.confidence !== undefined) console.log(`    confidence: ${fact.confidence}`);
    }
  }

  const keptFactKeys = new Set(
    normalized.flatMap((entity) =>
      (entity.facts ?? []).map((fact) =>
        [entity.name, fact.fact_type, fact.fact_key ?? "", fact.value, fact.evidence].join("\u001f")
      )
    )
  );
  const droppedFacts = classified.flatMap((entity) =>
    (entity.facts ?? [])
      .filter((fact) => !keptFactKeys.has(
        [entity.name, fact.fact_type, fact.fact_key ?? "", fact.value, fact.evidence].join("\u001f")
      ))
      .map((fact) => ({ entityName: entity.name, fact }))
  );

  if (droppedFacts.length > 0) {
    console.log("\n--- Dropped fact candidates ---");
    for (const { entityName, fact } of droppedFacts) {
      console.log(
        `[${entityName}] [${fact.fact_type}${fact.fact_key ? `/${fact.fact_key}` : ""}] ${fact.value}`
      );
      console.log(`  evidence: ${fact.evidence}`);
    }
  }

  console.log("\n--- Fact filter summary ---");
  console.log(`raw facts from model: ${rawFactCount}`);
  console.log(`source-backed facts kept: ${keptFactCount}`);
  console.log(`dropped facts: ${rawFactCount - keptFactCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
