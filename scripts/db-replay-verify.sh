#!/usr/bin/env bash
# ============================================================================
# Baseline fresh-replay verification (P1.1)
# ============================================================================
# Spins up a DISPOSABLE pgvector Postgres container, replays the migration
# chain in the EXACT filename-sort order `supabase db reset` uses:
#
#   _replay_test_prelude.sql        (Supabase shims — companions/, not a migration)
#   20260221120000_remote_baseline.sql
#   20260515120000_security_*.sql
#   20260515123154_integrity_*.sql
#   20260515130000_status_*.sql
#   20260515140000_search_*.sql
#
# then runs every verify companion. Any SQL error (ON_ERROR_STOP=1) or any
# RAISE EXCEPTION in a verify companion fails the run with a non-zero exit.
#
# This NEVER touches the remote Supabase project. It is the gate that must
# pass before `supabase db push` is un-gated.
#
# Usage:   scripts/db-replay-verify.sh
# Requires: docker
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG_DIR="$REPO_ROOT/supabase/migrations"
COMP_DIR="$MIG_DIR/companions"

IMAGE="${PGVECTOR_IMAGE:-pgvector/pgvector:pg16}"
CONTAINER="sw-replay-verify-$$"
PGPW="replaytest"
CLEANED=0

cleanup() {
  if [ "$CLEANED" = "0" ]; then
    CLEANED=1
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

note() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  OK\033[0m  %s\n' "$*"; }
fail() { printf '\033[1;31mFAIL\033[0m  %s\n' "$*" >&2; }

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not running. Start Docker and re-run."
  exit 2
fi

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  note "Using cached $IMAGE"
else
  note "Pulling $IMAGE"
  docker pull "$IMAGE" >/dev/null
fi

note "Starting disposable Postgres container ($CONTAINER)"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PGPW" \
  -e POSTGRES_DB=postgres \
  "$IMAGE" >/dev/null

# Wait for readiness.
for i in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  [ "$i" = "60" ] && { fail "Postgres did not become ready in 60s"; exit 3; }
  sleep 1
done
ok "Postgres ready"

# psql wrapper: strict, stop on first error, quiet.
run_sql() {
  local label="$1" file="$2"
  docker exec -i -e PGPASSWORD="$PGPW" "$CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f - < "$file" \
    || { fail "$label  ($file)"; exit 4; }
  ok "$label"
}

note "Applying Supabase-shim prelude (companions/_replay_test_prelude.sql)"
run_sql "prelude" "$COMP_DIR/_replay_test_prelude.sql"

note "Replaying migrations in filename-sort order"
# Mirror `supabase db reset`: lexical sort of supabase/migrations/*.sql.
# (bash 3.2 on macOS has no `mapfile`; read the sorted list line by line.)
MIG_COUNT=0
while IFS= read -r m; do
  [ -z "$m" ] && continue
  run_sql "migrate  $(basename "$m")" "$m"
  MIG_COUNT=$((MIG_COUNT + 1))
done < <(find "$MIG_DIR" -maxdepth 1 -name '*.sql' -type f | sort)
[ "$MIG_COUNT" -eq 0 ] && { fail "no migrations found"; exit 5; }

note "Running verify companions"
# Verify companions pair 1:1 with forward migrations (+ the baseline verify).
# *.rollback.sql and _replay_*.sql are intentionally skipped (no *.verify.).
# Behavioral DO-blocks self-skip (RAISE NOTICE 'SKIPPED') on the empty replay
# DB; the baseline verify hard-asserts the full public-schema inventory.
VERIFY_COUNT=0
while IFS= read -r v; do
  [ -z "$v" ] && continue
  run_sql "verify   $(basename "$v")" "$v"
  VERIFY_COUNT=$((VERIFY_COUNT + 1))
done < <(find "$COMP_DIR" -maxdepth 1 -name '*.verify.sql' -type f | sort)
[ "$VERIFY_COUNT" -eq 0 ] && { fail "no verify companions found"; exit 6; }

note "Running LOCAL-ONLY behavioral fixtures (*.fixture.sql)"
# Behavioral fixtures perform INSERT/UPDATE/DELETE and are therefore run ONLY
# here, against this disposable replay container. They are NEVER part of the
# remote apply/verify path (which executes only *.verify.sql). Each fixture is
# expected to wrap its work in a transaction it rolls back. Fixtures are
# optional: zero is fine.
FIXTURE_COUNT=0
while IFS= read -r fx; do
  [ -z "$fx" ] && continue
  run_sql "fixture  $(basename "$fx")" "$fx"
  FIXTURE_COUNT=$((FIXTURE_COUNT + 1))
done < <(find "$COMP_DIR" -maxdepth 1 -name '*.fixture.sql' -type f | sort)
ok "behavioral fixtures: $FIXTURE_COUNT"

note "RESULT"
ok "Fresh replay + all verify companions passed on $IMAGE"
echo "    migrations replayed: $MIG_COUNT   verify companions: $VERIFY_COUNT"
echo "    => baseline reproduces the remote public schema; db push gate may be lifted."
