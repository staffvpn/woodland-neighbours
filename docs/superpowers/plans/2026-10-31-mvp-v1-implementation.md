# Woodland Neighbours MVP v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the playable MVP v1 of Woodland Neighbours — a shared forest clearing with a campfire, player houses placed by a server-side algorithm, forageable resources, placeable decorations, gifts, following, and a day/night + smoke/decay visual layer, deployed as a Telegram Mini App on Cloudflare.

**Architecture:** Cloudflare Worker (TypeScript, no framework — a manual router over `fetch`) backed by D1, exposing a small JSON API guarded by Telegram `initData` HMAC validation. React + Vite + TypeScript shell hosts an imperative Three.js scene (not react-three-fiber) for the game world; React only renders UI chrome (drawers, HUD). Backend decision logic (auth validation, placement, respawn timing, gift limits, activity status) lives in pure, unit-tested `core/*.ts` modules consumed by thin D1-wired handlers. Frontend geometry/logic that is pure math (path derivation, day/night sun state) gets the same treatment; Three.js rendering itself is verified manually via dev server + screenshots, per the spec's testing approach.

**Tech Stack:** Cloudflare Workers + D1 (backend), Vitest (unit tests, both backend and frontend pure modules), React 18 + Vite + TypeScript + Three.js (frontend), Telegram WebApp JS SDK (loaded via script tag, not an npm package), Playwright (manual visual verification), Wrangler (deploy tooling).

**Spec:** `docs/superpowers/specs/2026-10-31-mvp-v1-design.md`

## Global Constraints

- Backend is Cloudflare Workers + D1 only — no other datastore, no ORM.
- Auth is stateless: every request revalidates Telegram `initData`'s HMAC against the bot token; no session table, no JWT.
- No Cron Trigger exists in this plan. Smoke, overgrowth, and resource-node respawn are all computed lazily (on read or on the atomic update), never swept.
- No `paths` table and no `decay`/`smoke` table — both are derived values, computed from `users.last_seen_at`.
- One shared clearing, no map sharding (settlement radius grows with house count; no multi-village logic).
- Gift daily limit is exactly 3 per sender per UTC calendar day.
- Smoke visible if `now - last_seen_at < 3 days`; overgrown if `> 14 days`; "online at campfire" if `< 2 minutes`. Client polls online status every 15–30s.
- Resource node respawn is per-node, 24 hours after harvest — never a global reset.
- River is modelled as a straight north-south band (`x` in `[-3, 3]`, all `y`) for v1 — a deliberate simplification over a curved river; do not add curve geometry to the placement math.
- Frontend game world rendering is imperative Three.js, not react-three-fiber. React owns only UI chrome outside the canvas.
- Character customization (scarf/hat picker) is explicitly out of scope for v1 — defaults are assigned at account creation, no customization endpoint or UI.
- House interior, notes, visiting, and the garden mechanic are Subproject B — do not build them here.

## Review Focus

- **Tampered or expired Telegram `initData`** must be rejected with a clear 401, never silently treated as valid — users could otherwise impersonate any `telegram_id`. Covered in Task 3's tests (bad hash, stale `auth_date`).
- **Two resource harvests racing on the same node** must not both succeed — the loser should see a clear "already harvested" response, not silently overwrite state. Covered in Task 7 via an atomic conditional `UPDATE`.
- **A user with no house yet** calling house-dependent endpoints (receive gift list, place decoration) must get a clean 404, not a crash or a silently-created phantom house. Covered in Tasks 8 and 9.
- **Gift limit at the UTC day boundary** must reset exactly at midnight UTC, not at local time or a rolling 24h window. Covered in Task 9's `startOfUtcDayMs` tests.
- **Placement search exhaustion** (pathological case where no valid point exists within the search bound) must fail loudly with a catchable error rather than returning an invalid/colliding point. Covered in Task 6's placement algorithm tests.

---

## File Structure

```
woodland-neighbours/
  backend/
    package.json
    tsconfig.json
    wrangler.toml
    vitest.config.ts
    migrations/
      0001_init.sql
      0002_seed_resource_nodes.sql
    src/
      core/
        auth.ts
        activity.ts
        users.ts
        placement.ts
        resources.ts
        gifts.ts
      handlers/
        health.ts
        users.ts
        houses.ts
        resources.ts
        items.ts
        gifts.ts
        follows.ts
        campfire.ts
      router.ts
      index.ts
    test/
      core/
        auth.test.ts
        activity.test.ts
        users.test.ts
        placement.test.ts
        resources.test.ts
        gifts.test.ts
  frontend/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      telegram.ts
      api/
        client.ts
      game/
        types.ts
        scene.ts
        terrain.ts
        trees.ts
        houses.ts
        paths.ts
        character.ts
        activityVisuals.ts
        resources.ts
        campfire.ts
        daynight.ts
      ui/
        HUD.tsx
        InventoryDrawer.tsx
        DecorationDrawer.tsx
        GiftDrawer.tsx
      assets/
        textures/        (populated by Task 24)
      test/
        game/
          paths.test.ts
          daynight.test.ts
    CREDITS.md
```

---

## Task 1: Backend scaffold — D1 schema, Worker skeleton, test harness

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/wrangler.toml`
- Create: `backend/vitest.config.ts`
- Create: `backend/migrations/0001_init.sql`
- Create: `backend/migrations/0002_seed_resource_nodes.sql`
- Create: `backend/src/handlers/health.ts`
- Create: `backend/src/router.ts`
- Create: `backend/src/index.ts`
- Test: `backend/test/health.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Env` type (`{ DB: D1Database; BOT_TOKEN: string }`) in `backend/src/index.ts`, exported for use by every later handler. `handleRequest(request: Request, env: Env): Promise<Response>` in `backend/src/router.ts`, the single entry point later tasks register routes against.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "woodland-neighbours-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "db:migrate:local": "wrangler d1 migrations apply woodland-neighbours --local",
    "db:migrate:remote": "wrangler d1 migrations apply woodland-neighbours --remote"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20261001.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.90.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write `wrangler.toml`**

```toml
name = "woodland-neighbours"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "woodland-neighbours"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

- [ ] **Step 5: Write the D1 schema migration**

`backend/migrations/0001_init.sql`:

```sql
CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY,
  nickname TEXT NOT NULL,
  scarf_color TEXT NOT NULL DEFAULT '#8B4513',
  hat_style TEXT NOT NULL DEFAULT 'none',
  is_founder INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE houses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_telegram_id INTEGER NOT NULL UNIQUE REFERENCES users(telegram_id),
  shape INTEGER NOT NULL CHECK (shape IN (1, 2, 3)),
  x REAL NOT NULL,
  y REAL NOT NULL,
  placed_at INTEGER NOT NULL
);

CREATE TABLE placed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES houses(id),
  item_type TEXT NOT NULL,
  slot INTEGER NOT NULL,
  placed_at INTEGER NOT NULL
);

CREATE TABLE resource_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('branch', 'stone', 'mushroom', 'berry')),
  x REAL NOT NULL,
  y REAL NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  respawns_at INTEGER
);

CREATE TABLE inventory (
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  item_type TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (telegram_id, item_type)
);

CREATE TABLE gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  to_house_id INTEGER NOT NULL REFERENCES houses(id),
  item_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE follows (
  follower_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  followee_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  PRIMARY KEY (follower_telegram_id, followee_telegram_id)
);

CREATE INDEX idx_houses_owner ON houses(owner_telegram_id);
CREATE INDEX idx_gifts_to_house ON gifts(to_house_id);
CREATE INDEX idx_gifts_from_created ON gifts(from_telegram_id, created_at);
```

- [ ] **Step 6: Write the resource node seed migration**

`backend/migrations/0002_seed_resource_nodes.sql` (16 nodes, 4 of each type, hand-placed outside the river band `x in [-3,3]` and spread around the clearing so early players don't have to walk far):

```sql
INSERT INTO resource_nodes (type, x, y, available, respawns_at) VALUES
  ('branch', 12, 8, 1, NULL),
  ('branch', -14, 10, 1, NULL),
  ('branch', 10, -12, 1, NULL),
  ('branch', -11, -9, 1, NULL),
  ('stone', 18, 2, 1, NULL),
  ('stone', -17, 4, 1, NULL),
  ('stone', 16, -6, 1, NULL),
  ('stone', -15, -14, 1, NULL),
  ('mushroom', 7, 16, 1, NULL),
  ('mushroom', -8, 15, 1, NULL),
  ('mushroom', 9, -18, 1, NULL),
  ('mushroom', -6, -17, 1, NULL),
  ('berry', 20, 12, 1, NULL),
  ('berry', -20, 11, 1, NULL),
  ('berry', 19, -10, 1, NULL),
  ('berry', -19, -13, 1, NULL);
```

- [ ] **Step 7: Write the health handler**

`backend/src/handlers/health.ts`:

```ts
export function handleHealth(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 8: Write the router**

`backend/src/router.ts`:

```ts
import { handleHealth } from "./handlers/health";

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 9: Write the Worker entry point**

`backend/src/index.ts`:

```ts
import { handleRequest, type Env } from "./router";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
```

- [ ] **Step 10: Write the failing test**

`backend/test/health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { handleRequest, type Env } from "../src/router";

describe("GET /health", () => {
  it("returns ok:true", async () => {
    const env = {} as Env;
    const res = await handleRequest(new Request("https://x/health"), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 404 for unknown routes", async () => {
    const env = {} as Env;
    const res = await handleRequest(new Request("https://x/nope"), env);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 11: Install dependencies and run the test**

Run: `cd backend && npm install && npm test`
Expected: both tests in `health.test.ts` PASS.

- [ ] **Step 12: Commit**

```bash
cd backend
git add package.json tsconfig.json wrangler.toml vitest.config.ts migrations src test
git commit -m "feat(backend): scaffold Worker, D1 schema, health endpoint"
```

---

## Task 2: Frontend scaffold — Vite + React + TS shell, Telegram SDK bootstrap, canvas mount

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/telegram.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `getTelegramWebApp(): TelegramWebApp | null` and `getInitData(): string` from `frontend/src/telegram.ts`, used by Task 12's API client. A `<div id="game-canvas-container">` element in the DOM that Task 13 mounts the Three.js renderer into.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "woodland-neighbours-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "three": "^0.169.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.169.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Woodland Neighbours</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
      html, body, #root { margin: 0; height: 100%; overflow: hidden; background: #0b1a12; }
      #game-canvas-container { position: fixed; inset: 0; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write the Telegram bootstrap module**

`frontend/src/telegram.ts`:

```ts
export interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}
```

- [ ] **Step 6: Write `App.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegram";

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();
  }, []);

  return <div id="game-canvas-container" ref={containerRef} />;
}
```

- [ ] **Step 7: Write `main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Install dependencies and verify it builds and runs**

Run: `cd frontend && npm install && npm run dev`
Expected: Vite dev server starts without errors; opening the printed local URL in a browser shows a dark-green empty page with no console errors (the `#game-canvas-container` div is present but empty — nothing renders into it until Task 13). Stop the dev server after confirming.

- [ ] **Step 9: Commit**

```bash
cd frontend
git add package.json tsconfig.json vite.config.ts index.html src
git commit -m "feat(frontend): scaffold Vite+React+TS shell with Telegram bootstrap"
```

---

## Task 3: Auth — Telegram `initData` HMAC validation

**Files:**
- Create: `backend/src/core/auth.ts`
- Test: `backend/test/core/auth.test.ts`

**Interfaces:**
- Consumes: nothing beyond Web Crypto (`globalThis.crypto.subtle`, available in both Workers and Node 20+).
- Produces: `validateInitData(initData: string, botToken: string, nowMs: number, maxAgeMs?: number): Promise<InitDataResult>` and `TelegramUser { id: number; username?: string; firstName: string }`, consumed by Task 4's auth middleware and every later authenticated handler.

- [ ] **Step 1: Write the failing tests**

`backend/test/core/auth.test.ts`. This test builds a *correctly signed* `initData` string using the same algorithm Telegram uses, so the "valid" case is self-verifying without needing a real Telegram payload:

```ts
import { describe, it, expect } from "vitest";
import { validateInitData } from "../../src/core/auth";

const BOT_TOKEN = "123456:TEST-TOKEN";

async function signInitData(params: Record<string, string>, botToken: string): Promise<string> {
  const dataCheckString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretKeyBytes = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken));

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(dataCheckString));
  const hashHex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const search = new URLSearchParams({ ...params, hash: hashHex });
  return search.toString();
}

describe("validateInitData", () => {
  it("accepts a correctly signed, fresh payload", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 10);
    const user = JSON.stringify({ id: 42, username: "forest_fan", first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const result = await validateInitData(initData, BOT_TOKEN, nowMs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual({ id: 42, username: "forest_fan", firstName: "Alex" });
    }
  });

  it("rejects a tampered payload", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 10);
    const user = JSON.stringify({ id: 42, first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, BOT_TOKEN);
    const tampered = initData.replace("Alex", "Mallory");

    const result = await validateInitData(tampered, BOT_TOKEN, nowMs);

    expect(result.ok).toBe(false);
  });

  it("rejects a payload signed with the wrong bot token", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 10);
    const user = JSON.stringify({ id: 42, first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, "999:OTHER-TOKEN");

    const result = await validateInitData(initData, BOT_TOKEN, nowMs);

    expect(result.ok).toBe(false);
  });

  it("rejects a stale payload older than maxAgeMs", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 7200);
    const user = JSON.stringify({ id: 42, first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const result = await validateInitData(initData, BOT_TOKEN, nowMs, 3600_000);

    expect(result.ok).toBe(false);
  });

  it("rejects a payload missing the hash field", async () => {
    const result = await validateInitData("user=%7B%7D&auth_date=1", BOT_TOKEN, 1_800_000_000_000);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- auth`
