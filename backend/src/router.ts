import { handleHealth } from "./handlers/health";
import { handlePing } from "./handlers/users";
import { handleListHouses, handlePlaceHouse } from "./handlers/houses";
import { handleListResources, handleHarvest } from "./handlers/resources";
import { handleListItems, handlePlaceItem } from "./handlers/items";
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

  if (request.method === "GET" && url.pathname === "/houses") {
    return handleListHouses(env);
  }

  if (request.method === "POST" && url.pathname === "/houses/place") {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await request.json<{ shape?: unknown }>().catch(() => ({}) as { shape?: unknown });
    return handlePlaceHouse(env, auth.user, body.shape);
  }

  if (request.method === "GET" && url.pathname === "/resources") {
    return handleListResources(env);
  }

  const harvestMatch = url.pathname.match(/^\/resources\/(\d+)\/harvest$/);
  if (request.method === "POST" && harvestMatch) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    return handleHarvest(env, auth.user, Number(harvestMatch[1]));
  }

  const itemsListMatch = url.pathname.match(/^\/houses\/(\d+)\/items$/);
  if (request.method === "GET" && itemsListMatch) {
    return handleListItems(env, Number(itemsListMatch[1]));
  }
  if (request.method === "POST" && itemsListMatch) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await request
      .json<{ itemType?: unknown; slot?: unknown }>()
      .catch(() => ({}) as { itemType?: unknown; slot?: unknown });
    return handlePlaceItem(env, auth.user, Number(itemsListMatch[1]), body.itemType, body.slot);
  }

  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
