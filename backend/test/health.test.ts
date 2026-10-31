import { describe, it, expect } from "vitest";
import { handleRequest, type Env } from "../src/router";

describe("GET /health", () => {
  it("returns ok:true", async () => {
    const env = {} as Env;
    const res = await handleRequest(new Request("https://x/health"), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 404 for unknown routes", async () => {
    const env = {} as Env;
    const res = await handleRequest(new Request("https://x/nope"), env);
    expect(res.status).toBe(404);
  });
});
