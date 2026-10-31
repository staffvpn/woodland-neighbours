import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";
import { findHousePlacement, FOUNDER_POSITION, isFarEnoughFromAll } from "../core/placement";
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

  const founderPositionFree = userRow?.is_founder === 1 && isFarEnoughFromAll(FOUNDER_POSITION, existingHouses);
  const point = founderPositionFree ? FOUNDER_POSITION : findHousePlacement(existingHouses);

  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO houses (owner_telegram_id, shape, x, y, placed_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(user.id, shape, point.x, point.y, now)
    .run();

  return Response.json({ id: 0, ownerTelegramId: user.id, shape, x: point.x, y: point.y }, { status: 201 });
}
