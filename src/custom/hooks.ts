import type { GenericFeatureCollection } from "../formats/geojson.ts";

export interface HypeHookContext {
	collection: GenericFeatureCollection;
}

export interface HypeLocaleFields {
	title?: string;
	titleGen?: string;
	description?: string;
	descriptionGen?: string;
	displayAddress?: string;
	displayAddressGen?: string;
	rawAddress?: string;
}

export interface HypeBuildOptions {
	layerId?: string;
}

export interface HypeHooks {
	i18nFromFeature?: (
		feature: GenericFeatureCollection["features"][number],
		locale: string,
		context: HypeHookContext,
	) => Partial<HypeLocaleFields>;
	isArchivedFromFeature?: (
		feature: GenericFeatureCollection["features"][number],
		context: HypeHookContext,
	) => boolean;
	isIntangibleFromFeature?: (
		feature: GenericFeatureCollection["features"][number],
		context: HypeHookContext,
	) => boolean;
	isPublishedFromFeature?: (
		feature: GenericFeatureCollection["features"][number],
		context: HypeHookContext,
	) => boolean;
	isVisitableFromFeature?: (
		feature: GenericFeatureCollection["features"][number],
		context: HypeHookContext,
	) => boolean;
}
