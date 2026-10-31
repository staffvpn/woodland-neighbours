import { describe, it, expect, beforeEach } from "vitest";
import { handlePing } from "../../src/handlers/users";
import type { Env } from "../../src/router";

interface FakeUserRow {
  telegram_id: number;
  nickname: string;
  scarf_color: string;
  hat_style: string;
  is_founder: number;
  created_at: number;
  last_seen_at: number;
}

function makeFakeDB() {
  const rows: FakeUserRow[] = [];

  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        async run() {
          if (sql.startsWith("UPDATE")) {
            const [nickname, lastSeenAt, telegramId] = bound as [string, number, number];
            const row = rows.find((r) => r.telegram_id === telegramId);
            if (!row) return { meta: { changes: 0 } };
            row.nickname = nickname;
            row.last_seen_at = lastSeenAt;
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("INSERT")) {
            const [telegramId, nickname, scarfColor, isFounder, createdAt, lastSeenAt] = bound as [
              number, string, string, number, number, number,
            ];
            rows.push({
              telegram_id: telegramId,
              nickname,
              scarf_color: scarfColor,
              hat_style: "none",
              is_founder: isFounder,
              created_at: createdAt,
              last_seen_at: lastSeenAt,
            });
            return { meta: { changes: 1 } };
          }
          throw new Error(`unexpected run() for: ${sql}`);
        },
        async first<T>() {
          if (sql.startsWith("SELECT COUNT")) {
            return { cnt: rows.length } as unknown as T;
          }
          if (sql.startsWith("SELECT * FROM users")) {
            const [telegramId] = bound as [number];
            return (rows.find((r) => r.telegram_id === telegramId) ?? null) as unknown as T;
          }
          throw new Error(`unexpected first() for: ${sql}`);
        },
      };
      return statement;
    },
  };
}

describe("handlePing", () => {
  let db: ReturnType<typeof makeFakeDB>;
  let env: Env;

  beforeEach(() => {
    db = makeFakeDB();
    env = { DB: db as unknown as Env["DB"], BOT_TOKEN: "x" };
  });

  it("creates the first-ever user as founder", async () => {
    const res = await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const body = await res.json();
    expect(body).toMatchObject({ telegramId: 1, isFounder: true });
  });

  it("creates a second user as non-founder", async () => {
    await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const res = await handlePing(env, { id: 2, username: "sam", firstName: "Sam" });
    const body = await res.json();
    expect(body).toMatchObject({ telegramId: 2, isFounder: false });
  });

  it("updates last_seen_at on a repeat ping without changing founder status", async () => {
    await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const res = await handlePing(env, { id: 1, username: "alex", firstName: "Alex" });
    const body = await res.json();
    expect(body).toMatchObject({ telegramId: 1, isFounder: true });
  });
});
