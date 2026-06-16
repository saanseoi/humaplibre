import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { readCsvFile } from "../formats/csv.ts";
import type {
	GenericFeature,
	GenericFeatureCollection,
} from "../formats/geojson.ts";
import {
	type DownloadableAsset,
	downloadAssetsInBatches,
} from "../transform/assets.ts";
import { extractDescriptionParts } from "../transform/description.ts";
import {
	createFeatureId,
	resolveProjectName,
	slugify,
} from "../utils/project.ts";

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
	filesDownloaded: number;
	directory: string;
	warnings: string[];
}

export async function listHumapImportProjects(
	importRoot: string,
): Promise<HumapImportProject[]> {
	const entries = await readdir(importRoot, { withFileTypes: true });
	const projects: HumapImportProject[] = [];

	if (await isHumapProjectRoot(importRoot)) {
		projects.push({
			sourceName: "humap-export",
			displayName: "humap-export",
			sourceDir: importRoot,
			outputProjectName: await deriveOutputProjectName(
				importRoot,
				"humap-export",
			),
		});
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		const sourceDir = path.join(importRoot, entry.name);
		if (!(await isHumapProjectRoot(sourceDir))) {
			continue;
		}

		projects.push({
			sourceName: entry.name,
			displayName: entry.name,
			sourceDir,
			outputProjectName: await deriveOutputProjectName(sourceDir, entry.name),
		});
	}

	return projects.sort((left, right) =>
		left.displayName.localeCompare(right.displayName),
	);
}

