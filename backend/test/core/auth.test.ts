import { describe, it, expect } from "vitest";
import { validateInitData } from "../../src/core/auth";

const BOT_TOKEN = "123456:TEST-TOKEN";

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

describe("validateInitData", () => {
  it("accepts a correctly signed, fresh payload", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 10);
    const user = JSON.stringify({ id: 42, username: "forest_fan", first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const result = await validateInitData(initData, BOT_TOKEN, nowMs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual({ id: 42, username: "forest_fan", firstName: "Alex" });
    }
  });

  it("rejects a tampered payload", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 10);
    const user = JSON.stringify({ id: 42, first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, BOT_TOKEN);
    const tampered = initData.replace("Alex", "Mallory");

    const result = await validateInitData(tampered, BOT_TOKEN, nowMs);

    expect(result.ok).toBe(false);
  });

  it("rejects a payload signed with the wrong bot token", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 10);
    const user = JSON.stringify({ id: 42, first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, "999:OTHER-TOKEN");

    const result = await validateInitData(initData, BOT_TOKEN, nowMs);

    expect(result.ok).toBe(false);
  });

  it("rejects a stale payload older than maxAgeMs", async () => {
    const nowMs = 1_800_000_000_000;
    const authDate = String(Math.floor(nowMs / 1000) - 7200);
    const user = JSON.stringify({ id: 42, first_name: "Alex" });
    const initData = await signInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const result = await validateInitData(initData, BOT_TOKEN, nowMs, 3600_000);

    expect(result.ok).toBe(false);
  });

  it("rejects a payload missing the hash field", async () => {
    const result = await validateInitData("user=%7B%7D&auth_date=1", BOT_TOKEN, 1_800_000_000_000);
    expect(result.ok).toBe(false);
  });
});
