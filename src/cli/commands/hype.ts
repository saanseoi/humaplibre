import { note } from "@clack/prompts";
import { CliError } from "../../core/errors.ts";
import {
	ensureProjectDirs,
	getProjectPaths,
	listExistingProjects,
} from "../../core/paths.ts";
import { createHypeSummary, renderHypeSummary } from "../../core/summary.ts";
import { loadHypeHooks } from "../../custom/loader.ts";
import { writeCsvFile } from "../../formats/csv.ts";
import { loadExistingCollections } from "../../formats/geojson.ts";
import { buildHypeRows } from "../../transform/hype.ts";
import { createLayerId, resolveProjectName, slugify } from "../../utils/project.ts";
import { getStringFlag, parseArgs } from "../args.ts";
import {
	promptHypeAttributionEmail,
	promptHypeLayerId,
	promptProjectSelection,
} from "../prompts/project.ts";

export async function runHypeCommand(argv: string[]): Promise<void> {
	const parsed = parseArgs(argv);
	const existingProjects = await listExistingProjects();
	const project =
		resolveProjectName(getStringFlag(parsed.flags, "project")) ??
		(await promptProjectSelection(existingProjects));

	const paths = getProjectPaths(project);
	await ensureProjectDirs(paths);

	const email = getStringFlag(parsed.flags, "email");

	const collections = await loadExistingCollections(paths.mapsDir);
	if (collections.length === 0) {
		throw new CliError(`No GeoJSON exports found in ${paths.mapsDir}.`);
	}

	const fallbackEmail = hasFeaturesWithoutContributorEmail(collections)
		? (email ?? await promptHypeAttributionEmail())
		: (email ?? "");
	const hypeUser = { email: fallbackEmail };

	const hooks = await loadHypeHooks(project);
	const timestamp = formatTimestamp(new Date());
	const results = [];

	for (const collection of collections) {
		const layerName =
			typeof collection.metadata?.collectionName === "string"
				? collection.metadata.collectionName
				: collection.id;
		const existingLayerId = await promptHypeLayerId(layerName);
		const layerId = existingLayerId ?? createLayerId();
		const result = buildHypeRows([collection], hypeUser, hooks, { layerId });
		const collectionSlug = slugify(collection.id || layerName) || "collection";
		const destinationDir = collection.directory ?? paths.root;
		const destination = `${destinationDir}/hype-${project}-${collectionSlug}-${timestamp}.csv`;
		await writeCsvFile(destination, result.columns, result.rows);
		results.push(result);
	}

	note(
		renderHypeSummary(
			createHypeSummary(project, results.flatMap((result) => result.rows)),
		),
		"Summary",
	);
}

function hasFeaturesWithoutContributorEmail(
	collections: Awaited<ReturnType<typeof loadExistingCollections>>,
): boolean {
	return collections.some((collection) =>
		collection.features.some((feature) => {
			const email = feature.properties.userEmail;
			return typeof email !== "string" || !email.trim();
		}),
	);
}

function formatTimestamp(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		"-",
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds()),
	].join("");
}
