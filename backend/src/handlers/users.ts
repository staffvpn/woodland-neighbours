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
