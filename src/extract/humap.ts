import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { GenericFeature, GenericFeatureCollection } from "../formats/geojson.ts";
import { readCsvFile } from "../formats/csv.ts";
import { createFeatureId, resolveProjectName, slugify } from "../utils/project.ts";

interface HumapRecord {
  _humap_id: number;
  name?: string;
  status?: string;
  user_id?: number;
  latitude?: number;
  longitude?: number;
  date_from?: string | null;
  date_to?: string | null;
  content?: string;
  data_fields?: Record<string, unknown>;
  custom_fields?: Record<string, unknown> | null;
  taxonomies?: Record<string, string[]>;
  attachments?: {
    images?: HumapAttachment[];
  };
  links?: unknown[];
  annotations?: unknown[];
}

interface HumapAttachment {
  _humap_id: number;
  _humap_url?: string;
  s3_key?: string;
  name?: string;
  order?: number;
}

interface HumapCollection {
  _humap_id: number;
  name: string;
  type?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
  content?: string;
  items?: Array<{
    _humap_id: number;
    type?: string;
    name?: string;
    order?: number;
  }>;
}

interface HumapDataFile {
  tenant?: {
    name?: string;
    slug?: string;
  };
  records: HumapRecord[];
  collections: HumapCollection[];
}

type CsvTableMap = Record<string, Array<Record<string, string>>>;

export interface HumapImportProject {
  sourceName: string;
  displayName: string;
  sourceDir: string;
  outputProjectName: string;
}

export interface HumapCollectionOption {
  id: string;
  label: string;
  hint?: string;
}

export interface HumapCollectionInventory {
  selectable: HumapCollectionOption[];
  skipped: HumapCollectionOption[];
}

export interface HumapExportResult {
  collection: GenericFeatureCollection;
  imagesCopied: number;
}

