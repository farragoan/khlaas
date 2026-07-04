import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "./lib/rate-limit";

const RATE_LIMITS: Array<{
  match: (path: string, method: string) => boolean;
  limit: number;
  windowMs: number;
}> = [
  {
    match: (path) => path.startsWith("/api/receipts"),
    limit: 3,
    windowMs: 60_000,
  },
  {
    match: (path) => path.startsWith("/api/participants"),
    limit: 10,
    windowMs: 60_000,
  },
  {
    match: (path, method) => path.startsWith("/api/tables") && method === "POST",
    limit: 5,
    windowMs: 60_000,
  },
  {
    match: (path) => path.startsWith("/api/"),
    limit: 60,
    windowMs: 60_000,
  },
];

export default clerkMiddleware(async (auth, req) => {
  const url = req.nextUrl;
  if (url.pathname.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const route = RATE_LIMITS.find((r) =>
      r.match(url.pathname, req.method),
    );
    if (route) {
      const allowed = await checkRateLimit(
        `${ip}:${url.pathname}`,
        route.limit,
        route.windowMs,
      );
      if (!allowed) {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429 },
        );
      }
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
