import { describe, it, expect } from "vitest";
import { withCors } from "../../src/core/cors";

describe("withCors", () => {
  it("adds CORS headers while preserving status and body", async () => {
    const original = new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

    const wrapped = withCors(original);

    expect(wrapped.status).toBe(201);
    expect(wrapped.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(wrapped.headers.get("Access-Control-Allow-Headers")).toContain("x-telegram-init-data");
    expect(wrapped.headers.get("content-type")).toBe("application/json");
    const body = await wrapped.json();
    expect(body).toEqual({ ok: true });
  });
});
