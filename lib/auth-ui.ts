/**
 * Shared options for every Clerk auth modal in the app.
 *
 * `withSignUp` puts the modal into Clerk's combined sign-in-or-up flow. Without
 * it, authenticating with a Google account Clerk has never seen fails with
 * `external_account_not_found` — the dead end users were hitting when they
 * pressed "Sign in" without having registered first. With it, Clerk creates the
 * account in place, so there is one entry point for new and returning users.
 */
export const AUTH_MODAL_PROPS = { withSignUp: true } as const;
