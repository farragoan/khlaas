import { describe, expect, it } from "vitest";
import { trustedClientIp } from "./client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("trustedClientIp", () => {
  it("uses the Worker-set X-Real-IP by default", () => {
    expect(trustedClientIp(h({ "x-real-ip": "203.0.113.9" }), {})).toBe("203.0.113.9");
  });

  it("uses the first Worker-set X-Forwarded-For hop as a fallback", () => {
    expect(
      trustedClientIp(h({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" }), {}),
    ).toBe("2001:db8::1");
  });

  it("prefers X-Real-IP over other forwarding headers", () => {
    expect(
      trustedClientIp(
        h({
          "x-real-ip": "203.0.113.9",
          "x-forwarded-for": "198.51.100.7",
          "x-nf-client-connection-ip": "192.0.2.1",
        }),
        {},
      ),
    ).toBe("203.0.113.9");
  });

  it("keeps Netlify support only as a final fallback", () => {
    expect(
      trustedClientIp(h({ "x-nf-client-connection-ip": "203.0.113.9" }), {}),
    ).toBe("203.0.113.9");
    expect(
      trustedClientIp(
        h({
          "x-forwarded-for": "198.51.100.7",
          "x-nf-client-connection-ip": "203.0.113.9",
        }),
        {},
      ),
    ).toBe("198.51.100.7");
  });

  it("cannot be rotated by a spoofed Netlify header behind the Worker", () => {
    const keys = new Set(
      ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((ip) =>
        trustedClientIp(
          h({ "x-nf-client-connection-ip": ip, "x-real-ip": "198.51.100.7" }),
          {},
        ),
      ),
    );
    expect(keys).toEqual(new Set(["198.51.100.7"]));
  });

  it("honours TRUSTED_IP_HEADER for other proxies, case-insensitively", () => {
    expect(
      trustedClientIp(h({ "cf-connecting-ip": "2001:db8::1" }), {
        TRUSTED_IP_HEADER: "CF-Connecting-IP",
      }),
    ).toBe("2001:db8::1");
  });

  it("does not fall back to other headers when an override is configured", () => {
    expect(
      trustedClientIp(h({ "x-real-ip": "203.0.113.9" }), {
        TRUSTED_IP_HEADER: "cf-connecting-ip",
      }),
    ).toBe("unknown");
  });

  it("rejects missing and malformed values", () => {
    expect(trustedClientIp(h({ "x-real-ip": "not-an-ip" }), {})).toBe("unknown");
    expect(trustedClientIp(h({ "x-forwarded-for": "not-an-ip, 1.2.3.4" }), {})).toBe("unknown");
    expect(trustedClientIp(h({ "x-real-ip": "" }), {})).toBe("unknown");
    expect(trustedClientIp(h({}), {})).toBe("unknown");
  });
});
