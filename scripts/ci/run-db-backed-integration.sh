#!/usr/bin/env bash
set -euo pipefail

supabase start
supabase db reset --local

status_env="$(supabase status -o env | awk '/^[A-Z_][A-Z0-9_]*=/{print}')"
eval "$status_env"

: "${API_URL:?supabase status did not provide API_URL}"
: "${ANON_KEY:?supabase status did not provide ANON_KEY}"
: "${SERVICE_ROLE_KEY:?supabase status did not provide SERVICE_ROLE_KEY}"

export SMART_WRITER_INTEGRATION_TESTS=1
export SUPABASE_TEST_URL="$API_URL"
export SUPABASE_TEST_ANON_KEY="$ANON_KEY"
export SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

pnpm vitest run --config vitest.integration.config.mts \
  tests/integration/db-runner-environment.test.ts \
  tests/integration/llm-budget-db-backed.test.ts \
  tests/integration/chapter-create.test.ts \
  tests/integration/search-rag-db-backed.test.ts \
  tests/integration/qa-chapter-rpc-compatibility.test.ts \
  tests/integration/fact-canon-db-flow.test.ts \
  tests/integration/suggestion-db-flow.test.ts \
  tests/integration/relation-review-db-backed.test.ts \
  tests/integration/codex-entity-atomic-mutations.test.ts

# Authenticated E2E uses the same local Supabase, a synthetic local limit,
# and a dummy AI key. Draft autosave stays free; full save is budget-blocked.
export SMART_WRITER_AUTH_E2E_TESTS=1
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export OPENROUTER_API_KEY="ci-openrouter-key-no-paid-ai"
export SMART_WRITER_SKIP_EMBEDDINGS=1
export SMART_WRITER_LLM_MONTHLY_BUDGET_USD=0.1
export SMART_WRITER_ADMIN_USER_IDS="a2000000-0000-4000-8000-000000000001"

pnpm exec playwright test tests/e2e/authenticated-project.spec.ts tests/e2e/ai-budget-save.spec.ts tests/e2e/admin-readonly.spec.ts tests/e2e/pc-writing.spec.ts tests/e2e/write-return.spec.ts

# Actual save/indexing/job/polling flow with a malformed mocked Stage 2 response.
# The preload intercepts every OpenRouter request; no real provider is called.
export SMART_WRITER_EXTRACTION_FAILURE_E2E=1
export OPENROUTER_API_KEY="local-extraction-no-paid-ai"
export NODE_OPTIONS="--require $PWD/tests/e2e/helpers/mock-extraction-provider.cjs"
pnpm exec playwright test tests/e2e/extraction-failure-save.spec.ts
