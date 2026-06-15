const CYAN = "\u001B[36m";
const RESET = "\u001B[0m";

export interface ExportSummary {
  project: string;
  collections: number;
  records: number;
  images: number;
}

export function createEmptySummary(project: string): ExportSummary {
  return {
    project,
    collections: 0,
    records: 0,
    images: 0,
  };
}

export function renderExportSummary(summary: ExportSummary): string {
  return [
    formatSummaryLine("Project", summary.project),
    formatSummaryLine("Collections", summary.collections),
    formatSummaryLine("Records", summary.records),
    formatSummaryLine("Images", summary.images),
  ].join("\n");
}

export interface HypeSummary {
  locale: string;
  ok: number;
  error: number;
  skip: number;
}

export function createHypeSummary(
  locale: string,
  rows: Array<Record<string, string>>,
): HypeSummary {
  return rows.reduce<HypeSummary>(
    (summary, row) => {
      if (row.status === "OK") {
        summary.ok += 1;
      } else if (row.status === "ERROR") {
        summary.error += 1;
      } else {
        summary.skip += 1;
      }
      return summary;
    },
    { locale, ok: 0, error: 0, skip: 0 },
  );
}

export function renderHypeSummary(summary: HypeSummary): string {
  return [
    formatSummaryLine("Locale", summary.locale),
    formatSummaryLine("OK", summary.ok),
    formatSummaryLine("ERROR", summary.error),
    formatSummaryLine("SKIP", summary.skip),
  ].join("\n");
}

function formatSummaryLine(key: string, value: string | number): string {
  return `${CYAN}${key}:${RESET} ${value}`;
}
