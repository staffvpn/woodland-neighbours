import { describe, it, expect } from "vitest";
import { handlePlaceHouse } from "../../src/handlers/houses";
import { isInRiver, isFarEnoughFromAll, RIVER_HALF_WIDTH, HOUSE_HALF_WIDTH } from "../../src/core/placement";
import type { Env } from "../../src/router";

interface FakeHouseRow {
  owner_telegram_id: number;
  shape: number;
  x: number;
  y: number;
}

function makeFakeDB(opts: { isFounder: boolean; existingHouses: FakeHouseRow[] }) {
  const houses: FakeHouseRow[] = [...opts.existingHouses];

  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        async run() {
          if (sql.startsWith("INSERT INTO houses")) {
            const [ownerTelegramId, shape, x, y] = bound as [number, number, number, number];
            houses.push({ owner_telegram_id: ownerTelegramId, shape, x, y });
            return { meta: { changes: 1 } };
          }
          throw new Error(`unexpected run() for: ${sql}`);
        },
        async first<T>() {
          if (sql.startsWith("SELECT id FROM houses")) {
            const [ownerTelegramId] = bound as [number];
            const found = houses.find((h) => h.owner_telegram_id === ownerTelegramId);
            return (found ? { id: 1 } : null) as unknown as T;
          }
          if (sql.startsWith("SELECT is_founder FROM users")) {
            return { is_founder: opts.isFounder ? 1 : 0 } as unknown as T;
          }
          throw new Error(`unexpected first() for: ${sql}`);
        },
        async all<T>() {
          if (sql.startsWith("SELECT x, y FROM houses")) {
            return { results: houses.map((h) => ({ x: h.x, y: h.y })) } as unknown as { results: T[] };
          }
          throw new Error(`unexpected all() for: ${sql}`);
        },
      };
      return statement;
    },
  };
}

describe("handlePlaceHouse founder fallback (I2 fix)", () => {
  it("places the founder at FOUNDER_POSITION when nothing conflicts", async () => {
    const db = makeFakeDB({ isFounder: true, existingHouses: [] });
    const env = { DB: db as unknown as Env["DB"], BOT_TOKEN: "x" };

    const res = await handlePlaceHouse(env, { id: 1, firstName: "Founder" }, 1);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ x: 6, y: -3 });
  });

  it("falls back to findHousePlacement when FOUNDER_POSITION collides with an existing house", async () => {
    const existingHouses: FakeHouseRow[] = [{ owner_telegram_id: 99, shape: 1, x: 6, y: -3 }];
    const db = makeFakeDB({ isFounder: true, existingHouses });
    const env = { DB: db as unknown as Env["DB"], BOT_TOKEN: "x" };

    const res = await handlePlaceHouse(env, { id: 1, firstName: "Founder" }, 1);
    const body = (await res.json()) as { x: number; y: number };

    expect(res.status).toBe(201);
    expect(body).not.toMatchObject({ x: 6, y: -3 });
    expect(isFarEnoughFromAll({ x: body.x, y: body.y }, existingHouses.map((h) => ({ x: h.x, y: h.y })))).toBe(true);
    expect(isInRiver(body)).toBe(false);
    expect(Math.abs(body.x)).toBeGreaterThanOrEqual(RIVER_HALF_WIDTH + HOUSE_HALF_WIDTH);
  });
});
