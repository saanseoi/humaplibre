import { writeFile } from "node:fs/promises";

export async function writeCsvFile(
  file: string,
  columns: string[],
  rows: Array<Record<string, string>>,
): Promise<void> {
  const lines = [
    columns.map(escapeCsv).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column] ?? "")).join(",")),
  ];
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}
