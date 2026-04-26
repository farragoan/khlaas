import { clerkMiddleware } from "@clerk/nextjs/server";

// Passive mode — no routes are blocked. Clerk only enriches server context
// with the authenticated user identity where present.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
