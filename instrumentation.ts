import type { Instrumentation } from "next";
import { reportError } from "@/lib/observability";

/**
 * Next.js hands every uncaught server error to this hook — Server Components,
 * route handlers, and server actions alike. It is the backstop for the errors
 * no `catch` block saw coming.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  await reportError(err, {
    operation: "unhandled server error",
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
