import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureRecord } from "../domain/feature.ts";

export interface GenericFeatureProperties {
  featureId: string;
  mapId: string;
  mapTitle: string;
  layerId: string;
  layerName: string;
  name: string;
  description?: string;
  descriptionRaw?: string;
  images: string[];
  rawAddress?: string;
  sourceFolderPath?: string[];
  sourceRef: {
    mapUrl: string;
    sourceFeatureKey: string;
  };
  [key: string]: unknown;
}

export interface GenericFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: GenericFeatureProperties;
}

export interface GenericFeatureCollection {
  type: "FeatureCollection";
  id: string;
  filename: string;
  metadata?: Record<string, unknown>;
  features: GenericFeature[];
}

export async function loadExistingCollections(
  directory: string,
): Promise<GenericFeatureCollection[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const collections: GenericFeatureCollection[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".geojson")) {
      continue;
    }

    const file = path.join(directory, entry.name);
    const contents = await readFile(file, "utf8");
    const parsed = JSON.parse(contents) as Omit<GenericFeatureCollection, "filename">;
    collections.push({
      ...parsed,
      filename: entry.name,
    });
  }

  return collections.sort((left, right) => left.filename.localeCompare(right.filename));
}

export async function writeCollections(
  directory: string,
  collections: GenericFeatureCollection[],
): Promise<void> {
  await Promise.all(
    collections.map((collection) =>
      writeFile(
        path.join(directory, collection.filename),
        `${JSON.stringify(
          {
            type: collection.type,
            id: collection.id,
            metadata: collection.metadata,
            features: collection.features,
          },
          null,
          2,
        )}\n`,
        "utf8",
      )),
  );
}

export function featureToGeoJson(
  feature: FeatureRecord,
  mapTitle: string,
  layerName: string,
): GenericFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [feature.longitude, feature.latitude],
    },
    properties: {
      featureId: feature.featureId,
      mapId: feature.mapId,
      mapTitle,
      layerId: feature.layerId,
      layerName,
      name: feature.name,
      description: feature.description,
      descriptionRaw: feature.descriptionRaw,
      images: feature.images.map((image) => image.localPath ?? image.url),
      rawAddress: feature.rawAddress,
      sourceFolderPath: feature.sourceFolderPath,
      sourceRef: feature.sourceRef,
    },
  };
}
