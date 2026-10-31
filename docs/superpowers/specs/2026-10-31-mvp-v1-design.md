# Woodland Neighbours — MVP v1 Design

**Date:** 2026-10-31
**Status:** Approved by user, ready for implementation planning
**Scope:** Subproject A only (see Decomposition below). Subprojects B and C are future, separate design→plan→implementation cycles.

## 1. Product Summary

A cozy, slow-paced Telegram Mini App where each player plants one house on a
shared forest clearing, decorates it, forages resources, and gathers with
neighbours at a shared eternal campfire. The village grows organically as
people join; smoke from chimneys signals who's been around recently. Inspired
by games like Cozy Grove / Spiritfarer in tone, not mechanics.

Visual target: isometric, soft warm lighting, painterly detail (see reference
images provided by user — AI-generated diorama renders). True pixel-for-pixel
parity with those renders is not achievable in a real-time browser 3D scene;
the agreed approach (§6) gets meaningfully closer than flat low-poly CC0
assets without that unrealistic goal.

## 2. Decomposition

1. **Subproject A — MVP v1 (this spec):** shared clearing map with river and
   eternal campfire, 3 house shapes, nickname sign, smoke-based activity
   status, auto-generated paths, walkable character, 4 forageable resources,
   10–12 placeable exterior decorations, gifts at the door + following
   neighbours, autumn season, day/night cycle.
2. **Subproject B — v2 (not started):** house interior scene, notes left at
   mailboxes, visiting other houses, the garden/planting mechanic.
3. **Subproject C — v3 (not started):** shared community builds, full season
   rotation, seasonal events, admin tooling.

## 3. Architecture

**Frontend:** Telegram Mini App — React + Vite + TypeScript shell for UI
chrome (inventory, profile, gift drawer, settings), with the game world
rendered by a hand-written Three.js scene mounted into a canvas (not
react-three-fiber — a continuous game loop with camera drag/zoom and
per-frame animation doesn't fit React's render model well; keeping Three.js
imperative avoids fighting the reconciler). Telegram WebApp SDK supplies
`initData`, theme params, and haptics.

**Backend:** Cloudflare Workers (TypeScript) behind a single Worker exposing
a small JSON API, backed by Cloudflare D1 (SQLite). Cloudflare Pages serves
the built frontend. A Cron Trigger is intentionally *not* used for
smoke/decay (see §5) — the only scheduled job needed is none for v1; resource
respawn is handled per-node via timestamps, not a sweep.

**Auth:** Every API request carries Telegram's `initData` string; the Worker
validates its HMAC-SHA256 signature against the bot token (standard Telegram
Mini App auth) and extracts `telegram_id`. No separate session/JWT layer —
stateless validation on each call, matching the pattern already used
elsewhere in the user's projects.

## 4. Data Model (D1)

- `users`: `telegram_id` (PK), `nickname`, `scarf_color`, `hat_style`,
  `is_founder` (bool, the very first registered user), `created_at`,
  `last_seen_at`.
- `houses`: `id` (PK), `owner_telegram_id` (FK, unique — one house per
  user), `shape` (1|2|3), `x`, `y`, `placed_at`.
- `placed_items`: `id`, `house_id` (FK), `item_type`, `slot`, `placed_at`.
- `resource_nodes`: `id`, `type` (branch|stone|mushroom|berry), `x`, `y`,
  `available` (bool), `respawns_at` (nullable timestamp).
- `inventory`: `telegram_id`, `item_type`, `qty` — composite PK
  (`telegram_id`, `item_type`).
- `gifts`: `id`, `from_telegram_id`, `to_house_id`, `item_type`,
  `created_at`.
- `follows`: `follower_telegram_id`, `followee_telegram_id` — composite PK.

No `paths` table and no `decay`/`smoke` table — both are derived, not
stored (see §5).

## 5. Key Mechanics

**House placement.** Client requests "place a house" with a chosen shape
(1 of 3). The Worker computes a valid position server-side: minimum
distance from every existing house, not inside the river polygon, within
the current settlement radius (a simple function of house count — radius
grows as `sqrt(house_count) * k`), searched via an expanding ring/spiral
from the village center. The client never proposes its own coordinates.
Forest clearing is not persisted per-tree: the client procedurally omits
trees inside the current settlement radius using the same seeded
noise function used to scatter them, so "the clearing expands" falls out
of the radius growing, with no tree-removal state to track. The first
user ever registered is flagged `is_founder` and their house is placed
at a fixed, slightly-closer-to-the-campfire ring than the normal
placement search — a small permanent nod to being first, not a gameplay
advantage.

