import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeCsvFile(
  file: string,
  columns: string[],
  rows: Array<Record<string, string>>,
): Promise<void> {
  const lines = [
    columns.map(escapeCsv).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column] ?? "")).join(",")),
  ];
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

export async function readCsvFile(file: string): Promise<Array<Record<string, string>>> {
  const contents = await readFile(file, "utf8");
  return parseCsv(contents);
}

function parseCsv(input: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";
      rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [header = [], ...records] = rows.filter((values) => values.some((value) => value.length > 0));
  return records.map((values) =>
    Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""]))
  );
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}
