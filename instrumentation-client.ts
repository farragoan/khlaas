import posthog from "posthog-js";

/**
 * Runs after the document loads and before React hydrates, so a crash during
 * hydration is still captured.
 *
 * Wrapped in try/catch on purpose: instrumentation that throws would take down
 * the page it exists to observe.
 */
try {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key) {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // The whole point of wiring this up: unhandled exceptions and promise
      // rejections report themselves instead of waiting for a user to complain.
      capture_exceptions: true,
      capture_pageview: true,
      // Bills are other people's money. Record what broke, not what was typed.
      mask_all_text: true,
      mask_all_element_attributes: true,
      person_profiles: "identified_only",
    });
  }
} catch (err) {
  console.error("[instrumentation-client] PostHog init failed:", err);
}

export function onRouterTransitionStart(url: string) {
  try {
    posthog.capture("$pageleave", { next_url: url });
  } catch {
    // A missed breadcrumb is not worth breaking navigation over.
  }
}
