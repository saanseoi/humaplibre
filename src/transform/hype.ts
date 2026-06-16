import type {
	HypeBuildOptions,
	HypeHooks,
	HypeLocaleFields,
} from "../custom/hooks.ts";
import type { HypeRow, HypeUser } from "../domain/hype.ts";
import type { GenericFeatureCollection } from "../formats/geojson.ts";

const HYPE_LOCALES = ["en", "zhHant"] as const;

export function buildHypeRows(
	collections: GenericFeatureCollection[],
	user: HypeUser,
	hooks: HypeHooks,
	options: HypeBuildOptions = {},
): { columns: string[]; rows: Array<Record<string, string>> } {
	const rows: Array<Record<string, string>> = collections.flatMap(
		(collection) =>
			collection.features.map((feature) => {
				const context = { collection };
				const layerName =
					typeof collection.metadata?.collectionName === "string"
						? collection.metadata.collectionName
						: (feature.properties.layerName ?? "");
				const row: HypeRow = {
					status: "OK",
					error: "",
					"feature.id": feature.properties.featureId ?? "",
					"feature.latitude": stringifyCoordinate(
						feature.geometry.coordinates[1],
					),
					"feature.longitude": stringifyCoordinate(
						feature.geometry.coordinates[0],
					),
					"feature.isArchived": String(
						hooks.isArchivedFromFeature?.(feature, context) ?? false,
					),
					"feature.isIntangible": String(
						hooks.isIntangibleFromFeature?.(feature, context) ?? false,
					),
					"feature.isPublished": String(
						hooks.isPublishedFromFeature?.(feature, context) ??
							feature.properties.status === "published",
					),
					"feature.isVisitable": String(
						hooks.isVisitableFromFeature?.(feature, context) ?? true,
					),
					"user.email": stringifyValue(feature.properties.userEmail) || user.email,
				};

				setBaseFields(row, {
					"layer.id":
						options.layerId ?? stringifyValue(feature.properties.layerId),
					"layer.name": layerName,
				});
				setLocaleColumns(row, feature, collection, hooks);

				if (!hasAnyTitle(row)) {
					row.status = "ERROR";
					row.error = "missing_title";
				}

				return row;
			}),
	);

	return { columns: HYPE_COLUMNS, rows };
}

export const HYPE_COLUMNS = [
	"status",
	"error",
	"feature.id",
	...localeColumns("en", [
		"description",
		"descriptionGen",
		"rawAddress",
		"title",
		"titleGen",
	]),
	...localeColumns("zhHant", [
		"description",
		"descriptionGen",
		"rawAddress",
		"title",
		"titleGen",
	]),
	"feature.isArchived",
	"feature.isIntangible",
	"feature.isPublished",
	"feature.isVisitable",
	"feature.latitude",
	"feature.longitude",
	"layer.id",
	"layer.name",
	"user.email",
];

function localeColumns(locale: string, fields: string[]): string[] {
	return fields.map((field) => `feature.i18n[locale=${locale}].${field}`);
}

function setBaseFields(
	row: Record<string, string>,
	values: Record<string, unknown>,
): void {
	for (const [key, value] of Object.entries(values)) {
		row[key] = stringifyValue(value);
	}
}

function setLocaleColumns(
	row: Record<string, string>,
	feature: GenericFeatureCollection["features"][number],
	collection: GenericFeatureCollection,
	hooks: HypeHooks,
): void {
	for (const locale of HYPE_LOCALES) {
		const defaults = defaultLocaleFields(locale, feature);
		const override = hooks.i18nFromFeature?.(feature, locale, { collection }) ?? {};
		const fields = { ...defaults, ...compactLocaleFields(override) };
		for (const [field, value] of Object.entries(fields)) {
			row[`feature.i18n[locale=${locale}].${field}`] = stringifyValue(value);
		}
	}
}

function defaultLocaleFields(
	locale: string,
	feature: GenericFeatureCollection["features"][number],
): HypeLocaleFields {
	const title = stringifyValue(feature.properties.name);
	const description = stringifyValue(feature.properties.description);

	return {
		title,
		titleGen: title ? "false" : "",
		description,
		descriptionGen: description ? "false" : "",
		rawAddress: stringifyValue(feature.properties.rawAddress),
	};
}

function compactLocaleFields(
	fields: Partial<HypeLocaleFields>,
): Partial<HypeLocaleFields> {
	return Object.fromEntries(
		Object.entries(fields).filter((entry) => entry[1] !== undefined),
	) as Partial<HypeLocaleFields>;
}

function hasAnyTitle(row: Record<string, string>): boolean {
	return HYPE_LOCALES.some((locale) =>
		Boolean(row[`feature.i18n[locale=${locale}].title`]?.trim()),
	);
}

function stringifyCoordinate(value: unknown): string {
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	return "";
}

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return value.map((entry) => stringifyValue(entry)).filter(Boolean).join("; ");
	}
	return JSON.stringify(value);
}
