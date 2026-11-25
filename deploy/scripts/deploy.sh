#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/khlaas
APP_USER=khlaas
ENV_DIR=/etc/khlaas
ENV_FILE="${ENV_DIR}/khlaas.env"
FIRST_RUN=false

usage() {
  echo "Usage: $0 [--first-run] <git-ref>" >&2
  exit 2
}

if [[ "${1:-}" == "--first-run" ]]; then
  FIRST_RUN=true
  shift
fi
[[ $# -eq 1 ]] || usage
GIT_REF=$1
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

as_root() {
  if (( EUID == 0 )); then
    "$@"
  else
    sudo "$@"
  fi
}

as_app_user() {
  if (( EUID == 0 )); then
    runuser -u "$APP_USER" -- "$@"
  else
    sudo -u "$APP_USER" -- "$@"
  fi
}

if $FIRST_RUN; then
  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    as_root useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
  fi
  as_root install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_DIR"
  as_root install -d -o root -g "$APP_USER" -m 0750 "$ENV_DIR"
  as_root install -d -o root -g root -m 0700 /var/backups/khlaas
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  if ! $FIRST_RUN; then
    echo "$APP_DIR is not a git checkout; run with --first-run" >&2
    exit 1
  fi
  if [[ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "$APP_DIR is non-empty but has no .git directory" >&2
    exit 1
  fi
  REMOTE_URL="${KHLAAS_GIT_REMOTE:-$(git -C "$SOURCE_ROOT" remote get-url origin 2>/dev/null || true)}"
  if [[ -z "$REMOTE_URL" ]]; then
    echo "Set KHLAAS_GIT_REMOTE to the repository URL for the first clone" >&2
    exit 1
  fi
  as_app_user git clone --no-checkout "$REMOTE_URL" "$APP_DIR"
fi

as_app_user git -C "$APP_DIR" fetch --prune origin
as_app_user git -C "$APP_DIR" fetch origin "$GIT_REF"
as_app_user git -C "$APP_DIR" checkout --detach FETCH_HEAD

if $FIRST_RUN; then
  shopt -s nullglob
  for unit in "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.timer; do
    as_root install -o root -g root -m 0644 "$unit" /etc/systemd/system/
  done
  shopt -u nullglob
  as_root systemctl daemon-reload
  as_root systemctl enable khlaas-web.service khlaas-worker.service khlaas-sweep.timer khlaas-backup.timer
fi

if [[ ! -f "$ENV_FILE" ]]; then
  as_root install -o root -g "$APP_USER" -m 0640 "$APP_DIR/deploy/khlaas.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE from the example. Replace placeholders, then rerun this deploy." >&2
  exit 1
fi

# Install dev dependencies too: tsx runs the worker/sweep and dbmate applies migrations.
as_app_user /bin/bash -c '
  set -euo pipefail
  set -a
  source /etc/khlaas/khlaas.env
  set +a
  export HOME=/opt/khlaas
  export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  cd /opt/khlaas
  corepack pnpm install --frozen-lockfile
  NEXT_PUBLIC_BASE_PATH=/khlaas corepack pnpm build
  corepack pnpm db:up
'
as_app_user install -d -m 0755 "$APP_DIR/.next/cache"

as_root systemctl restart khlaas-web.service khlaas-worker.service
if $FIRST_RUN; then
  as_root systemctl restart khlaas-sweep.timer khlaas-backup.timer
fi

for _ in {1..30}; do
  if curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3100/khlaas/; then
    echo "khlaas is healthy at http://127.0.0.1:3100/khlaas/"
    exit 0
  fi
  sleep 2
done

echo "khlaas failed its HTTP health check" >&2
as_root systemctl status khlaas-web.service --no-pager >&2 || true
exit 1
