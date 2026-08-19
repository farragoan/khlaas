/**
 * The OCR model, in one place.
 *
 * It lives here rather than inside the receipts route so the admin health check
 * can probe the *same* model the scanner uses. A health check that tests a
 * different model than production calls would have reported green through the
 * entire gemini-2.5-flash-lite outage.
 *
 * flash-lite over flash: same vision quality on receipts, and thinking is off
 * by default here whereas the full flash models reason before every answer — a
 * latency tax on each scan for no gain on a fixed extraction task.
 *
 * Pinned to an exact version, not `gemini-flash-lite-latest`: a silent model
 * swap under a schema-constrained extraction is worse than a loud 404. The cost
 * of pinning is that retirements have to be followed — 2.5-flash-lite was
 * withdrawn under us and every scan 404'd until this was bumped. When scans
 * start failing wholesale, check this line first, and check /admin.
 */
export const OCR_MODEL = "gemini-3.5-flash-lite";

export const GOOGLE_AI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${OCR_MODEL}:generateContent`;
