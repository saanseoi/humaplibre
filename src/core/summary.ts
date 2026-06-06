import type { ExportMode, LayerMode, MapMode } from "../domain/manifest.ts";

export interface ExportSummary {
  project: string;
  mode: ExportMode;
  mapMode: MapMode;
  layerMode: LayerMode;
  mapsProcessed: number;
  collectionsWritten: number;
  featuresWritten: number;
  featuresSkipped: number;
  imagesDownloaded: number;
  duplicatesSkipped: number;
  duplicatesReplaced: number;
}

export function createEmptySummary(
  project: string,
  mode: ExportMode,
  mapMode: MapMode,
  layerMode: LayerMode,
): ExportSummary {
  return {
    project,
    mode,
    mapMode,
    layerMode,
    mapsProcessed: 0,
    collectionsWritten: 0,
    featuresWritten: 0,
    featuresSkipped: 0,
    imagesDownloaded: 0,
    duplicatesSkipped: 0,
    duplicatesReplaced: 0,
  };
}

export function renderExportSummary(summary: ExportSummary): string {
  return [
    `project: ${summary.project}`,
    `mode: ${summary.mode}`,
    `maps: ${summary.mapMode}`,
    `layers: ${summary.layerMode}`,
    `maps processed: ${summary.mapsProcessed}`,
    `collections written: ${summary.collectionsWritten}`,
    `features written: ${summary.featuresWritten}`,
    `features skipped: ${summary.featuresSkipped}`,
    `images downloaded: ${summary.imagesDownloaded}`,
    `duplicates skipped: ${summary.duplicatesSkipped}`,
    `duplicates replaced: ${summary.duplicatesReplaced}`,
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
    `locale: ${summary.locale}`,
    `OK: ${summary.ok}`,
    `ERROR: ${summary.error}`,
    `SKIP: ${summary.skip}`,
  ].join("\n");
}
