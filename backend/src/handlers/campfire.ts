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
