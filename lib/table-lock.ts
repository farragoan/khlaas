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

/**
 * A settled bill is frozen for the same reason: the ledger was derived from the
 * selections and payments as they stood, so rewriting either afterwards makes
 * the record disagree with the transfers people were told to make.
 */
export const SETTLED_ERROR = "This bill has been settled and is now read-only";
export const SETTLED_STATUS = 409;

export function isSettled(status: string | null | undefined): boolean {
  return status === "settled";
}

/** Selections and participant edits are refused on expired and settled bills. */
export function lockedError(
  status: string | null | undefined
): { error: string; status: number } | null {
  if (isExpired(status)) return { error: EXPIRED_ERROR, status: EXPIRED_STATUS };
  if (isSettled(status)) return { error: SETTLED_ERROR, status: SETTLED_STATUS };
  return null;
}
