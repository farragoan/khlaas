#!/usr/bin/env bash
# CI-safe migration check. Never touches a real database.
#
# Static checks always run. The live up/down/up round-trip runs only when
# DATABASE_URL points at localhost / 127.0.0.1 (a scratch or CI service
# Postgres); any other host is refused, so a stray production URL cannot be
# migrated or dropped by this script.
set -euo pipefail
cd "$(dirname "$0")/.."
DBMATE=./node_modules/.bin/dbmate
DIR=db/migrations

echo "== static checks"
shopt -s nullglob
files=("$DIR"/*.sql)
[ ${#files[@]} -gt 0 ] || { echo "no migrations in $DIR"; exit 1; }
prev=""
for f in "${files[@]}"; do
  b=$(basename "$f")
  [[ "$b" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]] || { echo "bad name: $b"; exit 1; }
  grep -q '^-- migrate:up' "$f"   || { echo "$b: missing '-- migrate:up'"; exit 1; }
  grep -q '^-- migrate:down' "$f" || { echo "$b: missing '-- migrate:down'"; exit 1; }
  v=${b%%_*}
  [ "$v" != "$prev" ] || { echo "duplicate version $v"; exit 1; }
  prev=$v
done
echo "${#files[@]} migrations OK"
want=$(for f in "${files[@]}"; do b=$(basename "$f"); echo "  \"${b%%_*}\","; done)
have=$(grep -E '^  "[0-9]{14}",$' lib/health/migration-versions.ts)
[ "$want" = "$have" ] || { echo "lib/health/migration-versions.ts is out of sync with $DIR"; exit 1; }

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set: skipping live round-trip"; exit 0
fi
case "$DATABASE_URL" in
  *@localhost[:/?]*|*@127.0.0.1[:/?]*|*://localhost[:/?]*|*://127.0.0.1[:/?]*) ;;
  *) echo "refusing live check: DATABASE_URL is not localhost/127.0.0.1"; exit 1 ;;
esac

echo "== up / down / up on scratch database"
$DBMATE --no-dump-schema drop
$DBMATE --no-dump-schema up
for _ in "${files[@]}"; do $DBMATE --no-dump-schema rollback; done
n=$($DBMATE status | sed -n 's/^Applied: *\([0-9]*\).*/\1/p')
[ "$n" = "0" ] || { echo "expected 0 applied after full rollback, got '$n'"; exit 1; }
$DBMATE --no-dump-schema up

echo "== schema.sql matches migrations"
$DBMATE --migrations-table schema_migrations dump >/dev/null
git diff --exit-code -I '^-- Dumped' -I 'restrict dbmate' -I '^$' -- db/schema.sql \
  || { echo "db/schema.sql is stale: run 'pnpm db:up' on a scratch DB and commit it"; exit 1; }
echo "OK"
