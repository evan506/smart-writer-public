import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import type { Database } from "@/types/database.types";
import { IndexingService } from "@/lib/services/indexing.service";
import { CanonQAService } from "@/lib/services/canon-qna.service";

// Deliberately opt-in: ordinary tests and CI never make paid provider calls.
const live = process.env.SMART_WRITER_LIVE_AI_TESTS === "1";
it.skipIf(!live)("extracts synthetic evidence and answers grounded/unknown questions with real OpenRouter", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  expect(["127.0.0.1", "localhost", "::1"]).toContain(new URL(url).hostname);
  expect(Boolean(process.env.OPENROUTER_API_KEY)).toBe(true);
  expect(Boolean(process.env.NODE_OPTIONS?.includes("mock-extraction-provider"))).toBe(false);
  expect(process.env.SMART_WRITER_SKIP_EMBEDDINGS === "1").toBe(false);
  for (const key of ["SMART_WRITER_LLM_DAILY_BUDGET_USD", "SMART_WRITER_LLM_MONTHLY_BUDGET_USD", "SMART_WRITER_LLM_USER_DAILY_BUDGET_USD", "SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD"]) {
    process.env[key] = "0.25";
  }
  const fixture = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/live-ai/story.json"), "utf8")) as { content: string; questions: Array<{question: string}> };
  const client = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `smartwriter.e2e.live.${randomUUID()}@example.com`;
  const signUp = await client.auth.signUp({ email, password: `Local-${randomUUID()}!` });
  expect(signUp.error?.message ?? null).toBeNull();
  const userId = signUp.data.user!.id;
  const projectId = randomUUID();
  const chapterId = randomUUID();
  const project = await client.from("projects").insert({ id: projectId, user_id: userId, title: "Live OpenRouter synthetic E2E", genre: "판타지" });
  expect(project.error?.message ?? null).toBeNull();
  const chapter = await client.from("chapters").insert({ id: chapterId, project_id: projectId, title: "합성 샘플", chapter_num: 1, content: fixture.content });
  expect(chapter.error?.message ?? null).toBeNull();
  const report: Record<string, unknown> = { projectId, chapterId, sample: fixture.content, models: "application settings (see usage records)", results: [] };
  try {
    const result = await new IndexingService(client).indexChapterWithExtraction(chapterId, projectId, fixture.content, {userId});
    report.extraction = result;
    const jobs = await client.from("analysis_jobs").select("status,error").eq("project_id", projectId);
    report.jobs = jobs.data;
    expect(jobs.error?.message ?? null).toBeNull();
    expect(jobs.data?.at(-1)?.status).toBe("DONE");
    const suggestions = await client.from("entity_suggestions").select("name,type,summary,context_snippet,status").eq("project_id", projectId);
    report.suggestions = suggestions.data;
    expect(suggestions.error?.message ?? null).toBeNull();
    expect(suggestions.data?.map(s => s.name)).toEqual(expect.arrayContaining(["라온", "미루", "푸른 열쇠", "북쪽 관측소"]));
    const raon = suggestions.data?.find(s => s.name === "라온");
    expect(raon?.summary ?? "").not.toMatch(/오빠|언니|남성|남자/);
    for (const suggestion of suggestions.data ?? []) {
      if (suggestion.context_snippet) expect(fixture.content).toContain(suggestion.context_snippet);
    }
    const canon = await client.from("entities").select("id").eq("project_id", projectId);
    expect(canon.data).toHaveLength(0);
    const facts = await client.from("fact_suggestions").select("fact_type,value,evidence_text").eq("project_id", projectId);
    report.factSuggestions = facts.data;
    expect(facts.data?.filter(f => f.fact_type === "AFFILIATION" && /유리항/.test(f.value))).toHaveLength(0);
    const service = new CanonQAService(client);
    const answers = [];
    for (const { question } of fixture.questions) {
      const answer = await service.ask({ projectId, question, userId });
      answers.push(answer);
      report.results = answers;
    }
    expect(answers[0].status).toBe("answered");
    expect(answers[0].answer).toMatch(/라온/);
    expect(answers[0].answer).toMatch(/북쪽 관측소/);
    expect(answers[0].citations.length).toBeGreaterThan(0);
    expect(answers[0].citations.some(c => c.content.includes("푸른 열쇠"))).toBe(true);
    expect(answers[1].status).toBe("insufficient_evidence");
    expect(answers[1].answer ?? "").not.toMatch(/\d+\s*살/);
    expect(answers[2].answer).toMatch(/라온/);
    expect(answers[2].citations.length).toBeGreaterThan(0);
    expect(answers.map(a => a.answer ?? "").join("\n")).not.toMatch(/오빠|언니|남매/);
    const saved = await client.from("chapters").select("content").eq("id", chapterId).single();
    expect(saved.data?.content).toBe(fixture.content);
    report.passed = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live API validation failed";
    const key = process.env.OPENROUTER_API_KEY;
    throw new Error(key ? message.replaceAll(key, "[REDACTED_API_KEY]") : message);
  } finally {
    const usage = await client.from("llm_usage_logs").select("feature,model,status,cost_usd,prompt_tokens,completion_tokens,prompt_template_key,prompt_template_version").eq("project_id", projectId);
    report.usage = usage.data;
    report.totalCostUsd = usage.data?.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
    const dest = process.env.SMART_WRITER_LIVE_AI_REPORT_PATH ?? path.join(process.cwd(), "test-results/live-openrouter/report.json");
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, JSON.stringify(report, null, 2));
    // Keep the synthetic project for inspecting failed output; no private corpus is used.
    await client.auth.signOut();
  }
}, 180_000);
