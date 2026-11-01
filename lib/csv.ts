export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Formula injection protection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCsv(rows: any[][], headers?: string[]): string {
  const bom = '\uFEFF';
  const lines: string[] = [];
  if (headers) {
    lines.push(headers.map(escapeCsvCell).join(','));
  }
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return bom + lines.join('\r\n') + '\r\n';
}
