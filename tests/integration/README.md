# Integration Tests

Use this folder for tests that connect multiple modules or require real adapters such as Supabase, repository/service combinations, or API boundaries.

These tests are intentionally excluded from the default unit suite and run with:

```bash
npm run test:integration
```

DB-backed tests are opt-in. By default they are skipped to avoid accidental remote writes.

```bash
SMART_WRITER_INTEGRATION_TESTS=1 \
SUPABASE_TEST_URL=https://127.0.0.1:55431 \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
npm run test:integration
```

Remote Supabase execution requires the additional explicit flag:

```bash
ALLOW_REMOTE_INTEGRATION_TESTS=1
```

## Search/RAG DB-Backed Runner

`search-rag-db-backed.test.ts` is stricter than the generic integration helper:

- It refuses non-local Supabase URLs even when `ALLOW_REMOTE_INTEGRATION_TESTS=1` is set.
- It requires `SUPABASE_TEST_ANON_KEY` because BM25 RPCs must be called through an authenticated project owner session.
- It uses the service-role client only for local seed setup and cleanup.
- It inserts deterministic 1536-dimensional test embeddings and verifies vector `match_chunks` through the authenticated project owner session.
- It currently covers the compact `blackiron` and `lastplayer` seed contracts.
- `blackiron`: 6 BM25 entity/chapter expectations, 3 vector chunk expectations, and 1 graph expansion expectation.
- `lastplayer`: 3 BM25 entity/chapter expectations, 2 vector chunk expectations, and 1 graph expansion expectation.
- It also summarizes each seed's DB-backed results at Top-3 and Top-8; Top-8 is asserted to have full expected-id recall.
- It writes ignored JSON artifacts to `test-results/search-rag-recall/{seed}.json` with the Top-3/Top-8 summary, case-level evaluations, and raw ranked results.

```bash
SMART_WRITER_INTEGRATION_TESTS=1 \
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_ANON_KEY=... \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
npm run test:integration -- tests/integration/search-rag-db-backed.test.ts
```

If the local Supabase API is served through self-signed TLS, run with:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0
```

CI has a separate non-skipped job named `DB-backed Search/RAG plumbing regression`.
It starts local Supabase, resets the local DB from repo migrations, exports the local `ANON_KEY` and `SERVICE_ROLE_KEY`, and runs only `tests/integration/search-rag-db-backed.test.ts`.

Verified local run:

- `npm run db:replay-verify` passed against a disposable pgvector container.
- `supabase db reset --local` replayed the repo migrations into local Supabase.
- The Search/RAG DB-backed runner passed against `https://127.0.0.1:55431`.
- The test cleanup removed seeded project rows, cascaded child rows, and the local auth user.
