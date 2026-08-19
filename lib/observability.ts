import { PostHog } from "posthog-node";

/**
 * Server-side error reporting.
 *
 * Every rule in docs/ENGINEERING.md #1 exists because a `catch` swallowed
 * something. `console.error` alone was not enough — Netlify keeps the logs but
 * nobody reads them, so a retired Gemini model sat broken for days. This sends
 * the same error somewhere that can alert.
 *
 * Reporting must never be the reason a request fails: every path here is
 * best-effort and falls back to the console.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!POSTHOG_KEY) return null;
  if (!client) {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Serverless functions are frozen between invocations, so a batch that
      // has not been sent by the time the response returns may never be sent.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export interface ErrorContext {
  /** What was being attempted, in the words you'd use to a colleague. */
  operation: string;
  /** Anything that helps reproduce it. Never put user emails or names here. */
  [key: string]: unknown;
}

/**
 * Report a server-side error. Always logs; also sends to PostHog when
 * configured. Returns once the event is flushed so a serverless freeze cannot
 * drop it.
 */
export async function reportError(err: unknown, context: ErrorContext): Promise<void> {
  const error = err instanceof Error ? err : new Error(String(err));

  console.error(`[${context.operation}]`, error);

  const posthog = getClient();
  if (!posthog) return;

  try {
    posthog.captureException(error, undefined, {
      ...context,
      $process_person_profile: false,
    });
    await posthog.flush();
  } catch (reportingFailure) {
    // The original error is the one that matters; a broken reporter must not
    // replace it or take the request down with it.
    console.error("[observability] failed to report error:", reportingFailure);
  }
}

/** True when error reporting is actually wired up, for the admin health check. */
export function isErrorReportingConfigured(): boolean {
  return Boolean(POSTHOG_KEY);
}
