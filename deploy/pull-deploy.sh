#!/usr/bin/env bash
# Pull latest origin/main from GitHub, rebuild, and reload Reach under PM2.
# Triggered by the admin "Deploy" button (Settings → Deployment), or run by hand.
# Logs to deploy/last-deploy.log. Spawned detached so it survives the pm2 reload at the end.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
LOG=deploy/last-deploy.log
: > "$LOG"
exec >>"$LOG" 2>&1

echo "=== Reach deploy started $(date -u +%FT%TZ) ==="
set -x

git fetch --all --prune                || { echo "git fetch FAILED";    exit 1; }
git reset --hard origin/main           || { echo "git reset FAILED";    exit 1; }

# The repo ships schema.prisma with provider="sqlite" (local dev). Prod is Postgres —
# re-apply the provider patch after every pull (git reset reverts it).
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

npm ci --no-audit --no-fund            || { echo "npm ci FAILED";        exit 1; }
npx prisma generate                    || { echo "prisma generate FAILED"; exit 1; }
# Additive schema changes apply; destructive ones abort the deploy (no --accept-data-loss on purpose).
npx prisma db push --skip-generate     || { echo "prisma db push FAILED — schema change may need manual handling"; exit 1; }
npm run build                          || { echo "build FAILED";         exit 1; }
pm2 reload reach --update-env          || { echo "pm2 reload FAILED";     exit 1; }

set +x
echo "=== Reach deploy OK $(date -u +%FT%TZ) ==="
