import type { ExportSummary } from "../core/summary.ts";
import type { MapRecord } from "../domain/map.ts";
import { downloadImagesForFeatures } from "../transform/images.ts";
import { parseKmlMap } from "./kml.ts";

export interface SourceMapBundle extends MapRecord {}

export async function fetchGoogleMyMapsSource(
  url: string,
  imagesDir: string,
  summary: ExportSummary,
): Promise<SourceMapBundle> {
  const exportUrl = resolveKmlUrl(url);
  const response = await fetch(exportUrl, {
    headers: {
      "user-agent": "gmaplibre/0.1 (+https://github.com/)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch KML (${response.status}) for ${url}`);
  }

  const kml = await response.text();
  const map = parseKmlMap(kml, url, summary);
  const features = map.layers.flatMap((layer) => layer.features);
  summary.imagesDownloaded += await downloadImagesForFeatures(features, imagesDir);

  return map;
}

function resolveKmlUrl(url: string): string {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("google.com")) {
    throw new Error(`Unsupported source URL: ${url}`);
  }

  const mapId = parsed.searchParams.get("mid");
  if (!mapId) {
    throw new Error(`Google My Maps URL is missing "mid": ${url}`);
  }

  return `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mapId)}&forcekml=1`;
}
