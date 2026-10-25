import { describe, it, expect } from "vitest";
import { trustedClientIp } from "./client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("trustedClientIp", () => {
  it("uses the Netlify-set header by default", () => {
    expect(trustedClientIp(h({ "x-nf-client-connection-ip": "203.0.113.9" }), {})).toBe("203.0.113.9");
  });
  it("ignores a client-supplied x-forwarded-for entirely", () => {
    expect(trustedClientIp(h({ "x-forwarded-for": "1.2.3.4" }), {})).toBe("unknown");
    expect(
      trustedClientIp(h({ "x-forwarded-for": "9.9.9.9", "x-nf-client-connection-ip": "203.0.113.9" }), {})
    ).toBe("203.0.113.9");
  });
  it("rotating spoofed XFF values cannot change the key", () => {
    const keys = new Set(
      ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((ip) =>
        trustedClientIp(h({ "x-forwarded-for": ip, "x-nf-client-connection-ip": "198.51.100.7" }), {})
      )
    );
    expect(keys.size).toBe(1);
  });
  it("honours TRUSTED_IP_HEADER for other proxies, case-insensitively", () => {
    expect(trustedClientIp(h({ "cf-connecting-ip": "2001:db8::1" }), { TRUSTED_IP_HEADER: "CF-Connecting-IP" })).toBe(
      "2001:db8::1"
    );
  });
  it("does not fall back to the Netlify header when another is configured", () => {
    expect(
      trustedClientIp(h({ "x-nf-client-connection-ip": "203.0.113.9" }), { TRUSTED_IP_HEADER: "x-real-ip" })
    ).toBe("unknown");
  });
  it("rejects values that are not IP addresses", () => {
    expect(trustedClientIp(h({ "x-nf-client-connection-ip": "not-an-ip, 1.2.3.4" }), {})).toBe("unknown");
    expect(trustedClientIp(h({ "x-nf-client-connection-ip": "" }), {})).toBe("unknown");
  });
});
