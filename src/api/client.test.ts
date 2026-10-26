import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, request } from "./client";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("request", () => {
  it("returns the parsed body on 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }, 200)),
    );
    await expect(request<{ ok: boolean }>("/health")).resolves.toEqual({
      ok: true,
    });
    vi.unstubAllGlobals();
  });

  it("throws ApiError with the envelope code on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: "not_found",
              message: "Item not found",
              details: null,
            },
          },
          404,
        ),
      ),
    );
    const error = await request("/items/1").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("not_found");
    expect((error as ApiError).message).toBe("Item not found");
    expect((error as ApiError).status).toBe(404);
    vi.unstubAllGlobals();
  });

  it("falls back to a generic envelope when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>bad gateway</html>", { status: 502 }),
      ),
    );
    const error = await request("/items").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("internal_error");
    vi.unstubAllGlobals();
  });

  it("throws NetworkError when fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(request("/health")).rejects.toBeInstanceOf(NetworkError);
    vi.unstubAllGlobals();
  });

  it("never puts the API key in a URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ runs: [] }, 202));
    vi.stubGlobal("fetch", fetchMock);
    const { withApiKey } = await import("./client");
    await request(
      "/collect/run",
      withApiKey("secret-key", { method: "POST", body: "{}" }),
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(
      "secret-key",
    );
    vi.unstubAllGlobals();
  });
});