Expected: FAIL — `validateInitData` is not defined (module doesn't exist yet).

- [ ] **Step 3: Implement `validateInitData`**

`backend/src/core/auth.ts`:

```ts
export interface TelegramUser {
  id: number;
  username?: string;
  firstName: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDateMs: number }
  | { ok: false; error: string };

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(keyBytes: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

export async function validateInitData(
  initData: string,
  botToken: string,
  nowMs: number,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<InitDataResult> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "missing_hash" };
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const signature = await hmacSha256(secretKey, dataCheckString);
  const computedHash = toHex(signature);

  if (computedHash !== hash) {
    return { ok: false, error: "invalid_signature" };
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    return { ok: false, error: "missing_auth_date" };
  }
  const authDateMs = Number(authDateRaw) * 1000;
  if (!Number.isFinite(authDateMs) || nowMs - authDateMs > maxAgeMs) {
    return { ok: false, error: "stale_auth_date" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: "missing_user" };
  }

  let parsedUser: { id: number; username?: string; first_name: string };
  try {
    parsedUser = JSON.parse(userRaw);
  } catch {
    return { ok: false, error: "invalid_user_json" };
  }

  return {
    ok: true,
    authDateMs,
    user: { id: parsedUser.id, username: parsedUser.username, firstName: parsedUser.first_name },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- auth`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/core/auth.ts test/core/auth.test.ts
git commit -m "feat(backend): validate Telegram initData HMAC signature"
```

---

## Task 4: Auth middleware + users endpoint (register/ping, founder flag)

**Files:**
- Create: `backend/src/core/users.ts`
- Create: `backend/src/auth-middleware.ts`
- Create: `backend/src/handlers/users.ts`
- Modify: `backend/src/router.ts`
- Test: `backend/test/core/users.test.ts`
- Test: `backend/test/handlers/users.test.ts`

**Interfaces:**
- Consumes: `validateInitData` from Task 3 (`backend/src/core/auth.ts`), `Env` from Task 1 (`backend/src/router.ts`).
- Produces: `shouldBeFounder(existingUserCount: number): boolean` from `backend/src/core/users.ts`. `requireAuth(request: Request, env: Env): Promise<{ ok: true; user: TelegramUser } | { ok: false; response: Response }>` from `backend/src/auth-middleware.ts`, used by every later authenticated handler. `POST /users/ping` endpoint returning `UserDTO { telegramId: number; nickname: string; scarfColor: string; hatStyle: string; isFounder: boolean; lastSeenAt: number }`, consumed by the frontend bootstrap (Task 12) and by Task 6 (placement needs `isFounder`).

- [ ] **Step 1: Write the failing test for `shouldBeFounder`**

`backend/test/core/users.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldBeFounder } from "../../src/core/users";

