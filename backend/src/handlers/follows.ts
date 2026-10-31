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
