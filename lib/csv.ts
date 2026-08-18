// A leading =, +, -, @ or control character makes Excel and Sheets evaluate a
// cell as a formula when the file is opened. Fields here carry other people's
// display names and item names read off a receipt by OCR, while the person who
// opens the file is the host — so untrusted text would execute in someone
// else's spreadsheet.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

// Plain numbers are exempt: the balance column legitimately starts with a
// minus sign, and quoting those would turn real money into text.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

const NEEDS_QUOTING = /[",\r\n]/;

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((field) => csvEscapeField(field)).join(","))
    .join("\r\n");
}

function csvEscapeField(field: string): string {
  const safe =
    FORMULA_PREFIX.test(field) && !PLAIN_NUMBER.test(field) ? `'${field}` : field;

  if (NEEDS_QUOTING.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