**Paths.** Derived purely from the current list of house positions,
recomputed client-side at render time (nearest-existing-path-node search
with a light noise offset for an organic look). No backend storage.

**Smoke / decay.** Both are pure functions of `users.last_seen_at`,
evaluated wherever a house is rendered: smoke visible if
`now - last_seen_at < 3 days`; ivy/overgrowth visible if
`now - last_seen_at > 14 days`. `last_seen_at` is updated by a lightweight
"ping" endpoint the client calls on open and then every ~60s while active.
No cron job sweeps for this — it's computed, not stored.

**Online status at the campfire.** Client polls a `GET /campfire/online`
endpoint every 15–30s, which returns users with `last_seen_at` inside the
last ~2 minutes. This is a deliberate choice over Durable Objects +
WebSockets: the game's pace doesn't need sub-second presence, and polling
keeps the backend stateless and cheap. Revisit only if this proves
insufficient after launch.

**Resource gathering.** ~15–20 fixed-position `resource_nodes` across the
map (4 types: branches, stones, mushrooms, berries). Harvesting an
available node sets `available = false` and `respawns_at = now + 24h`;
a node becomes available again lazily (checked on read, no sweep needed)
once `now >= respawns_at`. Deliberately per-node rolling respawn, not a
global midnight reset, so there's no "everyone farms at 00:00" rush.

**Gifts.** Placing a gift at another player's door inserts into `gifts`.
Daily limit: a sender may place at most 3 gifts per calendar day
(UTC), enforced by counting that sender's `gifts` rows with
`created_at` in the current day before allowing an insert.

**Following.** Simple insert/delete into `follows`. Used client-side to
highlight followed neighbours' houses and smoke on the map. No
notifications in v1 (explicitly out of scope — matches the "minimal but
beautiful" MVP instinct).

**Day/night and season.** Computed client-side from real wall-clock time
(day/night) and a fixed "autumn" palette for v1 (season rotation is
Subproject C). No server involvement.

## 6. Art Pipeline

Geometry stays simple and hand-built in code: houses are a small kit of
primitives (box walls + angled-prism roof + plane door/window cutouts,
3 shape variants), the character is a capsule body + sphere head with two
tintable accessory meshes (scarf, hat), trees/rocks are instanced
low-poly meshes for performance.

Visual richness comes from **AI-generated textures**, not polygon count:
wood-log wall textures, 2–3 shingle-roof color variants, mossy ground,
stone path, water normal/flow maps — generated as 2D images (via the
image-generation skill, and optionally Higgsfield MCP for broader model
access) and UV-mapped onto the simple geometry. Combined with Three.js
post-processing (soft bloom, light fog, warm color grading), this is
the agreed middle ground: keeps true interactive 3D (free camera,
rotation, walking) while getting noticeably closer to the reference mood
than flat CC0 assets would, without the cost/complexity of paid AI 3D
model generation.

A `CREDITS.md` will track any third-party asset provenance if any
CC0/CC-BY pieces end up used as a base (e.g., tree/rock silhouettes), even
though the primary detail layer is generated textures.

## 7. Testing

Backend logic that has real decision complexity gets unit tests
(Vitest): placement algorithm (distance/river/radius constraints),
resource respawn timing, gift daily-limit enforcement, and the
smoke/decay pure functions. Auth (initData HMAC validation) gets tests
against known-good and tampered payloads.

Frontend/visual work is verified manually: dev server + Playwright
screenshots at key milestones (first house placed, campfire with multiple
users, night lighting, gifting flow) rather than automated rendering
assertions — matches how visual-heavy work has been verified on the
user's other projects.

## 8. Open Items for Implementation

- Telegram bot: user confirmed one already exists; the actual token/
  username needs to be supplied as a Worker secret during deployment
  setup, not needed for earlier implementation steps.
- GitHub repo `staffvpn/woodland-neighbours` needs to be created (empty)
  and push access confirmed before the first push — local git history can
  start immediately regardless.
- Cloudflare account auth: prior projects on this machine use a Custom
  API Token (Account: Workers Scripts:Edit + D1:Edit) rather than
  `wrangler login`, because OAuth login's local callback server doesn't
  work reliably on this machine. Reuse that pattern.
