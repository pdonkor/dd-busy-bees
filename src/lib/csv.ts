/** Builds a CSV file. Cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let s = cell == null ? "" : String(cell);
          if (typeof cell === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}
