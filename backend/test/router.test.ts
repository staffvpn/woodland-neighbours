import { describe, it, expect } from "vitest";
import { handleRequest, type Env } from "../src/router";

async function signInitData(params: Record<string, string>, botToken: string): Promise<string> {
  const dataCheckString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretKeyBytes = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken));

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(dataCheckString));
  const hashHex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const search = new URLSearchParams({ ...params, hash: hashHex });
  return search.toString();
}

const BOT_TOKEN = "123456:TEST-TOKEN";

async function validInitData(userId: number): Promise<string> {
  const authDate = String(Math.floor(Date.now() / 1000));
  const user = JSON.stringify({ id: userId, first_name: "Tester" });
  return signInitData({ auth_date: authDate, user }, BOT_TOKEN);
}

describe("CORS (C1 fix)", () => {
  it("responds to an OPTIONS preflight with CORS headers and no auth requirement", async () => {
    const env = {} as Env;
    const res = await handleRequest(new Request("https://x/houses", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("adds CORS headers to a normal response", async () => {
    const env = {} as Env;
    const res = await handleRequest(new Request("https://x/health"), env);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("internal error handling (I4 fix)", () => {
  it("returns a JSON 500 instead of crashing when a handler throws", async () => {
    const throwingDB = {
      prepare() {
        throw new Error("boom");
      },
    };
    const env = { DB: throwingDB, BOT_TOKEN: BOT_TOKEN } as unknown as Env;
    const initData = await validInitData(1);

    const res = await handleRequest(
      new Request("https://x/houses", { headers: { "x-telegram-init-data": initData } }),
      env,
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "internal_error" });
  });
});

describe("read endpoints require auth (I5 fix)", () => {
  const readRoutes = ["/houses", "/resources", "/campfire/online", "/houses/1/items", "/houses/1/gifts", "/inventory"];

  for (const path of readRoutes) {
    it(`GET ${path} returns 401 without initData`, async () => {
      const env = { BOT_TOKEN: BOT_TOKEN } as unknown as Env;
      const res = await handleRequest(new Request(`https://x${path}`), env);
      expect(res.status).toBe(401);
    });
  }
});
