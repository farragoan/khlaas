import { isIP } from "node:net";

/**
 * Return the rate-limit identity supplied by the trusted front proxy.
 *
 * The Cloudflare Worker strips all client-provided forwarding headers and sets
 * both `x-real-ip` and a one-hop `x-forwarded-for`. Netlify's header remains a
 * final fallback for that platform. A missing or malformed value maps to one
 * shared "unknown" bucket instead of letting a caller escape the limit.
 */
export const DEFAULT_TRUSTED_IP_HEADER = "x-real-ip";

function validIp(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && isIP(trimmed) ? trimmed : undefined;
}

export function trustedClientIp(
  headers: Pick<Headers, "get">,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (override) return validIp(headers.get(override)) ?? "unknown";

  return (
    validIp(headers.get(DEFAULT_TRUSTED_IP_HEADER)) ??
    validIp(headers.get("x-forwarded-for")?.split(",")[0] ?? null) ??
    validIp(headers.get("x-nf-client-connection-ip")) ??
    "unknown"
  );
}
