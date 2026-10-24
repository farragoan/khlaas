/**
 * Public path prefix the app is served under (e.g. "/khlaas"), or "" at root.
 *
 * next.config.ts applies this as `basePath`, which Next auto-prefixes for
 * next/link, next/image and next/navigation. Raw strings (fetch URLs, plain
 * <a>/<img> hrefs, absolute origins) are not prefixed, so they must use BASE.
 */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
