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
