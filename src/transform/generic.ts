import type { SourceMapBundle } from "../extract/google-mymaps.ts";
import {
  featureToGeoJson,
  type GenericFeatureCollection,
} from "../formats/geojson.ts";
import type { LayeringMode } from "../domain/manifest.ts";
import { mergeFeatures } from "./dedupe.ts";
import type { DuplicatePolicy } from "./dedupe.ts";
import type { ExportSummary } from "../core/summary.ts";
import { slugify } from "../utils/project.ts";

export function computeCollectionWrites(
  sources: SourceMapBundle[],
  layering: LayeringMode,
): GenericFeatureCollection[] {
  if (layering === "same") {
    const features = sources.flatMap((map) =>
      map.layers.flatMap((layer) =>
        layer.features.map((feature) => featureToGeoJson(feature, map.title, layer.name))),
    );

    return [
      {
        type: "FeatureCollection",
        id: "combined",
        filename: "combined.geojson",
        metadata: {
          maps: sources.map((map) => ({
            id: map.id,
            title: map.title,
            description: map.description,
            originalUrl: map.originalUrl,
          })),
        },
        features,
      },
    ];
  }

  return sources.flatMap((map) =>
    map.layers.map((layer) => {
      const mapSlug = slugify(map.title) || map.id;
      const layerSlug = slugify(layer.name) || layer.id;

      return {
        type: "FeatureCollection" as const,
        id: `${map.id}-${layer.id}`,
        filename: `${mapSlug}-${layerSlug}.geojson`,
        metadata: {
          map: {
            id: map.id,
            title: map.title,
            description: map.description,
            originalUrl: map.originalUrl,
          },
          layer: {
            id: layer.id,
            name: layer.name,
          },
        },
        features: layer.features.map((feature) => featureToGeoJson(feature, map.title, layer.name)),
      };
    }),
  );
}

export function mergeCollectionWrites(
  existing: GenericFeatureCollection[],
  incoming: GenericFeatureCollection[],
  duplicatePolicy: Exclude<DuplicatePolicy, "cancel">,
  summary: ExportSummary,
): GenericFeatureCollection[] {
  const byFilename = new Map(existing.map((collection) => [collection.filename, collection]));

  for (const collection of incoming) {
    const current = byFilename.get(collection.filename);
    if (!current) {
      byFilename.set(collection.filename, collection);
      continue;
    }

    byFilename.set(collection.filename, {
      ...current,
      metadata: current.metadata ?? collection.metadata,
      features: mergeFeatures(current.features, collection.features, duplicatePolicy, summary),
    });
  }

  const merged = [...byFilename.values()].sort((left, right) => left.filename.localeCompare(right.filename));
  summary.collectionsWritten = merged.length;
  summary.featuresWritten = merged.reduce(
    (count, collection) => count + collection.features.length,
    0,
  );
  return merged;
}
