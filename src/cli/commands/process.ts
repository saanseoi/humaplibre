import { note } from "@clack/prompts";
import path from "node:path";
import { parseArgs, getStringFlag } from "../args.ts";
import {
  promptCollectionSelection,
  promptHumapProjectSelection,
} from "../prompts/project.ts";
import { ensureProjectDirs, getProjectPaths } from "../../core/paths.ts";
import { CliError } from "../../core/errors.ts";
import {
  createDefaultManifest,
  saveManifest,
} from "../../domain/manifest.ts";
import { writeCollections } from "../../formats/geojson.ts";
import { createEmptySummary, renderExportSummary } from "../../core/summary.ts";
import {
  exportHumapCollections,
  listHumapImportProjects,
  loadHumapCollectionOptions,
} from "../../extract/humap.ts";

export async function runProcessCommand(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const importRoot = path.join(process.cwd(), "import");
  const importProjects = await listHumapImportProjects(importRoot);
  if (importProjects.length === 0) {
    throw new CliError("No Humap exports found in import/.");
  }

  const projectFlag = getStringFlag(parsed.flags, "project");
  const sourceProject = projectFlag
    ? importProjects.find((project) => project.sourceName === projectFlag || project.outputProjectName === projectFlag)
    : undefined;
  if (projectFlag && !sourceProject) {
    throw new CliError(`Unknown Humap project: ${projectFlag}`);
  }

  const selectedProject = sourceProject ?? await promptHumapProjectSelection(importProjects.map((project) => project.sourceName));
  const importProject = sourceProject ?? importProjects.find((project) => project.sourceName === selectedProject);

  if (!importProject) {
    throw new CliError(`Unknown Humap project: ${projectFlag ?? selectedProject}`);
  }

  const collectionOptions = await loadHumapCollectionOptions(importProject);
  if (collectionOptions.skipped.length > 0) {
    note(
      collectionOptions.skipped
        .map((collection) => collection.label)
        .join("\n"),
      "Collections skipped because they have no records",
    );
  }

  if (collectionOptions.selectable.length === 0) {
    throw new CliError("No collections found in csv/collections.csv.");
  }

  const selectedCollectionIds = await promptCollectionSelection(
    collectionOptions.selectable.map((collection) => ({
      value: collection.id,
      label: collection.label,
      hint: collection.hint,
    })),
  );

  const project = importProject.outputProjectName;

  const paths = getProjectPaths(project);
  await ensureProjectDirs(paths);

  const results = await exportHumapCollections(importProject, selectedCollectionIds, paths.root);
  await writeCollections(paths.mapsDir, results.map((result) => result.collection));

  const manifest = createDefaultManifest(project);
  manifest.updatedAt = new Date().toISOString();
  manifest.sourceUrls = [importProject.sourceDir];
  manifest.collections = results.map((result) => ({
    id: result.collection.id,
    filename: result.collection.filename,
    mapIds: [importProject.sourceName],
    featureCount: result.collection.features.length,
  }));
  await saveManifest(paths.manifestFile, manifest);
  const summary = createEmptySummary(project);
  summary.collections = results.length;
  summary.records = results.reduce((count, result) => count + result.collection.features.length, 0);
  summary.images = results.reduce((count, result) => count + result.imagesCopied, 0);
  note(renderExportSummary(summary), "Summary");
}
