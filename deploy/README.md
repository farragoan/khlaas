# Self-hosted deployment runbook

The public URL is `https://dhruvnagpal.in/khlaas/`. Cloudflare sends matching requests through the `khlaas-edge` Worker and its VPC service to Next.js on `127.0.0.1:3100`. The web app, pg-boss worker and housekeeping sweep run as `khlaas`; PostgreSQL 16 runs in the existing `bydhruv-db` Docker container.

## Prerequisites

Provision Node 22 under `/opt/node/bin`, Docker, the Cloudflare Tunnel and the VPC service before deploying. Run the commands below on the Ubuntu ARM server from a git checkout as a sudo-capable user. The checkout needs an `origin` remote; alternatively set `KHLAAS_GIT_REMOTE` for the first clone. Do not use a production-only install: `tsx` (worker and sweep) and `dbmate` (migrations) are dev dependencies installed by the deployment script.

There is no public, unauthenticated health endpoint. Deployment checks `GET http://127.0.0.1:3100/khlaas/`; `/khlaas/api/admin/health` is an authenticated admin endpoint, not a load-balancer health check.

## First install

```sh
bash deploy/scripts/deploy.sh --first-run main
# The script creates /etc/khlaas/khlaas.env from the example and stops.
sudoedit /etc/khlaas/khlaas.env
bash deploy/scripts/deploy.sh --first-run main
```

First-run mode creates the `khlaas` system user, `/opt/khlaas`, `/etc/khlaas` and `/var/backups/khlaas`, installs all systemd units, enables the services and timers, then performs a normal deployment. Reuse `--first-run` after changing unit files to reinstall them; subsequent routine deploys omit it.

The web app uses Next.js directly through Node, not pnpm at runtime. The worker and sweep invoke their TypeScript entrypoints through the installed `tsx` binary. All three load `/etc/khlaas/khlaas.env`.

## Deploy and migrations

```sh
bash deploy/scripts/deploy.sh <branch-tag-or-commit>
```

The script fetches and detaches `/opt/khlaas` at the requested ref, loads the environment file, runs `corepack pnpm install --frozen-lockfile`, builds with `NEXT_PUBLIC_BASE_PATH=/khlaas`, applies migrations, restarts `khlaas-web` and `khlaas-worker`, and polls the local app URL.

Migrations live in `db/migrations` and are applied by `corepack pnpm db:up`, which runs the repository-pinned dbmate 2.37.0 CLI. The npm `dbmate` package and its `@dbmate/linux-arm64` optional binary are installed by pnpm on the server, so no global dbmate installation is needed. `DATABASE_URL` controls the target; check pending migrations with `corepack pnpm db:status`.

Useful checks:

```sh
systemctl status khlaas-web khlaas-worker
journalctl -u khlaas-web -u khlaas-worker -n 100 --no-pager
systemctl list-timers khlaas-sweep.timer khlaas-backup.timer
curl -i http://127.0.0.1:3100/khlaas/
```

## Rollback

Deploy a known-good application commit:

```sh
bash deploy/scripts/deploy.sh <previous-commit-sha>
```

Application rollback does not reverse database migrations. Confirm that the old code is compatible with the current schema before rolling back; use a reviewed `dbmate down` migration or a database restore only when necessary. Rolling back the edge Worker is a separate operation (see below).

## Backups and restore

`khlaas-backup.timer` runs nightly at 21:30 UTC (with `Persistent=true` for missed runs). The root service executes `docker exec bydhruv-db pg_dump -U postgres -Fc khlaas`, rejects failed or empty dumps, and atomically renames a mode-600 temporary file into `/var/backups/khlaas/khlaas-YYYYmmddTHHMMSSZ.dump`. Dumps older than 14 days are deleted.

```sh
sudo systemctl start khlaas-backup.service       # manual backup
sudo systemctl status khlaas-backup.service
sudo ls -l /var/backups/khlaas
```

For restore, stop writers first, choose the dump deliberately, then restore the custom-format archive:

```sh
sudo systemctl stop khlaas-web khlaas-worker
sudo sh -c 'docker exec -i bydhruv-db pg_restore -U postgres -d khlaas --clean --if-exists < /var/backups/khlaas/khlaas-YYYYmmddTHHMMSSZ.dump'
bash deploy/scripts/deploy.sh <known-good-commit>
```

Test restores on a separate database before relying on them. A restore can destroy current data.

## Cloudflare Worker

From `deploy/cloudflare-worker` on a machine authenticated to the correct Cloudflare account:

```sh
npm ci
npm run typecheck
npm test
npx wrangler deploy
```

The configuration deploys `khlaas-edge` without a `workers.dev` route, attaches only `dhruvnagpal.in/khlaas*`, and binds VPC service `01a213b1-fe52-7b41-abba-37734fc7ab9c` as `KHLAAS`. Paths outside `/khlaas` and `/khlaas/...` pass to the normal origin. Client-supplied forwarding headers are stripped; Next.js and Clerk receive `X-Forwarded-Host: dhruvnagpal.in`, `X-Forwarded-Proto: https`, and the Cloudflare client IP.

To roll back only the Worker, run `npx wrangler rollback` from the same directory and select a previous deployment. This does not change application code, its VPC service, or the database.
