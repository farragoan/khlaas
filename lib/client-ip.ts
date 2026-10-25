import { isIP } from "node:net";

/**
 * The rate-limit identity of a caller.
 *
 * `x-forwarded-for` is client-writable unless every hop strips it, so it is
 * never read. Instead we trust exactly one header that the platform in front of
 * us sets and overwrites: `x-nf-client-connection-ip` on Netlify by default,
 * or whatever TRUSTED_IP_HEADER names for another proxy (e.g. `cf-connecting-ip`
 * behind Cloudflare, `x-real-ip` behind Caddy). A missing or malformed value
 * maps to one shared "unknown" bucket, so a caller who can strip the header is
 * throttled with everyone else instead of escaping the limit.
 */
export const DEFAULT_TRUSTED_IP_HEADER = "x-nf-client-connection-ip";

export function trustedClientIp(
  headers: Pick<Headers, "get">,
  env: Record<string, string | undefined> = process.env
): string {
  const name = (env.TRUSTED_IP_HEADER || DEFAULT_TRUSTED_IP_HEADER).toLowerCase();
  const value = headers.get(name)?.trim();
  return value && isIP(value) ? value : "unknown";
}
