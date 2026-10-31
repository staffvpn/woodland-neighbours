import { validateInitData, type TelegramUser } from "./core/auth";
import type { Env } from "./router";

export type AuthResult = { ok: true; user: TelegramUser } | { ok: false; response: Response };

export async function requireAuth(request: Request, env: Env): Promise<AuthResult> {
  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const result = await validateInitData(initData, env.BOT_TOKEN, Date.now());

  if (!result.ok) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: result.error }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }

  return { ok: true, user: result.user };
}
