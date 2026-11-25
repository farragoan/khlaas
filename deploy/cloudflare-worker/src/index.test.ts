import { describe, expect, it, vi } from "vitest";
import {
  buildUpstreamRequest,
  handleRequest,
  isKhlaasPath,
  unavailableResponse,
  type FetchBinding,
} from "./index";

function bindingWith(fetchImpl: (request: Request) => Promise<Response>): FetchBinding {
  return { fetch: vi.fn(fetchImpl) };
}

describe("isKhlaasPath", () => {
  it("matches only the app root and its descendants", () => {
    expect(isKhlaasPath("/khlaas")).toBe(true);
    expect(isKhlaasPath("/khlaas/")).toBe(true);
    expect(isKhlaasPath("/khlaas/api/tables")).toBe(true);
    expect(isKhlaasPath("/khlaasx")).toBe(false);
    expect(isKhlaasPath("/other/khlaas")).toBe(false);
  });
});

describe("buildUpstreamRequest", () => {
  it("uses HTTP on the public host and preserves path, query, method and body", async () => {
    const request = new Request("https://dhruvnagpal.in/khlaas/api/tables?limit=2", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "CF-Connecting-IP": "203.0.113.9" },
      body: "payload",
    });

    const upstream = buildUpstreamRequest(request);
    expect(upstream.url).toBe("http://dhruvnagpal.in/khlaas/api/tables?limit=2");
    expect(upstream.method).toBe("POST");
    expect(upstream.redirect).toBe("manual");
    expect(upstream.headers.get("Content-Type")).toBe("text/plain");
    expect(upstream.headers.get("X-Forwarded-Host")).toBe("dhruvnagpal.in");
    expect(upstream.headers.get("X-Forwarded-Proto")).toBe("https");
    expect(upstream.headers.get("X-Forwarded-For")).toBe("203.0.113.9");
    expect(upstream.headers.get("X-Real-IP")).toBe("203.0.113.9");
    await expect(upstream.text()).resolves.toBe("payload");
  });

  it("removes every client-supplied forwarding header", () => {
    const request = new Request("https://dhruvnagpal.in/khlaas/", {
      headers: {
        Forwarded: "for=192.0.2.1",
        "X-Forwarded-For": "192.0.2.1",
        "X-Forwarded-Host": "evil.example",
        "X-Forwarded-Proto": "http",
        "X-Forwarded-Client-Cert": "spoofed",
        "X-Real-IP": "192.0.2.1",
        "CF-Connecting-IP": "198.51.100.7",
      },
    });

    const headers = buildUpstreamRequest(request).headers;
    expect(headers.get("Forwarded")).toBeNull();
    expect(headers.get("X-Forwarded-Client-Cert")).toBeNull();
    expect(headers.get("X-Forwarded-Host")).toBe("dhruvnagpal.in");
    expect(headers.get("X-Forwarded-Proto")).toBe("https");
    expect(headers.get("X-Forwarded-For")).toBe("198.51.100.7");
    expect(headers.get("X-Real-IP")).toBe("198.51.100.7");
  });
});

describe("handleRequest", () => {
  it("passes non-app paths to the normal origin untouched", async () => {
    const request = new Request("https://dhruvnagpal.in/khlaasx");
    const response = new Response("origin");
    const originFetch = vi.fn<typeof fetch>().mockResolvedValue(response);
    const binding = bindingWith(async () => new Response("app"));

    await expect(handleRequest(request, binding, originFetch)).resolves.toBe(response);
    expect(originFetch).toHaveBeenCalledWith(request);
    expect(binding.fetch).not.toHaveBeenCalled();
  });

  it("returns the VPC response unchanged", async () => {
    const response = new Response("app", {
      status: 302,
      headers: { Location: "https://dhruvnagpal.in/khlaas/sign-in" },
    });
    response.headers.append("Set-Cookie", "first=1; Path=/khlaas");
    response.headers.append("Set-Cookie", "second=2; Path=/khlaas");
    const binding = bindingWith(async () => response);

    const result = await handleRequest(new Request("https://dhruvnagpal.in/khlaas/"), binding);
    expect(result).toBe(response);
    expect(result.headers.get("Location")).toBe("https://dhruvnagpal.in/khlaas/sign-in");
    expect(result.headers.getSetCookie()).toEqual(["first=1; Path=/khlaas", "second=2; Path=/khlaas"]);
  });

  it("turns binding failures into an uncacheable 502", async () => {
    const binding = bindingWith(async () => {
      throw new Error("tunnel down");
    });

    const response = await handleRequest(new Request("https://dhruvnagpal.in/khlaas/"), binding);
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toContain("khlaas is temporarily unavailable");
  });
});

describe("unavailableResponse", () => {
  it("is HTML and does not cache", async () => {
    const response = unavailableResponse();
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toContain("temporarily unavailable");
  });
});
