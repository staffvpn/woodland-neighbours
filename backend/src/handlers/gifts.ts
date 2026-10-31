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
