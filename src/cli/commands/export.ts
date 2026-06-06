import { confirm, isCancel, note, spinner } from "@clack/prompts";
import { parseArgs, getStringArrayFlag, getStringFlag } from "../args.ts";
import {
  promptDuplicatePolicy,
  promptLayeringMode,
  promptMapUrls,
  promptProjectSelection,
  promptReplaceOrExtend,
} from "../prompts/project.ts";
import { ensureProjectDirs, getProjectPaths, listExistingProjects } from "../../core/paths.ts";
import { CliError } from "../../core/errors.ts";
import {
  createDefaultManifest,
  loadManifest,
  saveManifest,
  type ExportManifest,
  type ExportMode,
  type LayeringMode,
} from "../../domain/manifest.ts";
import { computeCollectionWrites, mergeCollectionWrites } from "../../transform/generic.ts";
import { loadExistingCollections, writeCollections } from "../../formats/geojson.ts";
import { resolveProjectName } from "../../utils/project.ts";
import { fetchGoogleMyMapsSource } from "../../extract/google-mymaps.ts";
import { createEmptySummary, renderExportSummary } from "../../core/summary.ts";

export async function runExportCommand(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const existingProjects = await listExistingProjects();
  const project =
    resolveProjectName(getStringFlag(parsed.flags, "project")) ??
    (await promptProjectSelection(existingProjects));

  const paths = getProjectPaths(project);
  await ensureProjectDirs(paths);

  const existingManifest = await loadManifest(paths.manifestFile);
  const mode =
    normalizeExportMode(getStringFlag(parsed.flags, "mode")) ??
    (await decideMode(existingManifest));
  const layering =
    normalizeLayeringMode(getStringFlag(parsed.flags, "layering")) ??
    (await promptLayeringMode());

  const sourceUrls = dedupeUrls(
    getStringArrayFlag(parsed.flags, "url").length > 0
      ? getStringArrayFlag(parsed.flags, "url")
      : await promptMapUrls(),
  );

  if (sourceUrls.length === 0) {
    throw new CliError("At least one Google My Maps URL is required.");
  }

  const manifest = mode === "replace" || !existingManifest
    ? createDefaultManifest(project)
    : existingManifest;

  const duplicateUrls = sourceUrls.filter((url) => manifest.sourceUrls.includes(url));
  if (duplicateUrls.length > 0) {
    const shouldContinue = await confirm({
      message: `${duplicateUrls.length} source URLs were already imported. Continue and resolve duplicate features later?`,
      initialValue: true,
    });

    if (isCancel(shouldContinue) || !shouldContinue) {
      throw new CliError("Export cancelled.");
    }
  }

  const summary = createEmptySummary(project, mode, layering);
  const spin = spinner();
  const sources = [];

  spin.start("Resolving source maps");
  for (const url of sourceUrls) {
    const source = await fetchGoogleMyMapsSource(url);
    sources.push(source);
    summary.mapsProcessed += 1;
  }
  spin.stop("Source map metadata resolved");

  const collectionWrites = computeCollectionWrites(sources, layering);
  const existingCollections =
    mode === "extend" ? await loadExistingCollections(paths.mapsDir) : [];
  const duplicatePolicy: "replace" | "skip" =
    mode === "extend" && existingCollections.length > 0
      ? await promptDuplicatePolicy()
      : "skip";
  const mergedCollections = mergeCollectionWrites(
    existingCollections,
    collectionWrites,
    duplicatePolicy,
    summary,
  );

  await writeCollections(paths.mapsDir, mergedCollections);

  for (const source of sources) {
    if (!manifest.sourceUrls.includes(source.originalUrl)) {
      manifest.sourceUrls.push(source.originalUrl);
    }
  }

  manifest.project = project;
  manifest.updatedAt = new Date().toISOString();
  manifest.mode = mode;
  manifest.layering = layering;
  manifest.collections = mergedCollections.map((collection) => ({
    id: collection.id,
    filename: collection.filename,
    mapIds: [...new Set(collection.features.map((feature) => feature.properties.mapId))],
    featureCount: collection.features.length,
  }));

  await saveManifest(paths.manifestFile, manifest);

  note(renderExportSummary(summary), "Summary");
}

function normalizeExportMode(value?: string): ExportMode | undefined {
  if (value === "replace" || value === "extend") {
    return value;
  }

  return undefined;
}

function normalizeLayeringMode(value?: string): LayeringMode | undefined {
  if (value === "same" || value === "separate") {
    return value;
  }

  return undefined;
}

async function decideMode(manifest: ExportManifest | null): Promise<ExportMode> {
  if (!manifest) {
    return "replace";
  }

  return promptReplaceOrExtend();
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}
