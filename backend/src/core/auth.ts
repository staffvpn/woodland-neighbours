export interface TelegramUser {
  id: number;
  username?: string;
  firstName: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDateMs: number }
  | { ok: false; error: string };

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(keyBytes: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

export async function validateInitData(
  initData: string,
  botToken: string,
  nowMs: number,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<InitDataResult> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "missing_hash" };
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const signature = await hmacSha256(secretKey, dataCheckString);
  const computedHash = toHex(signature);

  if (computedHash !== hash) {
    return { ok: false, error: "invalid_signature" };
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    return { ok: false, error: "missing_auth_date" };
  }
  const authDateMs = Number(authDateRaw) * 1000;
  if (!Number.isFinite(authDateMs) || nowMs - authDateMs > maxAgeMs) {
    return { ok: false, error: "stale_auth_date" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: "missing_user" };
  }

  let parsedUser: { id: number; username?: string; first_name: string };
  try {
    parsedUser = JSON.parse(userRaw);
  } catch {
    return { ok: false, error: "invalid_user_json" };
  }

  return {
    ok: true,
    authDateMs,
    user: { id: parsedUser.id, username: parsedUser.username, firstName: parsedUser.first_name },
  };
}
