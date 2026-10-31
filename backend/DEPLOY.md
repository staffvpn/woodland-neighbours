# Deploying Woodland Neighbours

## One-time setup

1. Create a Cloudflare API token at https://dash.cloudflare.com/profile/api-tokens
   → Custom Token → permissions: Account / Workers Scripts / Edit, Account / D1 / Edit.
   (Prior projects on this machine hit an OAuth callback issue with `wrangler login`
   — use a token via `CLOUDFLARE_API_TOKEN` env var instead of logging in interactively.)
2. Create the D1 database: `cd backend && npx wrangler d1 create woodland-neighbours`.
   Copy the returned `database_id` into `wrangler.toml`'s `database_id` field.
3. Apply migrations: `npm run db:migrate:remote`.
4. Set the bot token secret: `npx wrangler secret put BOT_TOKEN` (paste the token when prompted).
5. Deploy the Worker: `npm run deploy`. Note the returned `*.workers.dev` URL.
6. In `frontend/.env.production`, set `VITE_API_BASE` to that Worker URL (copy
   `.env.production.example` as a starting point).
7. Build the frontend: `cd frontend && npm run build`.
8. Deploy the `frontend/dist` folder to Cloudflare Pages (via the dashboard's
   "upload assets" flow, or `npx wrangler pages deploy dist` once a Pages
   project is created).
9. Point the Telegram bot's Mini App URL (via @BotFather → Bot Settings →
   Menu Button, or the Mini App URL field) at the deployed Pages URL.

## Repeat deploys

- Backend: `cd backend && npm run deploy`.
- Frontend: `cd frontend && npm run build && npx wrangler pages deploy dist`.
- New migrations: add a new numbered file under `backend/migrations/`, then
  `npm run db:migrate:remote`.
