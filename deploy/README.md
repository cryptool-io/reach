# Deploying Reach to ronserver2 (production)

Live at **https://reach.cryptool.io** — Ubuntu 24.04, behind nginx, run by PM2, on PostgreSQL 16.
This is a **shared** server (12+ other PM2 apps); everything here is scoped to `reach` and additive.

## Layout / facts

| Thing | Value |
|---|---|
| SSH | `ssh -p 2222 ronz@62.131.162.12` (key `ronz_server`) |
| App dir | `/data/www/main/reach` |
| Process | PM2 app `reach` — **fork mode, 1 instance** (the in-process 60s scheduler must not be duplicated) |
| Port | `127.0.0.1:3400` (nginx proxies to it) |
| DB | PostgreSQL 16 on `localhost:5432`, database `reach_db`, role `reach_user` |
| nginx vhost | `/etc/nginx/sites-available/reach.cryptool.io` → `127.0.0.1:3400` |
| TLS | Let's Encrypt via `certbot --nginx` (auto-renews) |
| Env | `/data/www/main/reach/.env` (chmod 600), loaded by Node `--env-file` |

`schema.prisma` ships with `provider = "sqlite"` (local dev). The deploy **patches it to `postgresql`**
on the server — see step 3. Don't commit a postgres provider into the repo.

## First-time setup (already done — recorded for reference)

1. **DB + secrets** — create `reach_user`/`reach_db`, generate `.env` with a random DB password and
   `APP_SESSION_SECRET` (`openssl rand -hex`), set `ORIGIN`/`PUBLIC_BASE_URL=https://reach.cryptool.io`.
   See `reach.env.example`.
2. **nginx** — `sudo cp deploy/nginx-reach.cryptool.io.conf /etc/nginx/sites-available/reach.cryptool.io`,
   symlink into `sites-enabled`, `sudo nginx -t && sudo systemctl reload nginx`,
   then `sudo certbot --nginx -d reach.cryptool.io --redirect`.

## Redeploy (push new code from your dev machine)

```bash
# 1. From the local repo root — package source (no node_modules/.svelte-kit/build/dev.db/.env):
tar czf /tmp/reach-src.tgz --exclude=./node_modules --exclude=./.svelte-kit --exclude=./build \
  --exclude=./.git --exclude=./.env --exclude='./prisma/dev.db*' --exclude='./_*' \
  --exclude='./deploy/reach-data.json' -C /path/to/reach .
scp -P 2222 /tmp/reach-src.tgz ronz@62.131.162.12:/tmp/

# 2. On the server — extract, re-patch schema to postgres, install/build, reload:
ssh -p 2222 ronz@62.131.162.12 'cd /data/www/main/reach &&
  tar xzf /tmp/reach-src.tgz &&
  sed -i "s/provider = \"sqlite\"/provider = \"postgresql\"/" prisma/schema.prisma &&
  npm ci --no-audit --no-fund &&
  npx prisma generate &&
  npx prisma db push --skip-generate &&   # only if schema/models changed
  npm run build &&
  pm2 reload reach --update-env'
```

`pm2 reload` is zero-downtime-ish (graceful). `pm2 logs reach` to watch, `pm2 save` after adding the app.

## Data migration (SQLite dev → Postgres prod, one-time)

```bash
node deploy/export-sqlite.mjs                              # local: dumps to deploy/reach-data.json
scp -P 2222 deploy/reach-data.json ronz@62.131.162.12:/data/www/main/reach/deploy/
ssh -p 2222 ronz@62.131.162.12 'cd /data/www/main/reach && node --env-file=.env deploy/import-postgres.mjs'
# verifies row counts; delete reach-data.json from both ends afterwards (it contains all prospect data).
```

## Operate

```bash
pm2 status reach          # health / restarts
pm2 logs reach            # live logs (scheduler ticks, sends)
pm2 restart reach         # restart
sudo systemctl reload nginx
# DB shell:
cd /data/www/main/reach && PGPASSWORD=$(grep -oP 'reach_user:\K[^@]+' .env) psql -h localhost -U reach_user -d reach_db
```

## To turn on the AI agents
Set `ANTHROPIC_API_KEY=` in `/data/www/main/reach/.env`, then `pm2 restart reach --update-env`.

## Notes
- PM2 resurrects `reach` on reboot (`pm2 save` already run; `pm2-ronz.service` active).
- The cert auto-renews (certbot systemd timer). `sudo certbot renew --dry-run` to test.
- Backups: `reach_db` is a normal PG database — add it to the server's pg_dump routine if desired:
  `pg_dump reach_db`.
