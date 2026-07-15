#!/usr/bin/env bash
set -euo pipefail

supabase start
supabase db reset --local

status_env="$(supabase status -o env | awk '/^[A-Z_][A-Z0-9_]*=/{print}')"
eval "$status_env"

: "${API_URL:?supabase status did not provide API_URL}"
: "${ANON_KEY:?supabase status did not provide ANON_KEY}"
: "${SERVICE_ROLE_KEY:?supabase status did not provide SERVICE_ROLE_KEY}"

export NODE_TLS_REJECT_UNAUTHORIZED=0
export SMART_WRITER_INTEGRATION_TESTS=1
export SUPABASE_TEST_URL="$API_URL"
export SUPABASE_TEST_ANON_KEY="$ANON_KEY"
export SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

pnpm vitest run --config vitest.integration.config.mts \
  tests/integration/search-rag-db-backed.test.ts \
  tests/integration/fact-canon-db-flow.test.ts \
  tests/integration/suggestion-db-flow.test.ts

# Authenticated E2E against the same local Supabase. The spec covers
# login -> seeded project -> draft autosave persistence (no LLM calls),
# so a placeholder OpenRouter key is fine.
export SMART_WRITER_AUTH_E2E_TESTS=1
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-ci-openrouter-key}"
export SMART_WRITER_SKIP_EMBEDDINGS=1

pnpm exec playwright test tests/e2e/authenticated-project.spec.ts
