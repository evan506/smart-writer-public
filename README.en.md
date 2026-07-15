# Smart Writer

[🔗 Live Demo](https://smart-writer-vq8j.vercel.app/demo) · [한국어 README](./README.md) · [![CI](https://github.com/evan506/smart-writer-public/actions/workflows/test.yml/badge.svg)](https://github.com/evan506/smart-writer-public/actions/workflows/test.yml)

![Smart Writer write workspace](./assets/screenshots/app/01-write-workspace.png)

**An evidence-backed canon-consistency workspace for Korean web novel authors.** It reads author-written chapters, proposes character / setting / relationship / foreshadowing candidates, shows the manuscript evidence behind each one, and saves only what the author approves as story memory.

> The author writes. Smart Writer keeps the canon straight.
> This is **not** an auto-writing tool. AI never authors prose here — it only proposes candidates that a human accepts or rejects.

The live demo at [`/demo`](https://smart-writer-vq8j.vercel.app/demo) walks the write → review → story-memory flow **with no sign-up**.

## Highlights

- **Rich write workspace** — a custom Tiptap editor with debounced autosave, offline detection, an unsaved-changes guard, and inline entity/warning highlights.
- **Source-backed AI review** — entity, relation, and setting candidates arrive with their *source evidence*, and nothing enters canon without the author's explicit approval.
- **Interactive relationship graph** — a custom d3-force renderer with zoom, pan, node dragging, and typed nodes/edges.
- **Tested & CI-gated** — 596 unit tests (97 files), Playwright E2E, GitHub Actions CI, and a Docker-backed migration replay gate.

## Product flow

```text
write a chapter
  → AI detects candidates (entities, aliases, relations, facts)
  → author reviews the source evidence behind each candidate
  → author approves
  → approved items become story memory (Codex)
  → reused in search, entity detail, relationship graph, and evidence-bounded Q&A
```

The design rule throughout: **AI proposes, the author decides.**

## What it does

- **Write workspace** — a desktop-first Tiptap chapter editor with debounced autosave (draft save vs. full save + AI extraction), offline detection, and an unsaved-changes guard.
- **Candidate review** — entities, aliases/titles, relations, and facts arrive as *review candidates*, never as automatic truth. Each shows its source snippet.
- **Codex (story memory)** — approved characters, places, organizations, items, concepts, and magic systems, with aliases, chapter records, and evidence history.
- **Hybrid search / RAG** — pgvector similarity + PostgreSQL trigram text search + graph expansion over approved canon, with lightweight reranking.
- **Evidence-bounded Q&A** — answers cite the retrieved evidence they were built from. It is deliberately *not* a story oracle.
- **Relationship graph** — an interactive d3-force graph (zoom / pan / node drag) over approved relations.
- **Progressive planning** — 시작 / 전개 / 전환 / 결말 four-block structure that expands into child cards only where the author wants detail.
- **LLM cost guardrails** — per-project and per-user daily/monthly budget checks with graceful degradation: if the budget is hit, the manuscript still saves and only the AI extraction is skipped.

## Screenshots

### 1. Candidate review (source evidence)

The right-hand review panel. Every entity / alias / relation candidate shows the manuscript snippet it came from, and the author decides *save / edit & approve / skip*.

![Candidate review panel](./assets/screenshots/app/04-review-panel.png)

### 2. Story memory (Codex)

Approved items and review candidates, grouped by type, with aliases, relation counts, first-appearance chapters, and status (author-approved / needs review).

![Story memory](./assets/screenshots/app/02-codex-memory.png)

### 3. Relationship graph

An interactive d3-force graph — typed nodes/edges, zoom / pan / drag, and click-through to detail.

![Relationship graph](./assets/screenshots/app/03-relationship-graph.png)

### 4. Progressive planning

Start from four blocks (시작 / 전개 / 전환 / 결말) and drill into child cards only where you need detail.

![Planning workspace](./assets/screenshots/planning-v2/01-planning-desktop-default.png)

## Tech stack

| Area | Stack |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript |
| Data | Supabase PostgreSQL + pgvector + pg_trgm, Row Level Security |
| Editor | Tiptap 3 (with custom entity/warning highlight plugins) |
| UI | Tailwind v4, shadcn/ui + Radix, CVA, custom design tokens |
| Visualization | d3-force (custom interactive graph renderer) |
| Validation | Zod |
| LLM | Claude models + OpenAI-compatible embeddings (`text-embedding-3-small`) via OpenRouter. Default models are set in `.env.example` |
| Tests | Vitest, Testing Library, Playwright |
| Tooling | pnpm 10.25.0, ESLint, knip (dead-code gate) |

**UI state is scoped by lifetime** — React hooks for interactive local state, URL search params for shareable/refreshable state, and Server Actions (`revalidatePath` + `router.refresh`) for server data mutations. At the current product size, no separate global store is introduced.

## Architecture notes

```text
Browser
  └─ Client Components (only interactive leaves are "use client")
       └─ Server Actions ("use server")
            ├─ ownership guards (requireProjectOwner / requireChapterOwner)
            ├─ domain services (src/lib/services/*)
            └─ Supabase PostgreSQL
                   ├─ RLS (auth.uid())
                   ├─ pgvector / pg_trgm
                   └─ after() background indexing & extraction
```

- **Server Components by default.** Data is fetched in Server Components; only interactive leaves are `"use client"`. All mutations go through `"use server"` actions.
- **Layered.** Route-colocated server actions (`*-actions.ts`) are thin adapters: *authorize → call service → revalidate*. Business logic lives in `src/lib/services/`.
- **Defence in depth on data isolation.** Postgres RLS policies (`auth.uid()`) *plus* explicit `requireProjectOwner` / `requireChapterOwner` guards in every project-scoped server action.
- **Background work.** Post-save indexing and LLM extraction run in `after()`, so saves return immediately.
- **Supabase is server-only.** There is no browser Supabase client; every DB call originates on the server.

## Verification

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test:run          # 596 unit tests across 97 files
pnpm build
```

Broader, skip-safe suites:

```bash
pnpm test:integration  # skips unless SMART_WRITER_INTEGRATION_TESTS=1
pnpm test:e2e          # authenticated flows skip unless SMART_WRITER_AUTH_E2E_TESTS=1
pnpm db:replay-verify  # Docker-backed migration replay gate
```

CI (GitHub Actions) runs lint → knip → typecheck → unit + integration + e2e → build, plus a second job that spins up a local Supabase and runs the DB-backed search/RAG regression.

## Intentionally out of scope

Deliberately *not* built. Scope discipline is a feature:

- AI automatic drafting or chapter generation
- publishing, payment, export, or reader-facing pages
- mass manuscript import and whole-series canon health dashboards
- production-grade drift/conflict verdicts
- complete relationship-graph diagnosis across a long series
- broad real-world search-quality claims (the search tests prove *plumbing and deterministic recall*, not human-judged relevance)
- character chat / reader roleplay

## Try it fast

- **Hosted demo**: <https://smart-writer-vq8j.vercel.app/demo>
- One-click login at `/demo` — no sign-up, no personal API key
- Walks the write → review → story-memory flow over a seeded 3-chapter world

## Local development

Prerequisites: Node.js + Corepack, Supabase (an existing project or Supabase CLI + Docker for local), and an `OPENROUTER_API_KEY`.

```bash
corepack prepare pnpm@10.25.0 --activate
pnpm install
```

**A. Local Supabase** — bring the DB up first, then fill `.env.local` from its output:

```bash
supabase start
supabase db reset --local
supabase status -o env       # read the URL / anon key
cp .env.example .env.local   # fill those + OPENROUTER_API_KEY
pnpm dev
```

**B. Existing Supabase project** — fill your project's URL/anon key and run:

```bash
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_* + OPENROUTER_API_KEY
pnpm dev
```

Open `http://localhost:3000`.

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`.
Optional: `SUPABASE_SERVICE_ROLE_KEY` (admin/cleanup flows), `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` (enables the `/demo` one-click login; **fails closed when unset**).

### Sample data (bring your own manuscript)

The committed test fixtures use a small **original, fictional sample corpus** — so the test suite runs out of the box for anyone who clones this repo.

Evaluation scripts that operate on real manuscripts read from `references/test-data/`, which is `.gitignore`d by design. Drop your own chapters there to run the extraction-quality harness against real prose; manuscript data placed there is not tracked or committed by ordinary Git operations.

```bash
pnpm seed:e2e          # seed repeatable demo data
pnpm cleanup:e2e       # dry run
pnpm cleanup:e2e:apply # actually delete
```

## Project structure

```text
src/
  app/
    (auth)/        login, signup
    (dashboard)/   projects, planning, Codex, search, foreshadows
    (write)/       full-screen write workspace
  components/
    ui/            shared shadcn/ui primitives
    write/         write workspace (editor, codex panel, d3 graph)
    planning/      four-block planning workspace
  lib/
    services/      extraction, embedding, search, RAG, canon facts
    auth/          ownership guards
    supabase/      server client + middleware
    design-tokens.ts
supabase/migrations/   schema, RLS policies, RPCs (+ verify/rollback companions)
tests/                 unit, integration, e2e
```

## About this repository

> This is a curated public snapshot of a private working repo, published as a portfolio artifact. Development history, internal design docs, and the author's own manuscript data are kept private.

## License

**Source-available, not open source.** Published for portfolio and evaluation purposes. Reading, reviewing, and running it locally to evaluate the work is fine; reuse in a product, redistribution, or derivative works are not permitted without written permission. See [LICENSE](./LICENSE).
