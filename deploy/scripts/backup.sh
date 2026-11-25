#!/usr/bin/env bash
set -euo pipefail

umask 077
BACKUP_DIR="${BACKUP_DIR:-/var/backups/khlaas}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DESTINATION="${BACKUP_DIR}/khlaas-${TIMESTAMP}.dump"
TEMPORARY=""

cleanup() {
  if [[ -n "$TEMPORARY" && -f "$TEMPORARY" ]]; then
    rm -f -- "$TEMPORARY"
  fi
}
trap cleanup EXIT

install -d -o root -g root -m 0700 "$BACKUP_DIR"
TEMPORARY="$(mktemp "${DESTINATION}.tmp.XXXXXX")"

if ! docker exec bydhruv-db pg_dump -U postgres -Fc khlaas >"$TEMPORARY"; then
  echo "khlaas backup failed: pg_dump returned an error" >&2
  exit 1
fi
if [[ ! -s "$TEMPORARY" ]]; then
  echo "khlaas backup failed: pg_dump produced an empty file" >&2
  exit 1
fi

chmod 0600 "$TEMPORARY"
mv -f -- "$TEMPORARY" "$DESTINATION"
TEMPORARY=""

# Remove dumps whose modification time is more than 14 days old.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'khlaas-*.dump' -mtime +14 -delete
printf 'khlaas backup written to %s\n' "$DESTINATION"
