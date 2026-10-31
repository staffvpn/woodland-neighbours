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