export async function listHumapImportProjects(importRoot: string): Promise<HumapImportProject[]> {
  const entries = await readdir(importRoot, { withFileTypes: true });
  const projects: HumapImportProject[] = [];

  if (await isHumapProjectRoot(importRoot)) {
    projects.push({
      sourceName: "humap-export",
      displayName: "humap-export",
      sourceDir: importRoot,
      outputProjectName: "humap-export",
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceDir = path.join(importRoot, entry.name);
    if (!await isHumapProjectRoot(sourceDir)) {
      continue;
    }

    projects.push({
      sourceName: entry.name,
      displayName: entry.name,
      sourceDir,
      outputProjectName: deriveOutputProjectName(entry.name),
    });
  }

  return projects.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function loadHumapCollectionOptions(project: HumapImportProject): Promise<HumapCollectionInventory> {
  const rows = await readCsvFile(path.join(project.sourceDir, "csv", "collections.csv"));
  const data = await loadHumapDataFile(project.sourceDir);
  const recordsById = new Set(data.records.map((record) => record._humap_id));
  const collectionsById = new Map(data.collections.map((collection) => [String(collection._humap_id), collection]));
  const selectable: HumapCollectionOption[] = [];
  const skipped: HumapCollectionOption[] = [];

  for (const row of rows) {
    const id = row["[Humap ID]"]?.trim();
    const name = row.Name?.trim();
    if (!id || !name) {
      continue;
    }

    const type = row.Type?.trim();
    const count = row["Items count"]?.trim();
    const hintParts = [type, count ? `${count} items` : undefined].filter(Boolean);
    const option = {
      id,
      label: name,
      hint: hintParts.length > 0 ? hintParts.join(" | ") : undefined,
    };

    const collection = collectionsById.get(id);
    const recordCount = (collection?.items ?? []).filter((item) =>
      item.type === "Record" && recordsById.has(item._humap_id)
    ).length;

    if (recordCount === 0) {
      skipped.push(option);
      continue;
    }

    selectable.push(option);
  }

  return { selectable, skipped };
}

export async function exportHumapCollections(
  project: HumapImportProject,
  collectionIds: string[],
  outputRoot: string,
): Promise<HumapExportResult[]> {
  const data = await loadHumapDataFile(project.sourceDir);
  const tables = await loadCsvTables(project.sourceDir);
  const sourceImagesByStem = await loadSourceImageIndex(project.sourceDir);
  const featureIds = new Map<number, string>();
  const recordsById = new Map(data.records.map((record) => [record._humap_id, record]));
  const collectionsById = new Map(data.collections.map((collection) => [collection._humap_id, collection]));
  const mediaImagesByRecordId = groupRows(tables.media_images ?? [], "[Humap record ID]");
  const mediaFilesByRecordId = groupRows(tables.media_files ?? [], "[Humap record ID]");
  const audioEmbedsByRecordId = groupRows(tables.media_audio_embeds ?? [], "[Humap record ID]");
  const videoEmbedsByRecordId = groupRows(tables.media_video_embeds ?? [], "[Humap record ID]");
  const linksByRecordId = groupRows(tables.associations_links ?? [], "[Humap record ID]");
  const recordRowsById = indexRows(tables.records ?? [], "[Humap ID]");
  const userRowsById = indexRows(tables.users ?? [], "[Humap ID]");
  const results: HumapExportResult[] = [];

  for (const collectionId of collectionIds) {
    const collection = collectionsById.get(Number(collectionId));
    if (!collection) {
      continue;
    }

    const filenameStem = slugify(collection.name) || `collection-${collectionId}`;
    const collectionDir = path.join(outputRoot, filenameStem);
    const imageDir = path.join(collectionDir, "images");
    await rm(collectionDir, { recursive: true, force: true });
    await mkdir(imageDir, { recursive: true });

    let imagesCopied = 0;
    const features: GenericFeature[] = [];
    const items = [...(collection.items ?? [])]
      .filter((item) => item.type === "Record")
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

    for (const item of items) {
      const record = recordsById.get(item._humap_id);
      if (!record || typeof record.latitude !== "number" || typeof record.longitude !== "number") {
        continue;
      }

      const featureId = getOrCreateFeatureId(featureIds, record._humap_id);
      const relatedImages = mediaImagesByRecordId.get(String(record._humap_id)) ?? [];
      const copiedImages = await copyRecordImages(featureId, relatedImages, sourceImagesByStem, imageDir);
      imagesCopied += copiedImages.length;

      const properties = {
        featureId,
        humapRecordId: record._humap_id,
        humapCollectionId: collection._humap_id,
        collectionName: collection.name,
        itemOrder: item.order ?? null,
        mapId: project.outputProjectName,
        mapTitle: project.displayName,
        layerId: String(collection._humap_id),
        layerName: collection.name,
        name: record.name ?? item.name ?? `Record ${record._humap_id}`,
        status: record.status ?? null,
        description: record.content ?? "",
        descriptionRaw: record.content ?? "",
        images: copiedImages.map((image) => path.posix.join(filenameStem, "images", image)),
        rawAddress: guessRawAddress(record.content),
        sourceFolderPath: [project.sourceName, "collections", filenameStem],
        sourceRef: {
          mapUrl: "",
          sourceFeatureKey: String(record._humap_id),
        },
        tenant: data.tenant ?? null,
        dataFields: record.data_fields ?? {},
        customFields: record.custom_fields ?? null,
        taxonomies: record.taxonomies ?? {},
        links: record.links ?? [],
        annotations: record.annotations ?? [],
        recordCsv: recordRowsById.get(String(record._humap_id)) ?? null,
        user: record.user_id ? (userRowsById.get(String(record.user_id)) ?? null) : null,
        mediaImages: relatedImages,
        mediaFiles: mediaFilesByRecordId.get(String(record._humap_id)) ?? [],
        mediaAudioEmbeds: audioEmbedsByRecordId.get(String(record._humap_id)) ?? [],
        mediaVideoEmbeds: videoEmbedsByRecordId.get(String(record._humap_id)) ?? [],
        associationsLinks: linksByRecordId.get(String(record._humap_id)) ?? [],
      };

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [record.longitude, record.latitude],
        },
        properties,
      });
    }

    results.push({
      collection: {
        type: "FeatureCollection",
        id: filenameStem,
        filename: `${filenameStem}.geojson`,
        metadata: {
          sourceName: project.sourceName,
          collectionId: collection._humap_id,
          collectionName: collection.name,
          collectionType: collection.type ?? null,
          sourceDir: project.sourceDir,
        },
        features,
      },
      imagesCopied,
    });
  }

  return results;
}

