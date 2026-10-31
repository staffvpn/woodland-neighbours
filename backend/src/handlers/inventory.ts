import type { Env } from "../router";
import type { TelegramUser } from "../core/auth";

interface InventoryRow {
  item_type: string;
  qty: number;
}

export async function handleListInventory(env: Env, user: TelegramUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT item_type, qty FROM inventory WHERE telegram_id = ?",
  )
    .bind(user.id)
    .all<InventoryRow>();

  const dtos = (results ?? []).map((row) => ({ itemType: row.item_type, qty: row.qty }));
  return Response.json(dtos);
}