describe("shouldBeFounder", () => {
  it("is true when no users exist yet", () => {
    expect(shouldBeFounder(0)).toBe(true);
  });

  it("is false once at least one user exists", () => {
    expect(shouldBeFounder(1)).toBe(false);
    expect(shouldBeFounder(50)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- core/users`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `shouldBeFounder`**

`backend/src/core/users.ts`:

```ts
export function shouldBeFounder(existingUserCount: number): boolean {
  return existingUserCount === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- core/users`
Expected: PASS.

- [ ] **Step 5: Write the auth middleware**

`backend/src/auth-middleware.ts`:

```ts
import { validateInitData, type TelegramUser } from "./core/auth";
import type { Env } from "./router";

export type AuthResult = { ok: true; user: TelegramUser } | { ok: false; response: Response };

export async function requireAuth(request: Request, env: Env): Promise<AuthResult> {
  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const result = await validateInitData(initData, env.BOT_TOKEN, Date.now());

  if (!result.ok) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: result.error }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }

  return { ok: true, user: result.user };
}
```

- [ ] **Step 6: Write the users handler**

`backend/src/handlers/users.ts`:

```ts
import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";
import { shouldBeFounder } from "../core/users";

interface UserRow {
  telegram_id: number;
  nickname: string;
  scarf_color: string;
  hat_style: string;
  is_founder: number;
  last_seen_at: number;
}

function toDTO(row: UserRow) {
  return {
    telegramId: row.telegram_id,
    nickname: row.nickname,
    scarfColor: row.scarf_color,
    hatStyle: row.hat_style,
    isFounder: row.is_founder === 1,
    lastSeenAt: row.last_seen_at,
  };
}

const DEFAULT_SCARVES = ["#8B4513", "#C1440E", "#355E3B", "#4B3F72"];

export async function handlePing(env: Env, user: TelegramUser): Promise<Response> {
  const now = Date.now();
  const nickname = user.username ?? user.firstName;

  const updateResult = await env.DB.prepare(
    "UPDATE users SET nickname = ?, last_seen_at = ? WHERE telegram_id = ?",
  )
    .bind(nickname, now, user.id)
    .run();

  if ((updateResult.meta.changes ?? 0) > 0) {
    const row = await env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
      .bind(user.id)
      .first<UserRow>();
    return Response.json(toDTO(row!));
  }

  const countRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first<{ cnt: number }>();
  const isFounder = shouldBeFounder(countRow?.cnt ?? 0);
  const scarfColor = DEFAULT_SCARVES[user.id % DEFAULT_SCARVES.length];

  await env.DB.prepare(
    "INSERT INTO users (telegram_id, nickname, scarf_color, hat_style, is_founder, created_at, last_seen_at) VALUES (?, ?, ?, 'none', ?, ?, ?)",
  )
    .bind(user.id, nickname, scarfColor, isFounder ? 1 : 0, now, now)
    .run();

  const row = await env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(user.id)
    .first<UserRow>();
  return Response.json(toDTO(row!));
}
```

- [ ] **Step 7: Wire the route into the router**

Modify `backend/src/router.ts`:

```ts
import { handleHealth } from "./handlers/health";
import { handlePing } from "./handlers/users";
import { requireAuth } from "./auth-middleware";

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  if (request.method === "POST" && url.pathname === "/users/ping") {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    return handlePing(env, auth.user);
  }

  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 8: Write a handler-level test using an in-memory `D1Database` fake**

Because full D1 integration testing needs the Workers runtime, this test verifies `handlePing`'s branching logic (insert-vs-update, founder-on-first-insert) against a minimal in-memory fake that implements only the `prepare().bind().run()/.first()` surface this handler uses:

`backend/test/handlers/users.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { handlePing } from "../../src/handlers/users";
import type { Env } from "../../src/router";

interface FakeUserRow {
  telegram_id: number;
  nickname: string;
  scarf_color: string;
  hat_style: string;
  is_founder: number;
  created_at: number;
  last_seen_at: number;
}

function makeFakeDB() {
  const rows: FakeUserRow[] = [];

  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        async run() {
          if (sql.startsWith("UPDATE")) {
            const [nickname, lastSeenAt, telegramId] = bound as [string, number, number];
            const row = rows.find((r) => r.telegram_id === telegramId);
            if (!row) return { meta: { changes: 0 } };
            row.nickname = nickname;
            row.last_seen_at = lastSeenAt;
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("INSERT")) {
            const [telegramId, nickname, scarfColor, isFounder, createdAt, lastSeenAt] = bound as [
              number, string, string, number, number, number,
            ];
            rows.push({
              telegram_id: telegramId,
              nickname,
              scarf_color: scarfColor,
              hat_style: "none",
              is_founder: isFounder,
              created_at: createdAt,
              last_seen_at: lastSeenAt,
            });
            return { meta: { changes: 1 } };
          }
          throw new Error(`unexpected run() for: ${sql}`);
        },
        async first<T>() {
          if (sql.startsWith("SELECT COUNT")) {
            return { cnt: rows.length } as unknown as T;
          }
          if (sql.startsWith("SELECT * FROM users")) {
            const [telegramId] = bound as [number];
            return (rows.find((r) => r.telegram_id === telegramId) ?? null) as unknown as T;
          }
          throw new Error(`unexpected first() for: ${sql}`);
        },
      };
      return statement;
    },
  };
}

describe("handlePing", () => {
  let db: ReturnType<typeof makeFakeDB>;
  let env: Env;

  beforeEach(() => {
    db = makeFakeDB();
    env = { DB: db as unknown as Env["DB"], BOT_TOKEN: "x" };
  });

  it("creates the first-ever user as founder", async () => {
    const res = await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const body = await res.json();
    expect(body).toMatchObject({ telegramId: 1, isFounder: true });
  });

  it("creates a second user as non-founder", async () => {
    await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const res = await handlePing(env, { id: 2, username: "sam", firstName: "Sam" });
    const body = await res.json();
    expect(body).toMatchObject({ telegramId: 2, isFounder: false });
  });

  it("updates last_seen_at on a repeat ping without changing founder status", async () => {
    await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const res = await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const body = await res.json();
    expect(body).toMatchObject({ telegramId: 1, isFounder: true });
  });
});
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd backend && npm test`
Expected: all tests PASS, including the 3 new `handlePing` tests.

- [ ] **Step 10: Commit**

```bash
cd backend
git add src/core/users.ts src/auth-middleware.ts src/handlers/users.ts src/router.ts test/core/users.test.ts test/handlers/users.test.ts
git commit -m "feat(backend): add auth middleware and /users/ping with founder flag"
```

---

## Task 5: Activity status core (smoke / overgrown / online)

**Files:**
- Create: `backend/src/core/activity.ts`
- Test: `backend/test/core/activity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `hasSmoke`, `isOvergrown`, `isOnline` pure functions and the `SMOKE_WINDOW_MS` / `OVERGROWN_WINDOW_MS` / `ONLINE_WINDOW_MS` constants from `backend/src/core/activity.ts`, consumed by Task 6's houses-list endpoint and Task 10's campfire endpoint.

- [ ] **Step 1: Write the failing tests**

`backend/test/core/activity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasSmoke, isOvergrown, isOnline, SMOKE_WINDOW_MS, OVERGROWN_WINDOW_MS, ONLINE_WINDOW_MS } from "../../src/core/activity";

const NOW = 1_800_000_000_000;

describe("hasSmoke", () => {
  it("is true just under the 3-day window", () => {
    expect(hasSmoke(NOW - SMOKE_WINDOW_MS + 1000, NOW)).toBe(true);
  });
  it("is false just over the 3-day window", () => {
    expect(hasSmoke(NOW - SMOKE_WINDOW_MS - 1000, NOW)).toBe(false);
  });
});

describe("isOvergrown", () => {
  it("is false just under the 14-day window", () => {
    expect(isOvergrown(NOW - OVERGROWN_WINDOW_MS + 1000, NOW)).toBe(false);
  });
  it("is true just over the 14-day window", () => {
    expect(isOvergrown(NOW - OVERGROWN_WINDOW_MS - 1000, NOW)).toBe(true);
  });
});

describe("isOnline", () => {
  it("is true just under the 2-minute window", () => {
    expect(isOnline(NOW - ONLINE_WINDOW_MS + 1000, NOW)).toBe(true);
  });
  it("is false just over the 2-minute window", () => {
    expect(isOnline(NOW - ONLINE_WINDOW_MS - 1000, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- core/activity`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`backend/src/core/activity.ts`:

```ts
export const SMOKE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const OVERGROWN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function hasSmoke(lastSeenAtMs: number, nowMs: number): boolean {
  return nowMs - lastSeenAtMs < SMOKE_WINDOW_MS;
}

export function isOvergrown(lastSeenAtMs: number, nowMs: number): boolean {
  return nowMs - lastSeenAtMs > OVERGROWN_WINDOW_MS;
}

export function isOnline(lastSeenAtMs: number, nowMs: number): boolean {
  return nowMs - lastSeenAtMs < ONLINE_WINDOW_MS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- core/activity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/core/activity.ts test/core/activity.test.ts
git commit -m "feat(backend): add smoke/overgrown/online activity pure functions"
```

---

## Task 6: House placement algorithm + `POST /houses/place` + `GET /houses`

**Files:**
- Create: `backend/src/core/placement.ts`
- Create: `backend/src/handlers/houses.ts`
- Modify: `backend/src/router.ts`
- Test: `backend/test/core/placement.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 4), `hasSmoke`/`isOvergrown` (Task 5), `Env` (Task 1).
- Produces: `Point { x: number; y: number }`, `findHousePlacement(existingHouses: Point[]): Point`, `isInRiver(p: Point): boolean`, `settlementRadius(houseCount: number): number`, `MIN_HOUSE_DISTANCE`, `FOUNDER_POSITION` from `backend/src/core/placement.ts` — `findHousePlacement` and `FOUNDER_POSITION` are also used directly by `handlers/houses.ts` in this same task. `GET /houses` returns `HouseDTO[] { id, ownerTelegramId, shape, x, y, hasSmoke, isOvergrown }`, consumed by Task 17 (frontend house and path rendering, which also uses Task 12's `computePathSegments` for the path derivation itself) and Task 16 (the house count feeds the clearing-radius formula that sizes the forest).

- [ ] **Step 1: Write the failing tests**

`backend/test/core/placement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isInRiver, settlementRadius, findHousePlacement, MIN_HOUSE_DISTANCE, FOUNDER_POSITION } from "../../src/core/placement";

describe("isInRiver", () => {
  it("is true inside the river band", () => {
    expect(isInRiver({ x: 0, y: 0 })).toBe(true);
    expect(isInRiver({ x: 2.9, y: 50 })).toBe(true);
  });
  it("is false outside the river band", () => {
    expect(isInRiver({ x: 3.1, y: 0 })).toBe(false);
    expect(isInRiver({ x: -10, y: 0 })).toBe(false);
  });
});

describe("settlementRadius", () => {
  it("grows with house count", () => {
    const r0 = settlementRadius(0);
    const r10 = settlementRadius(10);
    const r50 = settlementRadius(50);
    expect(r10).toBeGreaterThan(r0);
    expect(r50).toBeGreaterThan(r10);
  });
});

describe("findHousePlacement", () => {
  it("returns a point outside the river for an empty village", () => {
    const point = findHousePlacement([]);
    expect(isInRiver(point)).toBe(false);
  });

  it("returns a point at least MIN_HOUSE_DISTANCE from every existing house", () => {
    const existing = [{ x: 10, y: 0 }, { x: -10, y: 0 }, { x: 0, y: 10 }];
    const point = findHousePlacement(existing);
    for (const house of existing) {
      const dist = Math.hypot(point.x - house.x, point.y - house.y);
      expect(dist).toBeGreaterThanOrEqual(MIN_HOUSE_DISTANCE);
    }
  });

  it("never returns a point inside the river", () => {
    for (let i = 0; i < 20; i++) {
      const existing = Array.from({ length: i }, (_, idx) => ({ x: idx * 5, y: idx % 2 === 0 ? 5 : -5 }));
      const point = findHousePlacement(existing);
      expect(isInRiver(point)).toBe(false);
    }
  });

  it("throws a clear error when the search space is exhausted", () => {
    const wall: { x: number; y: number }[] = [];
    for (let x = -200; x <= 200; x += MIN_HOUSE_DISTANCE / 2) {
      wall.push({ x, y: 0 });
      wall.push({ x, y: 1 });
      wall.push({ x, y: -1 });
    }
    expect(() => findHousePlacement(wall)).toThrow(/no valid placement/i);
  });
});

describe("FOUNDER_POSITION", () => {
  it("is outside the river and close to the campfire at the origin", () => {
    expect(isInRiver(FOUNDER_POSITION)).toBe(false);
    expect(Math.hypot(FOUNDER_POSITION.x, FOUNDER_POSITION.y)).toBeLessThan(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- core/placement`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the placement module**

`backend/src/core/placement.ts`:

```ts
export interface Point {
  x: number;
  y: number;
}

export const RIVER_HALF_WIDTH = 3;
export const MIN_HOUSE_DISTANCE = 4;

const BASE_RADIUS = 8;
const RADIUS_GROWTH_K = 2.2;
const RADIUS_SEARCH_MARGIN = 1.3;
const RING_ANGLE_STEP_DEG = 10;
const RING_RADIAL_STEP = 1.5;
const MAX_SEARCH_RINGS = 400;

export function isInRiver(p: Point): boolean {
  return p.x > -RIVER_HALF_WIDTH && p.x < RIVER_HALF_WIDTH;
}

export function settlementRadius(houseCount: number): number {
  return BASE_RADIUS + RADIUS_GROWTH_K * Math.sqrt(houseCount);
}

function isFarEnoughFromAll(p: Point, existingHouses: Point[]): boolean {
  return existingHouses.every((house) => Math.hypot(p.x - house.x, p.y - house.y) >= MIN_HOUSE_DISTANCE);
}

export function findHousePlacement(existingHouses: Point[]): Point {
  const maxRadius = settlementRadius(existingHouses.length) * RADIUS_SEARCH_MARGIN;

  for (let ring = 1; ring <= MAX_SEARCH_RINGS; ring++) {
    const radius = ring * RING_RADIAL_STEP;
    if (radius > maxRadius) break;

    for (let angleDeg = 0; angleDeg < 360; angleDeg += RING_ANGLE_STEP_DEG) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const candidate: Point = {
        x: Math.cos(angleRad) * radius,
        y: Math.sin(angleRad) * radius,
      };

      if (isInRiver(candidate)) continue;
      if (!isFarEnoughFromAll(candidate, existingHouses)) continue;

      return candidate;
    }
  }

  throw new Error("no valid placement found within the current settlement radius");
}

export const FOUNDER_POSITION: Point = { x: 0, y: -6 };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- core/placement`
Expected: all tests PASS.

- [ ] **Step 5: Write the houses handler**

`backend/src/handlers/houses.ts`:

```ts
import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";
import { findHousePlacement, FOUNDER_POSITION } from "../core/placement";
import { hasSmoke, isOvergrown } from "../core/activity";

interface HouseRow {
  id: number;
  owner_telegram_id: number;
  shape: number;
  x: number;
  y: number;
}

interface UserRow {
  telegram_id: number;
  is_founder: number;
  last_seen_at: number;
}

export async function handleListHouses(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT h.id, h.owner_telegram_id, h.shape, h.x, h.y, u.last_seen_at
     FROM houses h JOIN users u ON u.telegram_id = h.owner_telegram_id`,
  ).all<HouseRow & { last_seen_at: number }>();

  const now = Date.now();
  const dtos = (results ?? []).map((row) => ({
    id: row.id,
    ownerTelegramId: row.owner_telegram_id,
    shape: row.shape,
    x: row.x,
    y: row.y,
    hasSmoke: hasSmoke(row.last_seen_at, now),
    isOvergrown: isOvergrown(row.last_seen_at, now),
  }));

  return Response.json(dtos);
}

export async function handlePlaceHouse(env: Env, user: TelegramUser, shape: unknown): Promise<Response> {
  if (shape !== 1 && shape !== 2 && shape !== 3) {
    return Response.json({ error: "invalid_shape" }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT id FROM houses WHERE owner_telegram_id = ?")
    .bind(user.id)
    .first();
  if (existing) {
    return Response.json({ error: "house_already_exists" }, { status: 409 });
  }

  const userRow = await env.DB.prepare("SELECT is_founder FROM users WHERE telegram_id = ?")
    .bind(user.id)
    .first<UserRow>();

  const rows = await env.DB.prepare("SELECT x, y FROM houses").all<{ x: number; y: number }>();
  const existingHouses = rows.results ?? [];

  const point = userRow?.is_founder === 1 ? FOUNDER_POSITION : findHousePlacement(existingHouses);

  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO houses (owner_telegram_id, shape, x, y, placed_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(user.id, shape, point.x, point.y, now)
    .run();

  return Response.json({ id: 0, ownerTelegramId: user.id, shape, x: point.x, y: point.y }, { status: 201 });
}
```

- [ ] **Step 6: Wire the routes into the router**

Modify `backend/src/router.ts` — add imports and two routes:

```ts
import { handleListHouses, handlePlaceHouse } from "./handlers/houses";
```

```ts
  if (request.method === "GET" && url.pathname === "/houses") {
    return handleListHouses(env);
  }

  if (request.method === "POST" && url.pathname === "/houses/place") {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await request.json<{ shape?: unknown }>().catch(() => ({}));
    return handlePlaceHouse(env, auth.user, body.shape);
  }
```

(insert both blocks before the final `not_found` fallback, after the existing `/users/ping` block)

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests PASS (placement tests from Step 4 plus everything from prior tasks — `handlers/houses.ts` has no new unit tests of its own since its D1-wired logic is a thin pass-through already covered by the `placement.ts` and `activity.ts` unit tests it calls; this matches the spec's "unit test the core logic, not the wiring" approach).

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/core/placement.ts src/handlers/houses.ts src/router.ts test/core/placement.test.ts
git commit -m "feat(backend): add house placement algorithm and /houses endpoints"
```

---

## Task 7: Resource respawn core + `POST /resources/:id/harvest` + `GET /resources`

**Files:**
- Create: `backend/src/core/resources.ts`
- Create: `backend/src/handlers/resources.ts`
- Modify: `backend/src/router.ts`
- Test: `backend/test/core/resources.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 4), `Env` (Task 1).
- Produces: `isNodeAvailable(available: boolean, respawnsAtMs: number | null, nowMs: number): boolean`, `nextRespawnAt(nowMs: number): number`, `RESPAWN_HOURS` from `backend/src/core/resources.ts`. `GET /resources` returns `ResourceNodeDTO[] { id, type, x, y, available }`, consumed by Task 20 (frontend resource rendering).

- [ ] **Step 1: Write the failing tests**

`backend/test/core/resources.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isNodeAvailable, nextRespawnAt, RESPAWN_HOURS } from "../../src/core/resources";

const NOW = 1_800_000_000_000;

describe("isNodeAvailable", () => {
  it("is true when available flag is true, regardless of respawns_at", () => {
    expect(isNodeAvailable(true, null, NOW)).toBe(true);
  });

  it("is false when unavailable and respawn time hasn't arrived", () => {
    expect(isNodeAvailable(false, NOW + 1000, NOW)).toBe(false);
  });

  it("is true when unavailable but respawn time has passed", () => {
    expect(isNodeAvailable(false, NOW - 1000, NOW)).toBe(true);
  });

  it("is true exactly at the respawn boundary", () => {
    expect(isNodeAvailable(false, NOW, NOW)).toBe(true);
  });
});

describe("nextRespawnAt", () => {
  it("returns now plus RESPAWN_HOURS", () => {
    expect(nextRespawnAt(NOW)).toBe(NOW + RESPAWN_HOURS * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- core/resources`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`backend/src/core/resources.ts`:

```ts
export const RESPAWN_HOURS = 24;

export function isNodeAvailable(available: boolean, respawnsAtMs: number | null, nowMs: number): boolean {
  if (available) return true;
  if (respawnsAtMs === null) return false;
  return nowMs >= respawnsAtMs;
}

export function nextRespawnAt(nowMs: number): number {
  return nowMs + RESPAWN_HOURS * 60 * 60 * 1000;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- core/resources`
Expected: PASS.

- [ ] **Step 5: Write the resources handler**

The harvest handler uses a single atomic conditional `UPDATE` so two simultaneous harvest requests on the same node can't both succeed (Review Focus item 2) — the loser's `UPDATE` affects zero rows and gets a 409:

`backend/src/handlers/resources.ts`:

```ts
import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";
import { nextRespawnAt } from "../core/resources";

interface ResourceRow {
  id: number;
  type: string;
  x: number;
  y: number;
  available: number;
  respawns_at: number | null;
}

export async function handleListResources(env: Env): Promise<Response> {
  const now = Date.now();
  const { results } = await env.DB.prepare("SELECT * FROM resource_nodes").all<ResourceRow>();

  const dtos = (results ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    x: row.x,
    y: row.y,
    available: row.available === 1 || (row.respawns_at !== null && now >= row.respawns_at),
  }));

  return Response.json(dtos);
}

export async function handleHarvest(env: Env, user: TelegramUser, nodeId: number): Promise<Response> {
  const now = Date.now();
  const respawnsAt = nextRespawnAt(now);

  const result = await env.DB.prepare(
    `UPDATE resource_nodes
     SET available = 0, respawns_at = ?
     WHERE id = ? AND (available = 1 OR (respawns_at IS NOT NULL AND ? >= respawns_at))`,
  )
    .bind(respawnsAt, nodeId, now)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return Response.json({ error: "already_harvested" }, { status: 409 });
  }

  const node = await env.DB.prepare("SELECT type FROM resource_nodes WHERE id = ?")
    .bind(nodeId)
    .first<{ type: string }>();
  if (!node) {
    return Response.json({ error: "node_not_found" }, { status: 404 });
  }

  await env.DB.prepare(
    `INSERT INTO inventory (telegram_id, item_type, qty) VALUES (?, ?, 1)
     ON CONFLICT(telegram_id, item_type) DO UPDATE SET qty = qty + 1`,
  )
    .bind(user.id, node.type)
    .run();

  return Response.json({ harvested: node.type });
}
```

- [ ] **Step 6: Wire the routes into the router**

Modify `backend/src/router.ts` — add import and two routes:

```ts
import { handleListResources, handleHarvest } from "./handlers/resources";
```

```ts
  if (request.method === "GET" && url.pathname === "/resources") {
    return handleListResources(env);
  }

  const harvestMatch = url.pathname.match(/^\/resources\/(\d+)\/harvest$/);
  if (request.method === "POST" && harvestMatch) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    return handleHarvest(env, auth.user, Number(harvestMatch[1]));
  }
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/core/resources.ts src/handlers/resources.ts src/router.ts test/core/resources.test.ts
git commit -m "feat(backend): add resource respawn core and harvest endpoint with race-safe update"
```

---

## Task 8: Placed items (decorations) — `POST /houses/:id/items`, `GET /houses/:id/items`

**Files:**
- Create: `backend/src/handlers/items.ts`
- Modify: `backend/src/router.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 4), `Env` (Task 1). The allowed `item_type` values are the 10–12 decoration types from the spec; for this task we accept any non-empty string server-side and let the frontend (Task 21) constrain the picker to the known catalog — keeping the catalog itself as frontend-only data avoids a second source of truth to keep in sync.
- Produces: `GET /houses/:id/items` returns `PlacedItemDTO[] { id, itemType, slot }`, consumed by Task 21.

- [ ] **Step 1: Write the handler**

`backend/src/handlers/items.ts`:

```ts
import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";

interface PlacedItemRow {
  id: number;
  item_type: string;
  slot: number;
}

export async function handleListItems(env: Env, houseId: number): Promise<Response> {
  const house = await env.DB.prepare("SELECT id FROM houses WHERE id = ?").bind(houseId).first();
  if (!house) {
    return Response.json({ error: "house_not_found" }, { status: 404 });
  }

  const { results } = await env.DB.prepare(
    "SELECT id, item_type, slot FROM placed_items WHERE house_id = ?",
  )
    .bind(houseId)
    .all<PlacedItemRow>();

  const dtos = (results ?? []).map((row) => ({ id: row.id, itemType: row.item_type, slot: row.slot }));
  return Response.json(dtos);
}

export async function handlePlaceItem(
  env: Env,
  user: TelegramUser,
  houseId: number,
  itemType: unknown,
  slot: unknown,
): Promise<Response> {
  if (typeof itemType !== "string" || itemType.length === 0) {
    return Response.json({ error: "invalid_item_type" }, { status: 400 });
  }
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
    return Response.json({ error: "invalid_slot" }, { status: 400 });
  }

  const house = await env.DB.prepare("SELECT owner_telegram_id FROM houses WHERE id = ?")
    .bind(houseId)
    .first<{ owner_telegram_id: number }>();
  if (!house) {
    return Response.json({ error: "house_not_found" }, { status: 404 });
  }
  if (house.owner_telegram_id !== user.id) {
    return Response.json({ error: "not_your_house" }, { status: 403 });
  }

  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO placed_items (house_id, item_type, slot, placed_at) VALUES (?, ?, ?, ?)",
  )
    .bind(houseId, itemType, slot, now)
    .run();

  return Response.json({ itemType, slot }, { status: 201 });
}
```

- [ ] **Step 2: Wire the routes into the router**

Modify `backend/src/router.ts` — add import and two routes:

```ts
import { handleListItems, handlePlaceItem } from "./handlers/items";
```

```ts
  const itemsListMatch = url.pathname.match(/^\/houses\/(\d+)\/items$/);
  if (request.method === "GET" && itemsListMatch) {
    return handleListItems(env, Number(itemsListMatch[1]));
  }
  if (request.method === "POST" && itemsListMatch) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await request.json<{ itemType?: unknown; slot?: unknown }>().catch(() => ({}));
    return handlePlaceItem(env, auth.user, Number(itemsListMatch[1]), body.itemType, body.slot);
  }
```

- [ ] **Step 3: Run the full backend test suite to confirm nothing broke**

Run: `cd backend && npm test`
Expected: all existing tests still PASS (this task adds routing/handler code with no new pure-logic module, consistent with the "404 for a house that doesn't exist" review-focus item being handled directly in the handler).

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/handlers/items.ts src/router.ts
git commit -m "feat(backend): add placed-items endpoints scoped to house ownership"
```

---

## Task 9: Gifts — daily limit core + `POST /houses/:id/gifts`, `GET /houses/:id/gifts`

**Files:**
- Create: `backend/src/core/gifts.ts`
- Create: `backend/src/handlers/gifts.ts`
- Modify: `backend/src/router.ts`
- Test: `backend/test/core/gifts.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 4), `Env` (Task 1).
- Produces: `startOfUtcDayMs(nowMs: number): number`, `hasReachedDailyLimit(sentTodayCount: number): boolean`, `DAILY_GIFT_LIMIT` from `backend/src/core/gifts.ts`.

- [ ] **Step 1: Write the failing tests**

`backend/test/core/gifts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { startOfUtcDayMs, hasReachedDailyLimit, DAILY_GIFT_LIMIT } from "../../src/core/gifts";

describe("startOfUtcDayMs", () => {
  it("returns midnight UTC for a timestamp mid-day", () => {
    const mid = Date.UTC(2026, 9, 31, 15, 30, 0);
    expect(startOfUtcDayMs(mid)).toBe(Date.UTC(2026, 9, 31, 0, 0, 0));
  });

  it("returns the same timestamp when already exactly midnight UTC", () => {
    const midnight = Date.UTC(2026, 9, 31, 0, 0, 0);
    expect(startOfUtcDayMs(midnight)).toBe(midnight);
  });

  it("rolls over correctly just after midnight UTC", () => {
    const justAfter = Date.UTC(2026, 9, 31, 0, 0, 1);
    expect(startOfUtcDayMs(justAfter)).toBe(Date.UTC(2026, 9, 31, 0, 0, 0));
  });

  it("does not leak into the next day for a timestamp just before midnight", () => {
    const justBefore = Date.UTC(2026, 9, 30, 23, 59, 59);
    expect(startOfUtcDayMs(justBefore)).toBe(Date.UTC(2026, 9, 30, 0, 0, 0));
  });
});

describe("hasReachedDailyLimit", () => {
  it(`is false below ${DAILY_GIFT_LIMIT}`, () => {
    expect(hasReachedDailyLimit(0)).toBe(false);
    expect(hasReachedDailyLimit(DAILY_GIFT_LIMIT - 1)).toBe(false);
  });

  it(`is true at or above ${DAILY_GIFT_LIMIT}`, () => {
    expect(hasReachedDailyLimit(DAILY_GIFT_LIMIT)).toBe(true);
    expect(hasReachedDailyLimit(DAILY_GIFT_LIMIT + 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- core/gifts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`backend/src/core/gifts.ts`:

```ts
export const DAILY_GIFT_LIMIT = 3;

export function startOfUtcDayMs(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function hasReachedDailyLimit(sentTodayCount: number): boolean {
  return sentTodayCount >= DAILY_GIFT_LIMIT;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- core/gifts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Write the gifts handler**

`backend/src/handlers/gifts.ts`:

```ts
import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";
import { startOfUtcDayMs, hasReachedDailyLimit } from "../core/gifts";

interface GiftRow {
  id: number;
  from_telegram_id: number;
  item_type: string;
  created_at: number;
}

export async function handleListGifts(env: Env, houseId: number): Promise<Response> {
  const house = await env.DB.prepare("SELECT id FROM houses WHERE id = ?").bind(houseId).first();
  if (!house) {
    return Response.json({ error: "house_not_found" }, { status: 404 });
  }

  const { results } = await env.DB.prepare(
    "SELECT id, from_telegram_id, item_type, created_at FROM gifts WHERE to_house_id = ? ORDER BY created_at DESC",
  )
    .bind(houseId)
    .all<GiftRow>();

  const dtos = (results ?? []).map((row) => ({
    id: row.id,
    fromTelegramId: row.from_telegram_id,
    itemType: row.item_type,
    createdAt: row.created_at,
  }));
  return Response.json(dtos);
}

export async function handleGiveGift(
  env: Env,
  user: TelegramUser,
  houseId: number,
  itemType: unknown,
): Promise<Response> {
  if (typeof itemType !== "string" || itemType.length === 0) {
    return Response.json({ error: "invalid_item_type" }, { status: 400 });
  }

  const house = await env.DB.prepare("SELECT id FROM houses WHERE id = ?").bind(houseId).first();
  if (!house) {
    return Response.json({ error: "house_not_found" }, { status: 404 });
  }

  const now = Date.now();
  const dayStart = startOfUtcDayMs(now);

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM gifts WHERE from_telegram_id = ? AND created_at >= ?",
  )
    .bind(user.id, dayStart)
    .first<{ cnt: number }>();

  if (hasReachedDailyLimit(countRow?.cnt ?? 0)) {
    return Response.json({ error: "daily_limit_reached" }, { status: 429 });
  }

  await env.DB.prepare(
    "INSERT INTO gifts (from_telegram_id, to_house_id, item_type, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(user.id, houseId, itemType, now)
    .run();

  return Response.json({ itemType }, { status: 201 });
}
```

- [ ] **Step 6: Wire the routes into the router**

Modify `backend/src/router.ts` — add import and two routes:

```ts
import { handleListGifts, handleGiveGift } from "./handlers/gifts";
```

```ts
  const giftsMatch = url.pathname.match(/^\/houses\/(\d+)\/gifts$/);
  if (request.method === "GET" && giftsMatch) {
    return handleListGifts(env, Number(giftsMatch[1]));
  }
  if (request.method === "POST" && giftsMatch) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await request.json<{ itemType?: unknown }>().catch(() => ({}));
    return handleGiveGift(env, auth.user, Number(giftsMatch[1]), body.itemType);
  }
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/core/gifts.ts src/handlers/gifts.ts src/router.ts test/core/gifts.test.ts
git commit -m "feat(backend): add gifts endpoints with UTC-day daily limit"
```

---

## Task 10: Follows + campfire online status

**Files:**
- Create: `backend/src/handlers/follows.ts`
- Create: `backend/src/handlers/campfire.ts`
- Modify: `backend/src/router.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 4), `isOnline` (Task 5), `Env` (Task 1).
- Produces: `POST /follows/:telegramId`, `DELETE /follows/:telegramId`, `GET /follows` (returns `number[]` of followed telegram IDs), consumed by Task 19 (highlighting followed houses). `GET /campfire/online` returns `{ telegramId: number; nickname: string }[]`, consumed by Task 22.

- [ ] **Step 1: Write the follows handler**

`backend/src/handlers/follows.ts`:

```ts
import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";

export async function handleFollow(env: Env, user: TelegramUser, targetId: number): Promise<Response> {
  if (targetId === user.id) {
    return Response.json({ error: "cannot_follow_self" }, { status: 400 });
  }
  const target = await env.DB.prepare("SELECT telegram_id FROM users WHERE telegram_id = ?")
    .bind(targetId)
    .first();
  if (!target) {
    return Response.json({ error: "user_not_found" }, { status: 404 });
  }

  await env.DB.prepare(
    "INSERT INTO follows (follower_telegram_id, followee_telegram_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
  )
    .bind(user.id, targetId)
    .run();

  return Response.json({ following: targetId }, { status: 201 });
}

export async function handleUnfollow(env: Env, user: TelegramUser, targetId: number): Promise<Response> {
  await env.DB.prepare(
    "DELETE FROM follows WHERE follower_telegram_id = ? AND followee_telegram_id = ?",
  )
    .bind(user.id, targetId)
    .run();
  return Response.json({ unfollowed: targetId });
}

export async function handleListFollows(env: Env, user: TelegramUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT followee_telegram_id FROM follows WHERE follower_telegram_id = ?",
  )
    .bind(user.id)
    .all<{ followee_telegram_id: number }>();
  return Response.json((results ?? []).map((r) => r.followee_telegram_id));
}
```

- [ ] **Step 2: Write the campfire handler**

`backend/src/handlers/campfire.ts`:

```ts
import type { Env } from "../router";
import { isOnline } from "../core/activity";

interface UserRow {
  telegram_id: number;
  nickname: string;
  last_seen_at: number;
}

export async function handleCampfireOnline(env: Env): Promise<Response> {
  const now = Date.now();
  const { results } = await env.DB.prepare("SELECT telegram_id, nickname, last_seen_at FROM users").all<UserRow>();

  const online = (results ?? [])
    .filter((row) => isOnline(row.last_seen_at, now))
    .map((row) => ({ telegramId: row.telegram_id, nickname: row.nickname }));

  return Response.json(online);
}
```

- [ ] **Step 3: Wire the routes into the router**

Modify `backend/src/router.ts` — add imports and routes:

```ts
import { handleFollow, handleUnfollow, handleListFollows } from "./handlers/follows";
import { handleCampfireOnline } from "./handlers/campfire";
```

```ts
  if (request.method === "GET" && url.pathname === "/campfire/online") {
    return handleCampfireOnline(env);
  }

  if (request.method === "GET" && url.pathname === "/follows") {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    return handleListFollows(env, auth.user);
  }

  const followMatch = url.pathname.match(/^\/follows\/(\d+)$/);
  if (followMatch) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const targetId = Number(followMatch[1]);
    if (request.method === "POST") return handleFollow(env, auth.user, targetId);
    if (request.method === "DELETE") return handleUnfollow(env, auth.user, targetId);
  }
```

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests PASS. This closes out the backend — every endpoint from the spec's data model and mechanics sections now exists.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/handlers/follows.ts src/handlers/campfire.ts src/router.ts
git commit -m "feat(backend): add follows and campfire online-status endpoints"
```

---

## Task 11: Frontend API client wired to Telegram `initData`

**Files:**
- Create: `frontend/src/api/client.ts`

**Interfaces:**
- Consumes: `getInitData` from Task 2 (`frontend/src/telegram.ts`).
- Produces: `apiGet<T>(path: string): Promise<T>`, `apiPost<T>(path: string, body?: unknown): Promise<T>`, and the DTO interfaces (`UserDTO`, `HouseDTO`, `ResourceNodeDTO`, `PlacedItemDTO`, `GiftDTO`) mirroring the backend's JSON shapes exactly — every later frontend task that talks to the backend imports these instead of redefining them.

- [ ] **Step 1: Write the API client**

`frontend/src/api/client.ts`:

```ts
import { getInitData } from "../telegram";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface UserDTO {
  telegramId: number;
  nickname: string;
  scarfColor: string;
  hatStyle: string;
  isFounder: boolean;
  lastSeenAt: number;
}

export interface HouseDTO {
  id: number;
  ownerTelegramId: number;
  shape: 1 | 2 | 3;
  x: number;
  y: number;
  hasSmoke: boolean;
  isOvergrown: boolean;
}

export interface ResourceNodeDTO {
  id: number;
  type: "branch" | "stone" | "mushroom" | "berry";
  x: number;
  y: number;
  available: boolean;
}

export interface PlacedItemDTO {
  id: number;
  itemType: string;
  slot: number;
}

export interface GiftDTO {
  id: number;
  fromTelegramId: number;
  itemType: string;
  createdAt: number;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      "x-telegram-init-data": getInitData(),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${res.status} ${(body as { error?: string }).error ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown, method: "POST" | "DELETE" = "POST"): Promise<T> {
  return request<T>(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/api/client.ts
git commit -m "feat(frontend): add typed API client wired to Telegram initData"
```

---

## Task 12: Path derivation (pure, tested)

**Files:**
- Create: `frontend/src/game/paths.ts`
- Test: `frontend/src/test/game/paths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Point { x: number; y: number }`, `computePathSegments(houses: Point[], campfire: Point): [Point, Point][]`, consumed by Task 17's path rendering.

- [ ] **Step 1: Write the failing tests**

`frontend/src/test/game/paths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePathSegments } from "../../game/paths";

const CAMPFIRE = { x: 0, y: 0 };

describe("computePathSegments", () => {
  it("returns no segments for an empty village", () => {
    expect(computePathSegments([], CAMPFIRE)).toEqual([]);
  });

  it("connects a single house directly to the campfire", () => {
    const house = { x: 10, y: 0 };
    const segments = computePathSegments([house], CAMPFIRE);
    expect(segments).toEqual([[CAMPFIRE, house]]);
  });

  it("connects the second house to whichever prior node (campfire or first house) is nearest", () => {
    const first = { x: 10, y: 0 };
    const second = { x: 11, y: 0 };
    const segments = computePathSegments([first, second], CAMPFIRE);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual([CAMPFIRE, first]);
    expect(segments[1]).toEqual([first, second]);
  });

  it("produces one segment per house, regardless of house count", () => {
    const houses = Array.from({ length: 8 }, (_, i) => ({ x: i * 3, y: i % 2 === 0 ? 5 : -5 }));
    const segments = computePathSegments(houses, CAMPFIRE);
    expect(segments).toHaveLength(houses.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- paths`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`frontend/src/game/paths.ts`:

```ts
export interface Point {
  x: number;
  y: number;
}

export function computePathSegments(houses: Point[], campfire: Point): [Point, Point][] {
  const priorNodes: Point[] = [campfire];
  const segments: [Point, Point][] = [];

  for (const house of houses) {
    let nearest = priorNodes[0];
    let nearestDist = Math.hypot(house.x - nearest.x, house.y - nearest.y);

    for (const node of priorNodes) {
      const dist = Math.hypot(house.x - node.x, house.y - node.y);
      if (dist < nearestDist) {
        nearest = node;
        nearestDist = dist;
      }
    }

    segments.push([nearest, house]);
    priorNodes.push(house);
  }

  return segments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- paths`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/game/paths.ts src/test/game/paths.test.ts
git commit -m "feat(frontend): derive village paths as a pure, tested function"
```

---

## Task 13: Day/night sun state (pure, tested)

**Files:**
- Create: `frontend/src/game/daynight.ts`
- Test: `frontend/src/test/game/daynight.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SunState { elevationDeg: number; colorHex: string; intensity: number }`, `sunState(date: Date): SunState`, consumed by Task 23's lighting wiring.

- [ ] **Step 1: Write the failing tests**

`frontend/src/test/game/daynight.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sunState } from "../../game/daynight";

describe("sunState", () => {
  it("is at peak elevation at solar noon", () => {
    const noon = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));
    expect(sunState(noon).elevationDeg).toBeCloseTo(90, 0);
  });

  it("is at its lowest at midnight", () => {
    const midnight = new Date(Date.UTC(2026, 9, 31, 0, 0, 0));
    expect(sunState(midnight).elevationDeg).toBeCloseTo(-90, 0);
  });

  it("has low intensity at midnight and high intensity at noon", () => {
    const midnight = new Date(Date.UTC(2026, 9, 31, 0, 0, 0));
    const noon = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));
    expect(sunState(midnight).intensity).toBeLessThan(sunState(noon).intensity);
  });

  it("returns a warm-toned color near sunrise/sunset and a cool color at night", () => {
    const night = sunState(new Date(Date.UTC(2026, 9, 31, 2, 0, 0)));
    const dawn = sunState(new Date(Date.UTC(2026, 9, 31, 6, 30, 0)));
    expect(night.colorHex).not.toBe(dawn.colorHex);
  });

  it("is symmetric around noon for elevation", () => {
    const before = sunState(new Date(Date.UTC(2026, 9, 31, 10, 0, 0)));
    const after = sunState(new Date(Date.UTC(2026, 9, 31, 14, 0, 0)));
    expect(before.elevationDeg).toBeCloseTo(after.elevationDeg, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- daynight`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`frontend/src/game/daynight.ts`:

```ts
export interface SunState {
  elevationDeg: number;
  colorHex: string;
  intensity: number;
}

const NIGHT_COLOR = "#2b3a67";
const DAWN_DUSK_COLOR = "#f2a365";
const DAY_COLOR = "#fff6e0";

function hoursOfDay(date: Date): number {
  return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
}

export function sunState(date: Date): SunState {
  const hours = hoursOfDay(date);
  const angle = ((hours - 6) / 24) * 2 * Math.PI;
  const elevationDeg = Math.sin(angle) * 90;
  const intensity = Math.max(0, Math.sin(angle));

  let colorHex: string;
  if (hours >= 5 && hours < 7.5) {
    colorHex = DAWN_DUSK_COLOR;
  } else if (hours >= 7.5 && hours < 17) {
    colorHex = DAY_COLOR;
  } else if (hours >= 17 && hours < 19.5) {
    colorHex = DAWN_DUSK_COLOR;
  } else {
    colorHex = NIGHT_COLOR;
  }

  return { elevationDeg, colorHex, intensity };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- daynight`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/game/daynight.ts src/test/game/daynight.test.ts
git commit -m "feat(frontend): compute day/night sun state as a pure, tested function"
```

---

## Task 14: Three.js scene shell — renderer, camera, lighting, ground, drag/zoom

**Files:**
- Create: `frontend/src/game/scene.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: the `#game-canvas-container` div from Task 2.
- Produces: `createGameScene(container: HTMLElement): GameScene` where `GameScene { scene: THREE.Scene; camera: THREE.OrthographicCamera; renderer: THREE.WebGLRenderer; dispose(): void }`, consumed by every later rendering task (14–23), which each add their own objects to `GameScene.scene`.

- [ ] **Step 1: Implement the scene shell**

`frontend/src/game/scene.ts`:

```ts
import * as THREE from "three";

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
}

const FRUSTUM_SIZE = 40;

export function createGameScene(container: HTMLElement): GameScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1a12");

  const aspect = container.clientWidth / container.clientHeight;
  const camera = new THREE.OrthographicCamera(
    (-FRUSTUM_SIZE * aspect) / 2,
    (FRUSTUM_SIZE * aspect) / 2,
    FRUSTUM_SIZE / 2,
    -FRUSTUM_SIZE / 2,
    0.1,
    200,
  );
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff6e0, 1.0);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.name = "sun";
  scene.add(sun);

  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#3d5a33" });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);

  let isDragging = false;
  let previous = { x: 0, y: 0 };

  function onPointerDown(event: PointerEvent) {
    isDragging = true;
    previous = { x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: PointerEvent) {
    if (!isDragging) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    previous = { x: event.clientX, y: event.clientY };
    camera.position.x -= deltaX * 0.05;
    camera.position.z -= deltaY * 0.05;
    camera.lookAt(camera.position.x - 30, 0, camera.position.z - 30);
  }
  function onPointerUp() {
    isDragging = false;
  }
  function onWheel(event: WheelEvent) {
    const zoomFactor = 1 + event.deltaY * 0.001;
    camera.zoom = Math.min(Math.max(camera.zoom / zoomFactor, 0.5), 3);
    camera.updateProjectionMatrix();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

  function onResize() {
    const newAspect = container.clientWidth / container.clientHeight;
    camera.left = (-FRUSTUM_SIZE * newAspect) / 2;
    camera.right = (FRUSTUM_SIZE * newAspect) / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener("resize", onResize);

  let animationFrame = 0;
  function animate() {
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  }
  animate();

  function dispose() {
    cancelAnimationFrame(animationFrame);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return { scene, camera, renderer, dispose };
}
```

- [ ] **Step 2: Mount the scene from `App.tsx`**

Modify `frontend/src/App.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegram";
import { createGameScene, type GameScene } from "./game/scene";

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameScene | null>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();

    if (containerRef.current) {
      gameRef.current = createGameScene(containerRef.current);
    }
    return () => gameRef.current?.dispose();
  }, []);

  return <div id="game-canvas-container" ref={containerRef} />;
}
```

- [ ] **Step 3: Verify visually**

Run: `cd frontend && npm run dev`, open the local URL in a browser.
Expected: a dark-green ground plane fills the screen at an isometric-ish angle, lit by a warm directional light plus ambient fill. Dragging the mouse pans the camera; the scroll wheel zooms in/out. No console errors. Take a screenshot (Playwright `page.screenshot()` against the dev server URL) and visually confirm the ground renders and responds to drag/zoom before moving on — this is the first real pixel output of the game and the baseline every later visual task builds on.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/game/scene.ts src/App.tsx
git commit -m "feat(frontend): add Three.js scene shell with isometric camera and drag/zoom"
```

---

## Task 15: River rendering

**Files:**
- Create: `frontend/src/game/terrain.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GameScene.scene` from Task 14. River geometry matches the backend's `isInRiver` band exactly: `x in [-3, 3]`, all `y` (Global Constraints — keep this value in sync with `backend/src/core/placement.ts`'s `RIVER_HALF_WIDTH`).
- Produces: `addRiver(scene: THREE.Scene): void`, consumed by `App.tsx` in this task and available for Task 25's texture pass to re-material later.

- [ ] **Step 1: Implement the river**

`frontend/src/game/terrain.ts`:

```ts
import * as THREE from "three";

const RIVER_HALF_WIDTH = 3;

export function addRiver(scene: THREE.Scene): void {
  const geometry = new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2, 200);
  const material = new THREE.MeshStandardMaterial({
    color: "#3a6ea5",
    transparent: true,
    opacity: 0.85,
    metalness: 0.1,
    roughness: 0.2,
  });
  const river = new THREE.Mesh(geometry, material);
  river.rotation.x = -Math.PI / 2;
  river.position.y = 0.02;
  river.name = "river";
  scene.add(river);
}
```

- [ ] **Step 2: Call it from `App.tsx`**

Modify `frontend/src/App.tsx` — add the import and call it right after scene creation:

```tsx
import { addRiver } from "./game/terrain";
```

```tsx
    if (containerRef.current) {
      gameRef.current = createGameScene(containerRef.current);
      addRiver(gameRef.current.scene);
    }
```

- [ ] **Step 3: Verify visually**

Run: `cd frontend && npm run dev`.
Expected: a blue band running north-south through the middle of the green ground plane, slightly raised above it so there's no z-fighting. Screenshot and confirm no visual seams or flicker while panning.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/game/terrain.ts src/App.tsx
git commit -m "feat(frontend): render the river band matching the backend placement constraint"
```

---

## Task 16: Procedural tree/rock scattering with clearing radius

**Files:**
- Create: `frontend/src/game/trees.ts`

**Interfaces:**
- Consumes: `GameScene.scene` from Task 14, `settlementRadius`-equivalent logic (duplicated here as a frontend constant matching `backend/src/core/placement.ts`'s formula, since it's cheap client-side geometry math, not a network call).
- Produces: `scatterForest(scene: THREE.Scene, clearingRadius: number): void`. Called once at startup by `App.tsx` (wired in Task 17 once house count is known) and whenever `clearingRadius` changes.

- [ ] **Step 1: Implement seeded scattering**

A small deterministic PRNG keeps the forest layout stable across reloads (same seed → same tree positions), which matters so "the clearing expands" reads as trees disappearing, not the whole forest reshuffling:

`frontend/src/game/trees.ts`:

```ts
import * as THREE from "three";

const RIVER_HALF_WIDTH = 3;
const FOREST_EXTENT = 90;
const TREE_COUNT = 600;
const ROCK_COUNT = 80;
const SEED = 1337;

function mulberry32(seed: number) {
  let t = seed;
  return function random() {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isInRiver(x: number): boolean {
  return x > -RIVER_HALF_WIDTH && x < RIVER_HALF_WIDTH;
}

export function scatterForest(scene: THREE.Scene, clearingRadius: number): void {
  const existingForest = scene.getObjectByName("forest");
  if (existingForest) scene.remove(existingForest);

  const forestGroup = new THREE.Group();
  forestGroup.name = "forest";

  const random = mulberry32(SEED);

  const treeGeometry = new THREE.ConeGeometry(1.2, 3, 8);
  const treeMaterial = new THREE.MeshStandardMaterial({ color: "#2f5233" });
  const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, TREE_COUNT);
  treeMesh.castShadow = true;

  const rockGeometry = new THREE.DodecahedronGeometry(0.6);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: "#7d7d7d" });
  const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, ROCK_COUNT);

  const dummy = new THREE.Object3D();
  let treeIndex = 0;
  let rockIndex = 0;

  for (let i = 0; i < TREE_COUNT + ROCK_COUNT; i++) {
    const x = (random() - 0.5) * FOREST_EXTENT * 2;
    const z = (random() - 0.5) * FOREST_EXTENT * 2;
    const distFromCenter = Math.hypot(x, z);

    if (distFromCenter < clearingRadius || isInRiver(x)) continue;

    dummy.position.set(x, 0, z);
    dummy.rotation.y = random() * Math.PI * 2;
    const scale = 0.7 + random() * 0.6;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    if (i < TREE_COUNT && treeIndex < TREE_COUNT) {
      treeMesh.setMatrixAt(treeIndex, dummy.matrix);
      treeIndex++;
    } else if (rockIndex < ROCK_COUNT) {
      rockMesh.setMatrixAt(rockIndex, dummy.matrix);
      rockIndex++;
    }
  }

  treeMesh.count = treeIndex;
  rockMesh.count = rockIndex;
  treeMesh.instanceMatrix.needsUpdate = true;
  rockMesh.instanceMatrix.needsUpdate = true;

  forestGroup.add(treeMesh, rockMesh);
  scene.add(forestGroup);
}
```

- [ ] **Step 2: Verify visually**

This task's call-site is wired in Task 17 alongside house loading, since the clearing radius depends on the live house count from the backend — verification happens together with Task 17's screenshot check.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/game/trees.ts
git commit -m "feat(frontend): add seeded procedural forest scattering with clearing radius"
```

---

## Task 17: House kit geometry + rendering houses from backend data + path rendering

**Files:**
- Create: `frontend/src/game/houses.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GameScene` (Task 14), `scatterForest` (Task 16), `computePathSegments` (Task 12), `apiGet`/`HouseDTO` (Task 11).
- Produces: `buildHouse(shape: 1 | 2 | 3): THREE.Group`, `renderHouses(scene: THREE.Scene, houses: HouseDTO[]): void`, `renderPaths(scene: THREE.Scene, houses: HouseDTO[]): void`, called from `App.tsx`'s new data-loading effect, which also now computes and applies the clearing radius to Task 16's `scatterForest`.

- [ ] **Step 1: Implement the house kit and renderers**

`frontend/src/game/houses.ts`:

```ts
import * as THREE from "three";
import type { HouseDTO } from "../api/client";
import { computePathSegments, type Point } from "./paths";

const ROOF_COLORS: Record<1 | 2 | 3, string> = {
  1: "#8b4a2f",
  2: "#5c4a3a",
  3: "#6b3f2e",
};

export function buildHouse(shape: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();

  const wallGeometry = new THREE.BoxGeometry(2.4, 1.8, 2.4);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#c9a876" });
  const walls = new THREE.Mesh(wallGeometry, wallMaterial);
  walls.position.y = 0.9;
  walls.castShadow = true;
  group.add(walls);

  const roofGeometry = new THREE.ConeGeometry(2.0, shape === 2 ? 1.6 : 1.1, 4);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: ROOF_COLORS[shape] });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = shape === 2 ? 2.6 : 2.3;
  roof.castShadow = true;
  group.add(roof);

  const doorGeometry = new THREE.PlaneGeometry(0.6, 1.0);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: "#3d2b1f" });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 0.5, 1.21);
  group.add(door);

  return group;
}

export function renderHouses(scene: THREE.Scene, houses: HouseDTO[]): void {
  const existing = scene.getObjectByName("houses");
  if (existing) scene.remove(existing);

  const housesGroup = new THREE.Group();
  housesGroup.name = "houses";

  for (const house of houses) {
    const houseMesh = buildHouse(house.shape);
    houseMesh.position.set(house.x, 0, house.y);
    houseMesh.userData = { houseId: house.id, hasSmoke: house.hasSmoke, isOvergrown: house.isOvergrown };
    housesGroup.add(houseMesh);
  }

  scene.add(housesGroup);
}

export function renderPaths(scene: THREE.Scene, houses: HouseDTO[]): void {
  const existing = scene.getObjectByName("paths");
  if (existing) scene.remove(existing);

  const campfire: Point = { x: 0, y: 0 };
  const housePoints: Point[] = houses.map((h) => ({ x: h.x, y: h.y }));
  const segments = computePathSegments(housePoints, campfire);

  const pathsGroup = new THREE.Group();
  pathsGroup.name = "paths";
  const material = new THREE.LineBasicMaterial({ color: "#c9b48c" });

  for (const [from, to] of segments) {
    const points = [new THREE.Vector3(from.x, 0.03, from.y), new THREE.Vector3(to.x, 0.03, to.y)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    pathsGroup.add(new THREE.Line(geometry, material));
  }

  scene.add(pathsGroup);
}
```

- [ ] **Step 2: Wire data loading into `App.tsx`**

Modify `frontend/src/App.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegram";
import { createGameScene, type GameScene } from "./game/scene";
import { addRiver } from "./game/terrain";
import { scatterForest } from "./game/trees";
import { renderHouses, renderPaths } from "./game/houses";
import { apiGet, type HouseDTO } from "./api/client";

const BASE_RADIUS = 8;
const RADIUS_GROWTH_K = 2.2;

function settlementRadius(houseCount: number): number {
  return BASE_RADIUS + RADIUS_GROWTH_K * Math.sqrt(houseCount);
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameScene | null>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();

    if (!containerRef.current) return;
    gameRef.current = createGameScene(containerRef.current);
    addRiver(gameRef.current.scene);

    apiGet<HouseDTO[]>("/houses").then((houses) => {
      if (!gameRef.current) return;
      scatterForest(gameRef.current.scene, settlementRadius(houses.length));
      renderHouses(gameRef.current.scene, houses);
      renderPaths(gameRef.current.scene, houses);
    });

    return () => gameRef.current?.dispose();
  }, []);

  return <div id="game-canvas-container" ref={containerRef} />;
}
```

- [ ] **Step 3: Verify visually**

Run the backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`) together, with `VITE_API_BASE` pointing at the local Worker's URL. Manually `POST /houses/place` a couple of times via curl with a hand-built valid `initData` (or temporarily stub `requireAuth` to accept a test header — remove the stub before deploying) to seed a few houses, then reload the frontend.
Expected: simple box-and-roof houses appear at their placed positions, a forest of cones/rocks surrounds them but leaves a visible clearing near the origin, and faint lines connect each house back toward the campfire origin. Screenshot and confirm the clearing radius visibly grows if you place another house and reload.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/game/houses.ts src/App.tsx
git commit -m "feat(frontend): render houses, clearing radius, and derived paths from backend data"
```

---

## Task 18: Character — geometry, accessory tint, click-to-walk movement

**Files:**
- Create: `frontend/src/game/character.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GameScene` (Task 14).
- Produces: `createCharacter(scene: THREE.Scene, scarfColor: string): Character` where `Character { group: THREE.Group; update(deltaSeconds: number): void; walkTo(target: THREE.Vector3): void }`. `App.tsx` wires a click/tap handler on the renderer's canvas that raycasts against the ground and calls `walkTo`.

- [ ] **Step 1: Implement the character**

`frontend/src/game/character.ts`:

```ts
import * as THREE from "three";

export interface Character {
  group: THREE.Group;
  update: (deltaSeconds: number) => void;
  walkTo: (target: THREE.Vector3) => void;
}

const WALK_SPEED = 4;

export function createCharacter(scene: THREE.Scene, scarfColor: string): Character {
  const group = new THREE.Group();
  group.name = "character";

  const bodyGeometry = new THREE.CapsuleGeometry(0.35, 0.7, 4, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#e8d3b0" });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  const headGeometry = new THREE.SphereGeometry(0.28, 12, 12);
  const headMaterial = new THREE.MeshStandardMaterial({ color: "#f2c9a0" });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.2;
  head.castShadow = true;
  group.add(head);

  const scarfGeometry = new THREE.TorusGeometry(0.3, 0.08, 8, 16);
  const scarfMaterial = new THREE.MeshStandardMaterial({ color: scarfColor });
  const scarf = new THREE.Mesh(scarfGeometry, scarfMaterial);
  scarf.position.y = 0.95;
  scarf.rotation.x = Math.PI / 2;
  group.add(scarf);

  scene.add(group);

  let target: THREE.Vector3 | null = null;

  function update(deltaSeconds: number) {
    if (!target) return;
    const direction = target.clone().sub(group.position);
    const distance = direction.length();
    if (distance < 0.05) {
      target = null;
      return;
    }
    direction.normalize();
    group.position.addScaledVector(direction, Math.min(WALK_SPEED * deltaSeconds, distance));
    group.rotation.y = Math.atan2(direction.x, direction.z);
  }

  function walkTo(newTarget: THREE.Vector3) {
    target = newTarget;
  }

  return { group, update, walkTo };
}
```

- [ ] **Step 2: Wire movement and the render loop into `App.tsx`**

The existing `createGameScene` render loop (Task 14) only calls `renderer.render`; move the per-frame update into `App.tsx` by exposing the character's `update` through a second `requestAnimationFrame` loop driven from the component, and add a click handler that raycasts onto the ground plane:

Modify `frontend/src/App.tsx` — add after the houses/paths loading block:

```tsx
import * as THREE from "three";
import { createCharacter } from "./game/character";
```

```tsx
    const character = createCharacter(gameRef.current.scene, "#8B4513");
    character.group.position.set(2, 0, 2);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function onClick(event: MouseEvent) {
      if (!gameRef.current) return;
      const rect = gameRef.current.renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, gameRef.current.camera);
      const ground = gameRef.current.scene.getObjectByName("ground");
      if (!ground) return;
      const hits = raycaster.intersectObject(ground);
      if (hits.length > 0) {
        character.walkTo(hits[0].point);
      }
    }
    gameRef.current.renderer.domElement.addEventListener("click", onClick);

    const clock = new THREE.Clock();
    let characterFrame = 0;
    function animateCharacter() {
      character.update(clock.getDelta());
      characterFrame = requestAnimationFrame(animateCharacter);
    }
    animateCharacter();
```

And in the cleanup function:

```tsx
    return () => {
      cancelAnimationFrame(characterFrame);
      gameRef.current?.renderer.domElement.removeEventListener("click", onClick);
      gameRef.current?.dispose();
    };
```

- [ ] **Step 3: Verify visually**

Run `npm run dev` for both backend and frontend.
Expected: a small capsule-and-sphere character with a visible scarf-colored torus stands near the origin. Clicking anywhere on the ground makes the character walk there smoothly and face the direction of travel, stopping on arrival. Screenshot mid-walk to confirm orientation looks correct (facing the direction of movement, not sideways).

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/game/character.ts src/App.tsx
git commit -m "feat(frontend): add walkable character with click-to-walk movement"
```

---

## Task 19: Smoke and overgrowth visuals

**Files:**
- Create: `frontend/src/game/activityVisuals.ts`
- Modify: `frontend/src/game/houses.ts`

**Interfaces:**
- Consumes: `HouseDTO.hasSmoke` / `HouseDTO.isOvergrown` (already attached by `renderHouses` in Task 17 via `userData`).
- Produces: `attachActivityVisuals(houseGroup: THREE.Group, hasSmoke: boolean, isOvergrown: boolean): void`, called from `renderHouses`.

- [ ] **Step 1: Implement the visuals**

`frontend/src/game/activityVisuals.ts`:

```ts
import * as THREE from "three";

export function attachActivityVisuals(houseGroup: THREE.Group, hasSmoke: boolean, isOvergrown: boolean): void {
  if (hasSmoke) {
    const smokeGeometry = new THREE.SphereGeometry(0.15, 6, 6);
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: "#cfcfcf", transparent: true, opacity: 0.6 });
    const smoke = new THREE.Group();
    smoke.name = "smoke";
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(smokeGeometry, smokeMaterial);
      puff.position.set(0.3, 2.8 + i * 0.4, 0.3);
      puff.scale.setScalar(1 + i * 0.3);
      smoke.add(puff);
    }
    houseGroup.add(smoke);
  }

  if (isOvergrown) {
    const ivyGeometry = new THREE.TorusKnotGeometry(0.5, 0.08, 32, 6);
    const ivyMaterial = new THREE.MeshStandardMaterial({ color: "#3b5e2b" });
    const ivy = new THREE.Mesh(ivyGeometry, ivyMaterial);
    ivy.name = "ivy";
    ivy.position.set(0, 1.0, 1.2);
    houseGroup.add(ivy);
  }
}
```

- [ ] **Step 2: Call it from `renderHouses`**

Modify `frontend/src/game/houses.ts` — add the import and call inside the loop:

```ts
import { attachActivityVisuals } from "./activityVisuals";
```

```ts
  for (const house of houses) {
    const houseMesh = buildHouse(house.shape);
    houseMesh.position.set(house.x, 0, house.y);
    houseMesh.userData = { houseId: house.id, hasSmoke: house.hasSmoke, isOvergrown: house.isOvergrown };
    attachActivityVisuals(houseMesh, house.hasSmoke, house.isOvergrown);
    housesGroup.add(houseMesh);
  }
```

- [ ] **Step 3: Verify visually**

With at least one house whose owner's `last_seen_at` is recent (so `hasSmoke` is true) and, if testable, one with an artificially old `last_seen_at` set directly in local D1 (so `isOvergrown` is true), reload the frontend.
Expected: small grey puffs float above the chimney area of the active house; a tangled green shape sits near the door of the inactive house. Screenshot both states.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/game/activityVisuals.ts src/game/houses.ts
git commit -m "feat(frontend): render smoke and overgrowth visuals from house activity status"
```

---

## Task 20: Resource node rendering + harvest interaction + inventory UI

**Files:**
- Create: `frontend/src/game/resources.ts`
- Create: `frontend/src/ui/InventoryDrawer.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiGet`/`apiPost`, `ResourceNodeDTO` (Task 11), `GameScene` (Task 14).
- Produces: `renderResourceNodes(scene: THREE.Scene, nodes: ResourceNodeDTO[]): void`, `findResourceNodeIdFromIntersect(scene: THREE.Scene, hits: THREE.Intersection[]): number | null`. `InventoryDrawer` is a React component taking `inventory: Record<string, number>` as a prop.

- [ ] **Step 1: Implement resource node rendering**

`frontend/src/game/resources.ts`:

```ts
import * as THREE from "three";
import type { ResourceNodeDTO } from "../api/client";

const NODE_COLORS: Record<ResourceNodeDTO["type"], string> = {
  branch: "#8a5a32",
  stone: "#9a9a9a",
  mushroom: "#c94f4f",
  berry: "#7a2fae",
};

export function renderResourceNodes(scene: THREE.Scene, nodes: ResourceNodeDTO[]): void {
  const existing = scene.getObjectByName("resourceNodes");
  if (existing) scene.remove(existing);

  const group = new THREE.Group();
  group.name = "resourceNodes";

  for (const node of nodes) {
    if (!node.available) continue;
    const geometry = new THREE.IcosahedronGeometry(0.3, 0);
    const material = new THREE.MeshStandardMaterial({ color: NODE_COLORS[node.type] });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(node.x, 0.3, node.y);
    mesh.userData = { resourceNodeId: node.id };
    group.add(mesh);
  }

  scene.add(group);
}

export function findResourceNodeIdFromIntersect(
  scene: THREE.Scene,
  hits: THREE.Intersection[],
): number | null {
  const resourceGroup = scene.getObjectByName("resourceNodes");
  if (!resourceGroup) return null;
  for (const hit of hits) {
    if (resourceGroup.children.includes(hit.object) && hit.object.userData.resourceNodeId !== undefined) {
      return hit.object.userData.resourceNodeId as number;
    }
  }
  return null;
}
```

- [ ] **Step 2: Implement the inventory drawer**

`frontend/src/ui/InventoryDrawer.tsx`:

```tsx
interface InventoryDrawerProps {
  inventory: Record<string, number>;
}

const LABELS: Record<string, string> = {
  branch: "Ветки",
  stone: "Камни",
  mushroom: "Грибы",
  berry: "Ягоды",
};

export function InventoryDrawer({ inventory }: InventoryDrawerProps) {
  return (
    <div style={{ position: "fixed", bottom: 12, left: 12, display: "flex", gap: 8, zIndex: 10 }}>
      {Object.entries(LABELS).map(([type, label]) => (
        <div
          key={type}
          style={{
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {label}: {inventory[type] ?? 0}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire loading, click-to-harvest, and the drawer into `App.tsx`**

Modify `frontend/src/App.tsx` — add imports, state, and extend the existing click handler to check resource nodes before falling back to walking:

```tsx
import { useState } from "react";
import { renderResourceNodes, findResourceNodeIdFromIntersect } from "./game/resources";
import { InventoryDrawer } from "./ui/InventoryDrawer";
import { apiPost, type ResourceNodeDTO } from "./api/client";
```

```tsx
  const [inventory, setInventory] = useState<Record<string, number>>({});
```

Inside the effect, after loading houses:

```tsx
    apiGet<ResourceNodeDTO[]>("/resources").then((nodes) => {
      if (gameRef.current) renderResourceNodes(gameRef.current.scene, nodes);
    });
```

Replace the body of `onClick` with:

```tsx
    function onClick(event: MouseEvent) {
      if (!gameRef.current) return;
      const rect = gameRef.current.renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, gameRef.current.camera);

      const resourceGroup = gameRef.current.scene.getObjectByName("resourceNodes");
      const resourceHits = resourceGroup ? raycaster.intersectObjects(resourceGroup.children) : [];
      const nodeId = findResourceNodeIdFromIntersect(gameRef.current.scene, resourceHits);
      if (nodeId !== null) {
        apiPost<{ harvested: string }>(`/resources/${nodeId}/harvest`).then((result) => {
          setInventory((prev) => ({ ...prev, [result.harvested]: (prev[result.harvested] ?? 0) + 1 }));
          if (gameRef.current) {
            apiGet<ResourceNodeDTO[]>("/resources").then((nodes) => renderResourceNodes(gameRef.current!.scene, nodes));
          }
        }).catch(() => {});
        return;
      }

      const ground = gameRef.current.scene.getObjectByName("ground");
      if (!ground) return;
      const hits = raycaster.intersectObject(ground);
      if (hits.length > 0) {
        character.walkTo(hits[0].point);
      }
    }
```

Add `<InventoryDrawer inventory={inventory} />` next to the returned `<div id="game-canvas-container" ... />`, wrapped in a fragment.

- [ ] **Step 4: Verify visually**

Run both dev servers.
Expected: small colored gems (icosahedra) are scattered around the map matching the seeded `resource_nodes` positions. Clicking one makes it disappear and increments the matching counter in the bottom-left inventory HUD; clicking it again (before 24h pass) does nothing since it's no longer rendered. Clicking empty ground still makes the character walk.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/game/resources.ts src/ui/InventoryDrawer.tsx src/App.tsx
git commit -m "feat(frontend): render resource nodes, add click-to-harvest, and inventory HUD"
```

---

## Task 21: Decoration placement UI + gift UI

**Files:**
- Create: `frontend/src/ui/DecorationDrawer.tsx`
- Create: `frontend/src/ui/GiftDrawer.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/game/houses.ts`

**Interfaces:**
- Consumes: `apiGet`/`apiPost`, `PlacedItemDTO`/`GiftDTO` (Task 11), `follows` endpoints (Task 10).
- Produces: React components `DecorationDrawer { houseId: number; onClose(): void }` and `GiftDrawer { houseId: number; onClose(): void; targetTelegramId: number }`, opened from a click on the player's own house (decorations) or another player's house (gifts). `attachPlacedItemMarkers(houseGroup: THREE.Group, items: PlacedItemDTO[]): void` and `loadAndRenderPlacedItems(scene: THREE.Scene, houses: HouseDTO[]): Promise<void>` in `frontend/src/game/houses.ts`, so placed decorations are actually visible on the map, not just stored.

- [ ] **Step 1: Implement the decoration catalog and drawer**

The 10–12 decoration catalog is frontend-only data (per Task 8's design note — the backend accepts any non-empty string):

`frontend/src/ui/DecorationDrawer.tsx`:

```tsx
import { useState } from "react";
import { apiPost } from "../api/client";

const DECORATION_CATALOG = [
  "roof_moss", "porch", "woodpile", "mailbox", "flowerbed", "fence",
  "lantern", "birdhouse", "bench", "well", "stone_path", "windchime",
];

interface DecorationDrawerProps {
  houseId: number;
  onClose: () => void;
}

export function DecorationDrawer({ houseId, onClose }: DecorationDrawerProps) {
  const [placing, setPlacing] = useState<string | null>(null);

  async function place(itemType: string, slot: number) {
    setPlacing(itemType);
    try {
      await apiPost(`/houses/${houseId}/items`, { itemType, slot });
      onClose();
    } finally {
      setPlacing(null);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 20 }} onClick={onClose}>
      <div
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#1e2a1a", padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#fff", marginTop: 0 }}>Украсить дом</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {DECORATION_CATALOG.map((item, index) => (
            <button
              key={item}
              disabled={placing !== null}
              onClick={() => place(item, index)}
              style={{ padding: 10, borderRadius: 8 }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the gift drawer**

`frontend/src/ui/GiftDrawer.tsx`. This also carries the "follow neighbour" toggle from the spec's MVP v1 list — the gift drawer is the moment you're already looking at a specific neighbour, so it's the natural place for it rather than a separate screen:

```tsx
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";

const GIFT_CATALOG = ["berry_jam", "firewood_bundle", "dried_mushrooms", "wildflowers"];

interface GiftDrawerProps {
  houseId: number;
  targetTelegramId: number;
  onClose: () => void;
}

export function GiftDrawer({ houseId, targetTelegramId, onClose }: GiftDrawerProps) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    apiGet<number[]>("/follows").then((ids) => setIsFollowing(ids.includes(targetTelegramId)));
  }, [targetTelegramId]);

  async function send(itemType: string) {
    setSending(true);
    setError(null);
    try {
      await apiPost(`/houses/${houseId}/gifts`, { itemType });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось");
    } finally {
      setSending(false);
    }
  }

  async function toggleFollow() {
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await apiPost(`/follows/${targetTelegramId}`, undefined, "DELETE");
      } else {
        await apiPost(`/follows/${targetTelegramId}`);
      }
      setIsFollowing(!isFollowing);
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 20 }} onClick={onClose}>
      <div
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#1e2a1a", padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#fff", marginTop: 0 }}>Оставить подарок у двери</h3>
        {error && <p style={{ color: "#f28b82" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {GIFT_CATALOG.map((item) => (
            <button key={item} disabled={sending} onClick={() => send(item)} style={{ padding: 10, borderRadius: 8 }}>
              {item}
            </button>
          ))}
        </div>
        <button disabled={followBusy} onClick={toggleFollow} style={{ padding: "8px 14px", borderRadius: 8 }}>
          {isFollowing ? "Отписаться" : "Подписаться на соседа"}
        </button>
      </div>
    </div>
  );
}
```

This uses `apiPost`'s `method` override (already part of its Task 11 signature) to send the unfollow as `DELETE`.

- [ ] **Step 3: Open the right drawer on house click**

Modify `frontend/src/App.tsx` — add state and extend `onClick` to check house hits before resource/ground hits, and render the drawers conditionally. This requires knowing the current user's `telegramId` (from the `/users/ping` response, loaded once at startup) to decide decoration-vs-gift:

```tsx
import { DecorationDrawer } from "./ui/DecorationDrawer";
import { GiftDrawer } from "./ui/GiftDrawer";
import { type UserDTO } from "./api/client";
```

```tsx
  const [currentUser, setCurrentUser] = useState<UserDTO | null>(null);
  const [openHouseId, setOpenHouseId] = useState<number | null>(null);
  const [openHouseOwnerId, setOpenHouseOwnerId] = useState<number | null>(null);
```

```tsx
    apiPost<UserDTO>("/users/ping").then(setCurrentUser);
```

Inside `onClick`, before the resource-node check:

```tsx
      const housesGroup = gameRef.current.scene.getObjectByName("houses");
      const houseHits = housesGroup ? raycaster.intersectObjects(housesGroup.children, true) : [];
      if (houseHits.length > 0) {
        let node: THREE.Object3D | null = houseHits[0].object;
        while (node && node.userData.houseId === undefined) node = node.parent;
        if (node) {
          setOpenHouseId(node.userData.houseId as number);
          setOpenHouseOwnerId(node.userData.ownerTelegramId as number);
        }
        return;
      }
```

(this requires adding `ownerTelegramId: house.ownerTelegramId` to the `userData` assignment in `renderHouses`, Task 17 — modify `frontend/src/game/houses.ts`'s `houseMesh.userData = {...}` line to include it)

And in the JSX, with a reload callback so placed decorations become visible right after placing one:

```tsx
      {openHouseId !== null && currentUser && openHouseOwnerId === currentUser.telegramId && (
        <DecorationDrawer
          houseId={openHouseId}
          onClose={() => {
            setOpenHouseId(null);
            if (gameRef.current) loadAndRenderPlacedItems(gameRef.current.scene, loadedHousesRef.current);
          }}
        />
      )}
      {openHouseId !== null && currentUser && openHouseOwnerId !== null && openHouseOwnerId !== currentUser.telegramId && (
        <GiftDrawer houseId={openHouseId} targetTelegramId={openHouseOwnerId} onClose={() => setOpenHouseId(null)} />
      )}
```

- [ ] **Step 4: Render placed decorations as markers on each house**

Modify `frontend/src/game/houses.ts` — add a function that attaches a small marker mesh per placed item, and a loader that fetches every house's items and attaches them:

```ts
import { apiGet, type PlacedItemDTO } from "../api/client";

export function attachPlacedItemMarkers(houseGroup: THREE.Group, items: PlacedItemDTO[]): void {
  const existing = houseGroup.getObjectByName("placedItems");
  if (existing) houseGroup.remove(existing);

  const group = new THREE.Group();
  group.name = "placedItems";

  items.forEach((item, index) => {
    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshStandardMaterial({ color: "#d9a441" });
    const marker = new THREE.Mesh(geometry, material);
    const angle = (index / Math.max(items.length, 1)) * Math.PI * 2;
    marker.position.set(Math.cos(angle) * 1.6, 0.15, Math.sin(angle) * 1.6 + 1.5);
    marker.userData = { itemType: item.itemType };
    group.add(marker);
  });

  houseGroup.add(group);
}

export async function loadAndRenderPlacedItems(scene: THREE.Scene, houses: HouseDTO[]): Promise<void> {
  const housesGroup = scene.getObjectByName("houses");
  if (!housesGroup) return;

  await Promise.all(
    houses.map(async (house) => {
      const items = await apiGet<PlacedItemDTO[]>(`/houses/${house.id}/items`);
      const houseMesh = housesGroup.children.find((child) => child.userData.houseId === house.id);
      if (houseMesh instanceof THREE.Group) {
        attachPlacedItemMarkers(houseMesh, items);
      }
    }),
  );
}
```

- [ ] **Step 5: Call the loader after houses render and keep a reference for the decoration-close callback**

Modify `frontend/src/App.tsx` — add a ref to hold the last-loaded house list (so the decoration drawer's `onClose` in Step 3 can re-trigger the loader without re-fetching `/houses`), and call the loader once after the initial house render:

```tsx
import { loadAndRenderPlacedItems } from "./game/houses";
```

```tsx
  const loadedHousesRef = useRef<HouseDTO[]>([]);
```

Inside the `apiGet<HouseDTO[]>("/houses").then(...)` block from Task 17, after `renderPaths`:

```tsx
      loadedHousesRef.current = houses;
      loadAndRenderPlacedItems(gameRef.current.scene, houses);
```

- [ ] **Step 6: Verify visually**

Run both dev servers with at least two houses placed under two different `telegram_id`s.
Expected: clicking your own house opens the decoration drawer; picking an item closes the drawer and a small colored marker cube appears near that house's door within a second or two (no manual reload needed). Clicking a neighbour's house opens the gift drawer instead, with a "Подписаться на соседа" button that toggles to "Отписаться" after clicking and persists across a page reload; sending a 4th gift in the same UTC day shows the daily-limit error message.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/ui/DecorationDrawer.tsx src/ui/GiftDrawer.tsx src/App.tsx src/game/houses.ts src/api/client.ts
git commit -m "feat(frontend): add decoration and gift drawers, render placed items, add follow toggle"
```

---

## Task 22: Campfire scene + online avatars

**Files:**
- Create: `frontend/src/game/campfire.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GameScene` (Task 14), `apiGet` (Task 11), `GET /campfire/online` (Task 10).
- Produces: `buildCampfire(scene: THREE.Scene): void`, `renderOnlineAvatars(scene: THREE.Scene, online: { telegramId: number; nickname: string }[]): void`. `App.tsx` adds a `setInterval` poll (20s, within the spec's 15–30s range) calling `/campfire/online` and re-rendering avatars.

- [ ] **Step 1: Implement the campfire structure**

`frontend/src/game/campfire.ts`:

```ts
import * as THREE from "three";

interface OnlineUser {
  telegramId: number;
  nickname: string;
}

export function buildCampfire(scene: THREE.Scene): void {
  const group = new THREE.Group();
  group.name = "campfire";

  const logGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6);
  const logMaterial = new THREE.MeshStandardMaterial({ color: "#5a3d26" });
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(logGeometry, logMaterial);
    const angle = (i / 6) * Math.PI * 2;
    log.position.set(Math.cos(angle) * 0.4, 0.1, Math.sin(angle) * 0.4);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = angle;
    group.add(log);
  }

  const flameGeometry = new THREE.ConeGeometry(0.3, 0.8, 8);
  const flameMaterial = new THREE.MeshBasicMaterial({ color: "#ff8c3b" });
  const flame = new THREE.Mesh(flameGeometry, flameMaterial);
  flame.position.y = 0.5;
  flame.name = "flame";
  group.add(flame);

  const fireLight = new THREE.PointLight(0xff8c3b, 2, 8);
  fireLight.position.y = 0.6;
  group.add(fireLight);

  scene.add(group);
}

export function renderOnlineAvatars(scene: THREE.Scene, online: OnlineUser[]): void {
  const campfire = scene.getObjectByName("campfire");
  if (!campfire) return;

  const existing = campfire.getObjectByName("onlineAvatars");
  if (existing) campfire.remove(existing);

  const avatarsGroup = new THREE.Group();
  avatarsGroup.name = "onlineAvatars";

  const radius = 1.3;
  online.forEach((user, index) => {
    const angle = (index / Math.max(online.length, 1)) * Math.PI * 2;
    const avatarGeometry = new THREE.CapsuleGeometry(0.2, 0.4, 4, 6);
    const avatarMaterial = new THREE.MeshStandardMaterial({ color: "#d9b38c" });
    const avatar = new THREE.Mesh(avatarGeometry, avatarMaterial);
    avatar.position.set(Math.cos(angle) * radius, 0.4, Math.sin(angle) * radius);
    avatar.userData = { telegramId: user.telegramId, nickname: user.nickname };
    avatarsGroup.add(avatar);
  });

  campfire.add(avatarsGroup);
}
```

- [ ] **Step 2: Wire it into `App.tsx`**

Modify `frontend/src/App.tsx`:

```tsx
import { buildCampfire, renderOnlineAvatars } from "./game/campfire";
```

Inside the effect, after `addRiver`:

```tsx
    buildCampfire(gameRef.current.scene);

    function pollOnline() {
      apiGet<{ telegramId: number; nickname: string }[]>("/campfire/online").then((online) => {
        if (gameRef.current) renderOnlineAvatars(gameRef.current.scene, online);
      });
    }
    pollOnline();
    const onlineInterval = setInterval(pollOnline, 20_000);
```

And in the cleanup:

```tsx
      clearInterval(onlineInterval);
```

- [ ] **Step 3: Verify visually**

With at least one user having recently pinged (`last_seen_at` within the last 2 minutes), run both dev servers.
Expected: a ring of six logs with an orange flame cone and a warm point light sits at the origin; small avatar capsules appear seated around it for each currently-online user, spaced evenly, and update roughly every 20 seconds.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/game/campfire.ts src/App.tsx
git commit -m "feat(frontend): add campfire structure with polled online-avatar rendering"
```

---

## Task 23: Day/night lighting wiring + autumn palette

**Files:**
- Modify: `frontend/src/game/scene.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `sunState` (Task 13).
- Produces: a per-frame lighting update driven by real wall-clock time, replacing the static sun light set up in Task 14.

- [ ] **Step 1: Expose the sun light for external updates**

Modify `frontend/src/game/scene.ts` — add `sun: THREE.DirectionalLight` to the returned `GameScene` interface and object:

```ts
export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  dispose: () => void;
}
```

```ts
  return { scene, camera, renderer, sun, dispose };
```

- [ ] **Step 2: Drive the light from `sunState` in `App.tsx`**

Modify `frontend/src/App.tsx`:

```tsx
import { sunState } from "./game/daynight";
```

Inside the effect, after scene creation:

```tsx
    function updateDayNight() {
      if (!gameRef.current) return;
      const state = sunState(new Date());
      gameRef.current.sun.color.set(state.colorHex);
      gameRef.current.sun.intensity = 0.3 + state.intensity * 0.9;
      gameRef.current.sun.position.set(
        20 * Math.cos((state.elevationDeg * Math.PI) / 180),
        Math.max(5, 30 * Math.sin((state.elevationDeg * Math.PI) / 180)),
        10,
      );
      const bg = state.intensity > 0.1 ? "#2e4a24" : "#0b1a12";
      gameRef.current.scene.background = new THREE.Color(bg);
    }
    updateDayNight();
    const dayNightInterval = setInterval(updateDayNight, 60_000);
```

And in the cleanup:

```tsx
      clearInterval(dayNightInterval);
```

- [ ] **Step 3: Apply the autumn ground/forest palette**

Modify `frontend/src/game/scene.ts` — change the ground color from `"#3d5a33"` (summer green) to an autumn tone `"#7a6a3a"`, and modify `frontend/src/game/trees.ts` — change `treeMaterial`'s color from `"#2f5233"` to an autumn mix `"#b5651d"` for roughly a third of trees (every third index gets the autumn color, rest stay a muted green `"#5c6b3a"`) by giving `treeMesh` two materials is unnecessary complexity for v1 — instead, simplify to a single muted autumn-green `"#6b6b3a"` applied to all trees, matching the spec's "autumn palette" requirement without needing multi-material instancing:

```ts
const treeMaterial = new THREE.MeshStandardMaterial({ color: "#6b6b3a" });
```

- [ ] **Step 4: Verify visually**

Run both dev servers at different system-clock-simulated times (or just observe over real time / temporarily hardcode a `Date` in `sunState`'s caller for a quick check) to confirm lighting shifts from warm daytime to cool nighttime tones, and confirm the ground/forest read as autumn (muted gold-green) rather than summer (saturated green). Screenshot a daytime and a nighttime view side by side.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/game/scene.ts src/game/trees.ts src/App.tsx
git commit -m "feat(frontend): drive lighting from real-time day/night cycle and apply autumn palette"
```

---

## Task 24: AI-generated textures pass

**Files:**
- Create: `frontend/src/assets/textures/wood-wall.png`
- Create: `frontend/src/assets/textures/roof-shingle-1.png`
- Create: `frontend/src/assets/textures/roof-shingle-2.png`
- Create: `frontend/src/assets/textures/roof-shingle-3.png`
- Create: `frontend/src/assets/textures/ground-moss.png`
- Create: `frontend/src/assets/textures/stone-path.png`
- Create: `frontend/CREDITS.md`
- Modify: `frontend/src/game/houses.ts`
- Modify: `frontend/src/game/scene.ts`

**Interfaces:**
- Consumes: the image-generation skill (and optionally Higgsfield MCP) to produce seamless, tileable 2D textures.
- Produces: real texture files wired via `THREE.TextureLoader` into the materials created in Tasks 14, 15, and 17, replacing their flat placeholder colors.

- [ ] **Step 1: Generate the textures**

Using the image-generation skill, generate six seamless/tileable square textures (1024×1024, with instructions to tile seamlessly at the edges) and save them to the paths listed above:
- `wood-wall.png`: weathered horizontal log-cabin wall, warm brown tones, soft directional lighting baked in lightly.
- `roof-shingle-1.png` / `-2.png` / `-3.png`: wood-shingle roof texture in three color variants (dark brown, mossy green-brown, warm red-brown) so the three house shapes can look distinct.
- `ground-moss.png`: mossy forest-floor texture, muted autumn-green.
- `stone-path.png`: round river-stone path texture, grey-tan.

- [ ] **Step 2: Wire wall and roof textures into the house kit**

Modify `frontend/src/game/houses.ts`:

```ts
const textureLoader = new THREE.TextureLoader();
const wallTexture = textureLoader.load("/src/assets/textures/wood-wall.png");
wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(2, 2);

const roofTextures: Record<1 | 2 | 3, THREE.Texture> = {
  1: textureLoader.load("/src/assets/textures/roof-shingle-1.png"),
  2: textureLoader.load("/src/assets/textures/roof-shingle-2.png"),
  3: textureLoader.load("/src/assets/textures/roof-shingle-3.png"),
};
```

Replace `wallMaterial`'s construction with `new THREE.MeshStandardMaterial({ map: wallTexture })` and `roofMaterial`'s construction with `new THREE.MeshStandardMaterial({ map: roofTextures[shape] })`, removing the now-unused `ROOF_COLORS` constant.

- [ ] **Step 3: Wire ground and path textures**

Modify `frontend/src/game/scene.ts` — load `ground-moss.png`, set `wrapS`/`wrapT` to `RepeatWrapping` with `repeat.set(20, 20)`, and pass it as `map` to the ground's `MeshStandardMaterial` instead of the flat `"#7a6a3a"` color.

The river material itself is untouched (water stays a shader-free tinted plane per the spec). Instead, replace `renderPaths` in `frontend/src/game/houses.ts` entirely — swapping its `THREE.Line`/`LineBasicMaterial` segments (Task 17) for a textured `PlaneGeometry` ribbon per segment, since a textured path reads far better than a thin colored line. Each segment gets its own cloned texture so its repeat count can match its own length without segments stomping on each other's tiling:

```ts
export function renderPaths(scene: THREE.Scene, houses: HouseDTO[]): void {
  const existing = scene.getObjectByName("paths");
  if (existing) scene.remove(existing);

  const campfire: Point = { x: 0, y: 0 };
  const housePoints: Point[] = houses.map((h) => ({ x: h.x, y: h.y }));
  const segments = computePathSegments(housePoints, campfire);

  const pathsGroup = new THREE.Group();
  pathsGroup.name = "paths";
  const basePathTexture = textureLoader.load("/src/assets/textures/stone-path.png");
  basePathTexture.wrapS = basePathTexture.wrapT = THREE.RepeatWrapping;

  for (const [from, to] of segments) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);

    const segmentTexture = basePathTexture.clone();
    segmentTexture.needsUpdate = true;
    segmentTexture.repeat.set(1, Math.max(1, length));

    const ribbonGeometry = new THREE.PlaneGeometry(0.8, length);
    const ribbonMaterial = new THREE.MeshStandardMaterial({ map: segmentTexture });
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.rotation.x = -Math.PI / 2;
    ribbon.rotation.z = -Math.atan2(dx, dy);
    ribbon.position.set((from.x + to.x) / 2, 0.03, (from.y + to.y) / 2);
    pathsGroup.add(ribbon);
  }

  scene.add(pathsGroup);
}
```

This reuses the `textureLoader` already declared at module scope in `houses.ts` by Step 2 above.

- [ ] **Step 4: Write the credits file**

`frontend/CREDITS.md`:

```markdown
# Credits

All wall, roof, ground, and path textures in `src/assets/textures/` were
generated with AI image generation specifically for Woodland Neighbours
(no third-party stock or CC-licensed source assets were used for these).

If any future asset is sourced from a third-party CC0/CC-BY library
(e.g., Quaternius, Poly Pizza), it will be listed here with its license
and attribution requirement at the time it's added.
```

- [ ] **Step 5: Verify visually**

Run both dev servers.
Expected: houses now show a log-wall texture and a distinct shingle pattern per shape instead of flat colors; the ground reads as a tiled mossy texture instead of a flat fill; paths read as a stone ribbon instead of a thin line. Screenshot and compare against the reference images provided earlier in the project for a sanity check on mood — this won't match them exactly (per the spec's explicitly scoped-down art ambition) but should be visibly warmer and more detailed than the Task 17 placeholder version.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/assets/textures src/game/houses.ts src/game/scene.ts src/game/terrain.ts CREDITS.md
git commit -m "feat(frontend): replace placeholder materials with AI-generated textures"
```

---

## Task 25: Deployment — Wrangler config, Pages build, secrets, migration apply

**Files:**
- Modify: `backend/wrangler.toml`
- Create: `backend/DEPLOY.md`
- Create: `frontend/.env.production.example`

**Interfaces:**
- Consumes: a Cloudflare account and the Telegram bot token the user confirmed already exists.
- Produces: a deployed Worker + D1 database + Pages site, and a runbook so this doesn't need to be re-derived later.

- [ ] **Step 1: Write the deploy runbook**

`backend/DEPLOY.md`:

```markdown
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
```

- [ ] **Step 2: Write the frontend env example**

`frontend/.env.production.example`:

```
VITE_API_BASE=https://woodland-neighbours.YOUR-SUBDOMAIN.workers.dev
```

- [ ] **Step 3: Confirm `wrangler.toml` has a placeholder that can't be silently forgotten**

`backend/wrangler.toml` already has `database_id = "REPLACE_WITH_D1_DATABASE_ID"` from Task 1 — leave it as-is; Step 1.2 above is the explicit instruction to replace it, and `wrangler deploy` fails loudly on an invalid ID rather than silently using a wrong database.

- [ ] **Step 4: Commit**

```bash
cd backend
git add DEPLOY.md
git commit -m "docs(backend): add deployment runbook"
cd ../frontend
git add .env.production.example
git commit -m "docs(frontend): add production env example"
```

---

## Post-plan checklist (not a task — for the human partner)

- Push both `backend/` and `frontend/` to `github.com/staffvpn/woodland-neighbours` once that empty repo exists and push access is confirmed (noted as an open item in the spec).
- Supply the real Telegram bot token as the `BOT_TOKEN` Worker secret during Task 25's deploy steps — it was never needed before that point.
- Subprojects B (interior, notes, guests, garden) and C (shared builds, season rotation, events, admin tools) each need their own brainstorming → spec → plan cycle before implementation starts.
