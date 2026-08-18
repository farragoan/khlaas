export function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((field) => csvEscapeField(field)).join(","))
    .join("\r\n");
}

function csvEscapeField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
