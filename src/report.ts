import type { Report } from "./count";

function table(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length)),
  );
  const render = (row: readonly (string | number)[]) =>
    row
      .map((cell, index) => {
        const value = String(cell);
        const width = widths[index] ?? value.length;
        return index === 0 ? value.padEnd(width) : value.padStart(width);
      })
      .join("  ")
      .trimEnd();
  return [render(headers), ...rows.map(render)].join("\n");
}

export function renderReport(report: Report, showFiles: boolean): string {
  if (report.totals.files === 0) return "No supported source files found.";

  const headers = ["Language", "Files", "Lines", "Code", "Comments", "Blank", "Mixed"];
  const rows: (string | number)[][] = report.languages.map((item) => [
    item.language,
    item.files,
    item.lines,
    item.code,
    item.comments,
    item.blank,
    item.mixed,
  ]);
  rows.push([
    "Total",
    report.totals.files,
    report.totals.lines,
    report.totals.code,
    report.totals.comments,
    report.totals.blank,
    report.totals.mixed,
  ]);
  const summary = table(headers, rows);
  if (!showFiles) return summary;

  const fileHeaders = ["File", "Language", "Lines", "Code", "Comments", "Blank", "Mixed"];
  const fileRows = report.files.map((item) => [
    item.path,
    item.language,
    item.lines,
    item.code,
    item.comments,
    item.blank,
    item.mixed,
  ]);
  return `${summary}\n\n${table(fileHeaders, fileRows)}`;
}
