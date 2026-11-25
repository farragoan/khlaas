const PUBLIC_HOST = "dhruvnagpal.in";
const APP_PATH = "/khlaas";

export interface FetchBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export function isKhlaasPath(pathname: string): boolean {
  return pathname === APP_PATH || pathname.startsWith(`${APP_PATH}/`);
}

export function buildUpstreamRequest(request: Request): Request {
  const url = new URL(request.url);
  url.protocol = "http:";
  url.host = PUBLIC_HOST;

  const headers = new Headers(request.headers);
  for (const name of Array.from(headers.keys())) {
    if (
      name === "forwarded" ||
      name === "x-real-ip" ||
      name.startsWith("x-forwarded-")
    ) {
      headers.delete(name);
    }
  }

  headers.set("X-Forwarded-Host", PUBLIC_HOST);
  headers.set("X-Forwarded-Proto", "https");

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    headers.set("X-Forwarded-For", clientIp);
    headers.set("X-Real-IP", clientIp);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
    redirect: "manual",
    duplex: "half",
  };
  return new Request(url, init);
}

export function unavailableResponse(): Response {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>khlaas unavailable</title><body><h1>khlaas is temporarily unavailable</h1><p>Please try again shortly.</p></body></html>',
    {
      status: 502,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function handleRequest(
  request: Request,
  binding: FetchBinding,
  originFetch: typeof fetch = fetch,
): Promise<Response> {
  if (!isKhlaasPath(new URL(request.url).pathname)) {
    return originFetch(request);
  }

  try {
    return await binding.fetch(buildUpstreamRequest(request));
  } catch (error) {
    console.error(JSON.stringify({ event: "khlaas_upstream_error", error: String(error) }));
    return unavailableResponse();
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env.KHLAAS);
  },
} satisfies ExportedHandler<Env>;
