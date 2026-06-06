import { XMLParser } from "fast-xml-parser";
import type { ExportSummary } from "../core/summary.ts";
import type { FeatureRecord } from "../domain/feature.ts";
import type { LayerRecord } from "../domain/layer.ts";
import type { MapRecord } from "../domain/map.ts";
import { extractDescriptionParts } from "../transform/description.ts";
import { createFeatureId, hashValue, slugify } from "../utils/project.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  cdataPropName: "__cdata",
});

interface KmlNode {
  name?: string | { __cdata?: string };
  description?: string | { __cdata?: string };
  Folder?: KmlNode | KmlNode[];
  Placemark?: KmlPlacemark | KmlPlacemark[];
  Document?: KmlNode;
  ExtendedData?: {
    Data?: KmlData | KmlData[];
  };
  Point?: {
    coordinates?: string;
  };
}

interface KmlPlacemark extends KmlNode {}

interface KmlData {
  "@_name"?: string;
  value?: string;
}

export function parseKmlMap(
  xml: string,
  originalUrl: string,
  summary: ExportSummary,
): MapRecord {
  const parsed = parser.parse(xml) as { kml?: { Document?: KmlNode } };
  const document = parsed.kml?.Document;
  if (!document) {
    throw new Error("KML document is missing.");
  }

  const mapId = extractMapId(originalUrl);
  const topLevelFolders = ensureArray(document.Folder);
  const topLevelPlacemarks = ensureArray(document.Placemark);
  const layers: LayerRecord[] = [];

  for (const folder of topLevelFolders) {
    layers.push(parseLayerFolder(folder, mapId, originalUrl, summary));
  }

  if (topLevelPlacemarks.length > 0) {
    layers.push({
      id: `layer-${mapId}-default`,
      mapId,
      name: "Default",
      features: buildFeatures(topLevelPlacemarks, mapId, `layer-${mapId}-default`, "Default", originalUrl, [], summary),
    });
  }

  return {
    id: mapId,
    title: normalizeText(document.name) ?? mapId,
    description: normalizeText(document.description) ?? undefined,
    originalUrl,
    layers,
  };
}

function parseLayerFolder(
  folder: KmlNode,
  mapId: string,
  originalUrl: string,
  summary: ExportSummary,
): LayerRecord {
  const layerName = normalizeText(folder.name) ?? "Layer";
  const layerSlug = slugify(layerName);
  const layerId = `layer-${mapId}-${layerSlug || hashValue(layerName).slice(0, 10)}`;
  const features = collectFolderFeatures(folder, mapId, layerId, layerName, originalUrl, [], summary);

  return {
    id: layerId,
    mapId,
    name: layerName,
    features,
  };
}

function collectFolderFeatures(
  folder: KmlNode,
  mapId: string,
  layerId: string,
  layerName: string,
  originalUrl: string,
  parentPath: string[],
  summary: ExportSummary,
): FeatureRecord[] {
  const folderName = normalizeText(folder.name);
  const folderPath = folderName ? [...parentPath, folderName] : [...parentPath];
  const features = buildFeatures(
    ensureArray(folder.Placemark),
    mapId,
    layerId,
    layerName,
    originalUrl,
    folderPath,
    summary,
  );

  for (const childFolder of ensureArray(folder.Folder)) {
    features.push(
      ...collectFolderFeatures(
        childFolder,
        mapId,
        layerId,
        layerName,
        originalUrl,
        folderPath,
        summary,
      ),
    );
  }

  return features;
}

function buildFeatures(
  placemarks: KmlPlacemark[],
  mapId: string,
  layerId: string,
  layerName: string,
  originalUrl: string,
  folderPath: string[],
  summary: ExportSummary,
): FeatureRecord[] {
  const features: FeatureRecord[] = [];

  for (const placemark of placemarks) {
    const coordinates = parseCoordinates(placemark.Point?.coordinates);
    if (!coordinates) {
      summary.featuresSkipped += 1;
      continue;
    }

    const name = normalizeText(placemark.name) ?? "";
    const descriptionRaw = normalizeDescription(placemark.description);
    const mediaLinks = extractMediaLinks(placemark);
    const descriptionParts = extractDescriptionParts(descriptionRaw, mediaLinks);
    const sourceFeatureKey = hashValue(
      [
        originalUrl,
        layerName,
        folderPath.join("/"),
        name,
        coordinates.latitude.toFixed(7),
        coordinates.longitude.toFixed(7),
      ].join("|"),
    );

    features.push({
      featureId: createFeatureId(),
      mapId,
      layerId,
      name,
      description: descriptionParts.description || undefined,
      descriptionRaw: descriptionRaw || undefined,
      images: descriptionParts.images.map((url) => ({ url })),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      rawAddress: undefined,
      sourceFolderPath: folderPath.length > 0 ? folderPath : undefined,
      sourceRef: {
        mapUrl: originalUrl,
        sourceFeatureKey,
      },
    });
  }

  return features;
}

function parseCoordinates(value?: string): { latitude: number; longitude: number } | null {
  if (!value) {
    return null;
  }

  const cleaned = value.trim();
  if (!cleaned) {
    return null;
  }

  const [longitudeRaw, latitudeRaw] = cleaned.split(",").map((part) => part.trim());
  const longitude = Number(longitudeRaw);
  const latitude = Number(latitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function extractMediaLinks(placemark: KmlPlacemark): string[] {
  const dataItems = ensureArray(placemark.ExtendedData?.Data);
  const media = dataItems.find((item) => item?.["@_name"] === "gx_media_links")?.value ?? "";
  return media
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDescription(value?: string | { __cdata?: string }): string {
  const text = extractNodeText(value);
  return text.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

function normalizeText(value?: string | { __cdata?: string }): string | null {
  const text = extractNodeText(value).trim();
  return text ? text : null;
}

function extractNodeText(value?: string | { __cdata?: string }): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && typeof value.__cdata === "string") {
    return value.__cdata;
  }

  return "";
}

function ensureArray<T>(value?: T | T[]): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function extractMapId(url: string): string {
  const parsed = new URL(url);
  const mapId = parsed.searchParams.get("mid");
  if (!mapId) {
    throw new Error(`Google My Maps URL is missing "mid": ${url}`);
  }

  return slugify(mapId);
}
