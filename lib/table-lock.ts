/**
 * An expired bill is readable forever but frozen.
 *
 * The hourly expiry job only ever touches bills that were never settled
 * (`WHERE status NOT IN ('expired','settled')`), so whatever sits on an expired
 * bill is the last state the group actually agreed on. Letting a late request
 * mutate it would rewrite that record with nobody watching, so every mutating
 * route checks the status before writing.
 *
 * 409 rather than 403: the caller is not unauthorised, the bill is simply no
 * longer in a state that accepts writes.
 */
export const EXPIRED_ERROR = "This bill has expired and is now read-only";
export const EXPIRED_STATUS = 409;

export function isExpired(status: string | null | undefined): boolean {
  return status === "expired";
}
