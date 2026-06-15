import { note } from "@clack/prompts";
import { parseArgs, getStringFlag } from "../args.ts";
import {
  promptHypeUser,
  promptLocale,
  promptProjectSelection,
} from "../prompts/project.ts";
import { ensureProjectDirs, getProjectPaths, listExistingProjects } from "../../core/paths.ts";
import { CliError } from "../../core/errors.ts";
import { resolveProjectName } from "../../utils/project.ts";
import { loadExistingCollections } from "../../formats/geojson.ts";
import { loadHypeHooks } from "../../custom/loader.ts";
import { buildHypeRows } from "../../transform/hype.ts";
import { writeCsvFile } from "../../formats/csv.ts";
import { createHypeSummary, renderHypeSummary } from "../../core/summary.ts";

export async function runHypeCommand(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const existingProjects = await listExistingProjects();
  const project =
    resolveProjectName(getStringFlag(parsed.flags, "project")) ??
    (await promptProjectSelection(existingProjects));

  const paths = getProjectPaths(project);
  await ensureProjectDirs(paths);

  const locale = getStringFlag(parsed.flags, "locale") ?? (await promptLocale());
  const email = getStringFlag(parsed.flags, "email");
  const userId = getStringFlag(parsed.flags, "user-id");
  const hypeUser = email && userId ? { email, id: userId } : await promptHypeUser();

  const collections = await loadExistingCollections(paths.mapsDir);
  if (collections.length === 0) {
    throw new CliError(`No GeoJSON exports found in ${paths.mapsDir}.`);
  }

  const hooks = await loadHypeHooks(project);
  const results = await Promise.all(collections.map(async (collection) => {
    const result = buildHypeRows([collection], locale, hypeUser, hooks);
    const destinationDir = collection.directory ? `${collection.directory}/hype` : `${paths.root}/hype`;
    const destination = `${destinationDir}/${locale}.csv`;
    await writeCsvFile(destination, result.columns, result.rows);
    return result;
  }));

  const combinedRows = results.flatMap((result) => result.rows);
  note(renderHypeSummary(createHypeSummary(locale, combinedRows)), "Summary");
}
