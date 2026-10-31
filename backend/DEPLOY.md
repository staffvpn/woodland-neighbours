# Deploying Woodland Neighbours

**Live now:**
- Backend (Worker + D1): https://woodland-neighbours.etomoyapochta1111.workers.dev
- Frontend: https://woodland-neighbours-frontend.etomoyapochta1111.workers.dev

## One-time setup

1. Create a Cloudflare API token at https://dash.cloudflare.com/profile/api-tokens
   → Custom Token → permissions: Account / Workers Scripts / Edit, Account / D1 / Edit,
   Account / Cloudflare Pages / Edit (all three — Pages is needed even though the
   frontend deploy no longer uses the classic Pages API, see below).
   (Prior projects on this machine hit an OAuth callback issue with `wrangler login`
   — use a token via `CLOUDFLARE_API_TOKEN` env var instead of logging in interactively.)
2. Create the D1 database: `cd backend && npx wrangler d1 create woodland-neighbours`.
   Copy the returned `database_id` into `wrangler.toml`'s `database_id` field.
3. Apply migrations: `npm run db:migrate:remote`.
4. Set the bot token secret: `npx wrangler secret put BOT_TOKEN` (paste the token when
   prompted, or pipe it in non-interactively: `printf '%s' "$TOKEN" | npx wrangler secret put BOT_TOKEN`).
5. Deploy the Worker: `npm run deploy`. Note the returned `*.workers.dev` URL.
6. In `frontend/.env.production`, set `VITE_API_BASE` to that Worker URL (copy
   `.env.production.example` as a starting point).
7. Build the frontend: `cd frontend && npm run build`.
8. Deploy the frontend — **note:** current `wrangler` (4.156+) auto-migrates
   `wrangler pages` commands to the unified Workers+Assets model the first time you
   run them against a project that doesn't exist yet. The straightforward path:
   `cd frontend && npx wrangler pages project create woodland-neighbours-frontend --production-branch=master`
   — this builds, creates the project, and deploys in one step, and writes
   `wrangler.jsonc` + adds `@cloudflare/vite-plugin`/`wrangler` as devDependencies
   (already committed). For repeat deploys after that, just `npm run deploy` in
   `frontend/` works directly (added to `package.json` by the same migration).
   If this auto-migration ever fails partway (it did once during initial setup —
   watch for it modifying `vite.config.ts`'s `preview` script to require `wrangler dev`
   instead of plain `vite preview`, and for it merging the Cloudflare Vite plugin into
   the same config Vitest reads, which breaks `npm test` with "There is already a
   server associated with the config" — this is why `vitest.config.ts` is a separate
   file from `vite.config.ts` here, deliberately), `git checkout` the affected files
   and retry, or pass `--force` to use the classic Pages API directly instead.
9. Point the Telegram bot's Mini App URL (via @BotFather → Bot Settings →
   Menu Button, or the Mini App URL field) at the deployed frontend URL.

## Repeat deploys

- Backend: `cd backend && npm run deploy`.
- Frontend: `cd frontend && npm run deploy` (runs `npm run build && wrangler deploy`
  using the committed `wrangler.jsonc`).
- New migrations: add a new numbered file under `backend/migrations/`, then
  `npm run db:migrate:remote`.
