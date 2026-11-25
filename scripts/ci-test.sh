#!/usr/bin/env bash
# Tests with the 90% coverage gate, for CI and locally: api + contracts (root vitest) on real PostgreSQL 16, then web.
# In CI (GitHub-hosted runner, Docker available) the API tests use a PostgreSQL 16 container with pgvector, so the
# vector(768) + HNSW path of migration 0004 is tested; elsewhere api/test/global-setup.ts starts an embedded
# PostgreSQL 16 without pgvector (the brute-force path). PG_IMAGE picks another image.
set -euo pipefail
if [[ -z "${TEST_DATABASE_URL:-}" && -n "${CI:-}" ]] && command -v docker >/dev/null 2>&1; then
  image="${PG_IMAGE:-pgvector/pgvector:pg16}"
  docker run -d --rm --name slm-test-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=slm_test \
    -p 5432:5432 "$image" >/dev/null
  trap 'docker stop slm-test-pg >/dev/null 2>&1 || true' EXIT
  for _ in $(seq 1 60); do
    docker exec slm-test-pg pg_isready -U test -d slm_test >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec slm-test-pg pg_isready -U test -d slm_test >/dev/null
  export TEST_DATABASE_URL=postgres://test:test@localhost:5432/slm_test
fi
npx vitest run --coverage
npm run test:coverage -w web