export async function loadHumapCollectionOptions(
	project: HumapImportProject,
): Promise<HumapCollectionInventory> {
	const rows = await readCsvFile(
		path.join(project.sourceDir, "csv", "collections.csv"),
	);
	const data = await loadHumapDataFile(project.sourceDir);
	const recordsById = new Set(data.records.map((record) => record._humap_id));
	const collectionsById = new Map(
		data.collections.map((collection) => [
			String(collection._humap_id),
			collection,
		]),
	);
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
		const hintParts = [type, count ? `${count} items` : undefined].filter(
			Boolean,
		);
		const option = {
			id,
			label: name,
			hint: hintParts.length > 0 ? hintParts.join(" | ") : undefined,
		};

		const collection = collectionsById.get(id);
		const recordCount = (collection?.items ?? []).filter(
			(item) => item.type === "Record" && recordsById.has(item._humap_id),
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
	const recordsById = new Map(
		data.records.map((record) => [record._humap_id, record]),
	);
	const collectionsById = new Map(
		data.collections.map((collection) => [collection._humap_id, collection]),
	);
	const mediaImagesByRecordId = groupRows(
		tables.media_images ?? [],
		"[Humap record ID]",
	);
	const mediaFilesByRecordId = groupRows(
		tables.media_files ?? [],
		"[Humap record ID]",
	);
	const audioEmbedsByRecordId = groupRows(
		tables.media_audio_embeds ?? [],
		"[Humap record ID]",
	);
	const videoEmbedsByRecordId = groupRows(
		tables.media_video_embeds ?? [],
		"[Humap record ID]",
	);
	const linksByRecordId = groupRows(
		tables.associations_links ?? [],
		"[Humap record ID]",
	);
	const recordRowsById = indexRows(tables.records ?? [], "[Humap ID]");
	const userRowsById = indexRows(tables.users ?? [], "[Humap ID]");
	const results: HumapExportResult[] = [];

	for (const collectionId of collectionIds) {
		const collection = collectionsById.get(Number(collectionId));
		if (!collection) {
			continue;
		}

		const filenameStem =
			slugify(collection.name) || `collection-${collectionId}`;
		const collectionDir = path.join(outputRoot, filenameStem);
		const imageDir = path.join(collectionDir, "images");
		const fileDir = path.join(collectionDir, "files");
		await rm(collectionDir, { recursive: true, force: true });
		await mkdir(imageDir, { recursive: true });

		let imagesCopied = 0;
		let filesDownloaded = 0;
		const features: GenericFeature[] = [];
		const warnings = new Set<string>();
		const pendingFileDownloads: Array<
			DownloadableAsset & { target: Record<string, unknown> }
		> = [];
		const items = [...(collection.items ?? [])]
			.filter((item) => item.type === "Record")
			.sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

		for (const item of items) {
			const record = recordsById.get(item._humap_id);
			if (
				!record ||
				typeof record.latitude !== "number" ||
				typeof record.longitude !== "number"
			) {
				continue;
			}

			const featureId = getOrCreateFeatureId(featureIds, record._humap_id);
			const relatedImages = sortRowsByOrder(
				mediaImagesByRecordId.get(String(record._humap_id)) ?? [],
			);
			const copiedImages = await copyRecordImages(
				featureId,
				relatedImages,
				sourceImagesByStem,
				imageDir,
			);
			imagesCopied += copiedImages.length;
			const relatedFiles =
				mediaFilesByRecordId.get(String(record._humap_id)) ?? [];
			const relatedLinks = linksByRecordId.get(String(record._humap_id)) ?? [];
			const relatedAudioEmbeds =
				audioEmbedsByRecordId.get(String(record._humap_id)) ?? [];
			const relatedVideoEmbeds =
				videoEmbedsByRecordId.get(String(record._humap_id)) ?? [];
			const recordCsv = recordRowsById.get(String(record._humap_id)) ?? null;
			const userRow = record.user_id
				? (userRowsById.get(String(record.user_id)) ?? null)
				: null;
			const { description } = extractDescriptionParts(record.content ?? "", []);

			if (hasValues(record.data_fields)) {
				warnings.add(
					`dataFields present in ${collection.name}; including them unmodified because they are not tested.`,
				);
			}
			if (hasValues(record.custom_fields)) {
				warnings.add(
					`customFields present in ${collection.name}; including them unmodified because they are not tested.`,
				);
			}
			if (Array.isArray(record.annotations) && record.annotations.length > 0) {
				warnings.add(
					`annotations present in ${collection.name}; including them unmodified because they are not tested.`,
				);
			}

			const transformedImages = relatedImages
				.map((row, index) =>
					compactObject({
						path: copiedImages[index]
							? path.posix.join("images", copiedImages[index]!)
							: undefined,
						humapImageId: parseNumber(row["[Humap ID]"]),
						order: parseNumber(row.Order),
						humapUrl: row.URL,
						name: row.Name,
						altText: row["Alt text"],
						credit: row.Credit,
						description: row.Description,
						transcription: row.Transcription,
						identifier: row.Identifier,
						license: row.License,
						rightsStatement: row["Rights statement"],
						sourceUrl: row["Source link"],
					}),
				)
				.filter(isDefined);

			const transformedFiles = relatedFiles.map((row, index) => {
				const name = trimToUndefined(row.Name);
				const extension = name ? path.extname(name) : undefined;
				const target =
					compactObject({
						humapFileId: parseNumber(row["[Humap ID]"]),
						name: row.Name,
						humapUrl: row.URL,
						credit: row.Credit,
						description: row.Description,
					}) ?? {};

				const humapUrl = trimToUndefined(row.URL);
				if (humapUrl) {
					pendingFileDownloads.push({
						featureId,
						index,
						url: humapUrl,
						destinationDir: fileDir,
						destinationStem: featureId,
						fallbackExtension: extension,
						target,
					});
				}

				return target;
			});

			const properties =
				compactObject({
					featureId,
					humapRecordId: record._humap_id,
					itemOrder: item.order ?? undefined,
					name: record.name ?? item.name ?? `Record ${record._humap_id}`,
					status: record.status,
					description,
					descriptionRaw: record.content ?? "",
					images: transformedImages,
					files: transformedFiles,
					audio: relatedAudioEmbeds
						.map((row) =>
							compactObject({
								humapEmbedId: parseNumber(row["[Humap ID]"]),
								order: parseNumber(row.Order),
								name: row.Name,
								embedUrl: row.URL,
								html: row.HTML,
								imageUrl: row["Image URL"],
								altText: row["Alt text"],
								transcription: row.Transcription,
								identifier: row.Identifier,
								license: row.License,
								rightsStatement: row["Rights statement"],
								sourceUrl: row["Source link"],
							}),
						)
						.filter(isDefined),
					video: relatedVideoEmbeds
						.map((row) =>
							compactObject({
								humapEmbedId: parseNumber(row["[Humap ID]"]),
								order: parseNumber(row.Order),
								name: row.Name,
								embedUrl: row.URL,
								html: row.HTML,
								imageUrl: row["Image URL"],
								altText: row["Alt text"],
								transcription: row.Transcription,
								identifier: row.Identifier,
								license: row.License,
								rightsStatement: row["Rights statement"],
								sourceUrl: row["Source link"],
							}),
						)
						.filter(isDefined),
					links: relatedLinks
						.map((row) =>
							compactObject({
								name: row.Name,
								url: row.URL,
							}),
						)
						.filter(isDefined),
					rawAddress: guessRawAddress(description),
					dataFields: record.data_fields ?? {},
					customFields: record.custom_fields ?? null,
					hierarchies: record.taxonomies ?? {},
					category: deriveCategory(record.taxonomies),
					annotations: record.annotations ?? [],
					createdBy:
						trimToUndefined(userRow?.Name) ??
						trimToUndefined(recordCsv?.["Created by"]),
					userEmail: trimToUndefined(userRow?.Email),
					userId: record.user_id ?? undefined,
					dateFrom:
						trimToUndefined(recordCsv?.["Date from"]) ??
						trimToUndefined(record.date_from),
					dateTo:
						trimToUndefined(recordCsv?.["Date to"]) ??
						trimToUndefined(record.date_to),
					stats: buildStats(recordCsv),
				}) ?? {};

			features.push({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [record.longitude, record.latitude],
				},
				properties,
			});
		}

		const downloads = await downloadAssetsInBatches(
			pendingFileDownloads.map(({ target: _target, ...asset }) => asset),
		);

			for (let index = 0; index < downloads.length; index += 1) {
				const localPath = downloads[index]?.localPath;
				const pendingDownload = pendingFileDownloads[index];
				if (!localPath) {
					continue;
				}
				if (!pendingDownload) {
					continue;
				}

				pendingDownload.target.path = path.posix.join(
					"files",
					localPath,
				);
				if (downloads[index]?.mimeType) {
					pendingDownload.target.mimeType = downloads[index]?.mimeType;
				}
				filesDownloaded += 1;
			}

		results.push({
			collection: {
				type: "FeatureCollection",
				id: filenameStem,
				filename: path.join(filenameStem, `${filenameStem}.geojson`),
				directory: collectionDir,
				metadata: compactObject({
					sourceName: project.sourceName,
					sourceDir: project.sourceDir,
					collectionId: collection._humap_id,
					collectionName: collection.name,
					collectionSlug: filenameStem,
					collectionType: collection.type ?? null,
					tenantName: data.tenant?.name,
					tenantSlug: data.tenant?.slug,
				}),
				features,
			},
			imagesCopied,
			filesDownloaded,
			directory: collectionDir,
			warnings: [...warnings],
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

async function deriveOutputProjectName(
	sourceDir: string,
	sourceName: string,
): Promise<string> {
	const data = await loadHumapDataFile(sourceDir);
	const tenantName =
		resolveProjectName(data.tenant?.slug) ??
		resolveProjectName(data.tenant?.name);
	if (tenantName) {
		return tenantName;
	}

	const cleaned = sourceName
		.replace(/^export-/, "")
		.replace(/-\d{8}-\d{6}$/, "");

	return resolveProjectName(cleaned) ?? "humap-export";
}

async function loadHumapDataFile(directory: string): Promise<HumapDataFile> {
	const file = Bun.file(path.join(directory, "data.json"));
	return (await file.json()) as HumapDataFile;
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

async function loadSourceImageIndex(
	directory: string,
): Promise<Map<string, string>> {
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

function getOrCreateFeatureId(
	featureIds: Map<number, string>,
	recordId: number,
): string {
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

function sortRowsByOrder(
	rows: Array<Record<string, string>>,
): Array<Record<string, string>> {
	return [...rows].sort(
		(left, right) => Number(left.Order || 0) - Number(right.Order || 0),
	);
}

function indexRows(
	rows: Array<Record<string, string>>,
	key: string,
): Map<string, Record<string, string>> {
	return new Map(
		rows
			.map((row) => [row[key]?.trim(), row] as const)
			.filter((entry): entry is readonly [string, Record<string, string>] =>
				Boolean(entry[0]),
			),
	);
}

async function copyRecordImages(
	featureId: string,
	rows: Array<Record<string, string>>,
	sourceImagesByStem: Map<string, string>,
	imageDir: string,
): Promise<string[]> {
	const copied: string[] = [];

	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index]!;
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
		} catch {}
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

function trimToUndefined(value?: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseNumber(value?: string): number | undefined {
	const trimmed = trimToUndefined(value);
	if (!trimmed) {
		return undefined;
	}

	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function compactObject<T>(value: T): T | undefined {
	return compactValue(value) as T | undefined;
}

function compactValue(value: unknown): unknown {
	if (value === null || value === undefined) {
		return undefined;
	}

	if (typeof value === "string") {
		return trimToUndefined(value);
	}

	if (Array.isArray(value)) {
		const compacted = value
			.map((entry) => compactValue(entry))
			.filter((entry) => entry !== undefined);
		return compacted.length > 0 ? compacted : undefined;
	}

	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.map(([key, entry]) => [key, compactValue(entry)] as const)
			.filter(
				(entry): entry is readonly [string, unknown] => entry[1] !== undefined,
			);
		return entries.length > 0 ? Object.fromEntries(entries) : undefined;
	}

	return value;
}

function buildStats(
	recordCsv: Record<string, string> | null,
): Record<string, number> | undefined {
	if (!recordCsv) {
		return undefined;
	}

	return compactObject({
		imagesCount: parseNumber(recordCsv["Images count"]) ?? 0,
		videoEmbedsCount: parseNumber(recordCsv["Video embeds count"]) ?? 0,
		audioEmbedsCount: parseNumber(recordCsv["Audio embeds count"]) ?? 0,
		filesCount: parseNumber(recordCsv["Files count"]) ?? 0,
		iiifEmbedsCount: parseNumber(recordCsv["IIIF embeds count"]) ?? 0,
		sketchfabEmbedsCount: parseNumber(recordCsv["Sketchfab embeds count"]) ?? 0,
		figshareEmbedsCount: parseNumber(recordCsv["Figshare embeds count"]) ?? 0,
		linksCount: parseNumber(recordCsv["Links count"]) ?? 0,
		annotationsCount: parseNumber(recordCsv["Annotations count"]) ?? 0,
	});
}

function deriveCategory(
	taxonomies?: Record<string, string[]>,
): string | undefined {
	if (!taxonomies) {
		return undefined;
	}

	return Object.keys(taxonomies).find(
		(key) => key === "本土經濟 | Local economy",
	);
}

function hasValues(value: unknown): boolean {
	if (!value) {
		return false;
	}

	if (Array.isArray(value)) {
		return value.length > 0;
	}

	if (typeof value === "object") {
		return Object.keys(value as Record<string, unknown>).length > 0;
	}

	return true;
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