async function isHumapProjectRoot(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const names = new Set(entries.map((entry) => entry.name));
    return names.has("csv") && names.has("images") && names.has("data.json");
  } catch {
    return false;
  }
}

function deriveOutputProjectName(sourceName: string): string {
  const cleaned = sourceName
    .replace(/^export-/, "")
    .replace(/-\d{8}-\d{6}$/, "");

  return resolveProjectName(cleaned) ?? "humap-export";
}

async function loadHumapDataFile(directory: string): Promise<HumapDataFile> {
  const file = Bun.file(path.join(directory, "data.json"));
  return await file.json() as HumapDataFile;
}

async function loadCsvTables(directory: string): Promise<CsvTableMap> {
  const csvDir = path.join(directory, "csv");
  const entries = await readdir(csvDir, { withFileTypes: true });
  const tables: CsvTableMap = {};

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".csv")) {
      continue;
    }

    const tableName = entry.name.replace(/\.csv$/i, "");
    tables[tableName] = await readCsvFile(path.join(csvDir, entry.name));
  }

  return tables;
}

async function loadSourceImageIndex(directory: string): Promise<Map<string, string>> {
  const imageDir = path.join(directory, "images");
  const entries = await readdir(imageDir, { withFileTypes: true });
  const index = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    index.set(path.parse(entry.name).name, path.join(imageDir, entry.name));
  }

  return index;
}

function getOrCreateFeatureId(featureIds: Map<number, string>, recordId: number): string {
  const existing = featureIds.get(recordId);
  if (existing) {
    return existing;
  }

  const created = createFeatureId();
  featureIds.set(recordId, created);
  return created;
}

function groupRows(
  rows: Array<Record<string, string>>,
  key: string,
): Map<string, Array<Record<string, string>>> {
  const grouped = new Map<string, Array<Record<string, string>>>();

  for (const row of rows) {
    const value = row[key]?.trim();
    if (!value) {
      continue;
    }

    const group = grouped.get(value) ?? [];
    group.push(row);
    grouped.set(value, group);
  }

  return grouped;
}

function indexRows(
  rows: Array<Record<string, string>>,
  key: string,
): Map<string, Record<string, string>> {
  return new Map(
    rows
      .map((row) => [row[key]?.trim(), row] as const)
      .filter((entry): entry is readonly [string, Record<string, string>] => Boolean(entry[0])),
  );
}

async function copyRecordImages(
  featureId: string,
  rows: Array<Record<string, string>>,
  sourceImagesByStem: Map<string, string>,
  imageDir: string,
): Promise<string[]> {
  const ordered = [...rows].sort((left, right) => Number(left.Order || 0) - Number(right.Order || 0));
  const copied: string[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index]!;
    const s3Key = row["S3 key"]?.trim();
    if (!s3Key) {
      continue;
    }

    const source = sourceImagesByStem.get(s3Key);
    if (!source) {
      continue;
    }

    const extension = path.extname(source) || inferExtension(row, s3Key);
    const filename = `${featureId}.${String(index + 1).padStart(2, "0")}${extension}`;

    try {
      await copyFile(source, path.join(imageDir, filename));
      copied.push(filename);
    } catch {
      continue;
    }
  }

  return copied;
}

function inferExtension(row: Record<string, string>, s3Key: string): string {
  const url = row.URL?.trim();
  const urlExtension = url ? path.extname(new URL(url).pathname) : "";
  return urlExtension || path.extname(s3Key) || ".jpg";
}

function guessRawAddress(content?: string): string | undefined {
  if (!content) {
    return undefined;
  }

  const match = content.match(/地址[:：]\s*([^<\n]+)/u);
  return match?.[1]?.trim() || undefined;
}
