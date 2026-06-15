import type { HypeUser, HypeRow } from "../domain/hype.ts";
import type { GenericFeatureCollection } from "../formats/geojson.ts";
import type { HypeHooks } from "../custom/hooks.ts";

export function buildHypeRows(
  collections: GenericFeatureCollection[],
  locale: string,
  user: HypeUser,
  hooks: HypeHooks,
): { columns: string[]; rows: Array<Record<string, string>> } {
  const now = Date.now();
  const rows: Array<Record<string, string>> = collections.flatMap((collection) =>
    collection.features.map((feature) => {
      const context = { collection };
      const dateFrom = parseDateValue(feature.properties.dateFrom);
      const dateTo = parseDateValue(feature.properties.dateTo);
      const layerName = typeof collection.metadata?.collectionName === "string"
        ? collection.metadata.collectionName
        : feature.properties.layerName ?? "";
      const row: HypeRow = {
        status: "OK",
        error: "",
        "feature.id": feature.properties.featureId ?? "",
        "layer.name": layerName,
        "feature.itemOrder": stringifyNumber(feature.properties.itemOrder),
        "feature.latitude": String(feature.geometry.coordinates[1]),
        "feature.longitude": String(feature.geometry.coordinates[0]),
        "feature.i18n.locale": locale,
        "feature.i18n.featureId": feature.properties.featureId ?? "",
        "feature.i18n.title": feature.properties.name ?? "",
        "feature.i18n.titleGen": "false",
        "feature.i18n.description": feature.properties.description ?? "",
        "feature.i18n.descriptionGen": "false",
        "feature.i18n.rawAddress": feature.properties.rawAddress ?? "",
        "feature.isArchived": String(hooks.isArchivedFromFeature?.(feature, context) ?? false),
        "feature.isIntangible": String(
          hooks.isIntangibleFromFeature?.(feature, context) ?? Boolean(
            (dateTo !== null && dateTo < now) ||
            (dateFrom !== null && dateFrom > now),
          ),
        ),
        "feature.isPublished": String(
          hooks.isPublishedFromFeature?.(feature, context) ??
          feature.properties.status === "published",
        ),
        "feature.isVisitable": String(hooks.isVisitableFromFeature?.(feature, context) ?? true),
        "user.email": user.email,
        "user.id": user.id,
      };

      if (!feature.properties.name) {
        row.status = "ERROR";
        row.error = "missing_title";
      }

      return row;
    }),
  );

  return { columns: HYPE_COLUMNS, rows };
}

const HYPE_COLUMNS = [
  "status",
  "error",
  "feature.id",
  "layer.name",
  "feature.itemOrder",
  "feature.latitude",
  "feature.longitude",
  "feature.i18n.locale",
  "feature.i18n.featureId",
  "feature.i18n.title",
  "feature.i18n.titleGen",
  "feature.i18n.description",
  "feature.i18n.descriptionGen",
  "feature.i18n.rawAddress",
  "feature.isArchived",
  "feature.isIntangible",
  "feature.isPublished",
  "feature.isVisitable",
  "user.email",
  "user.id",
];

function parseDateValue(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringifyNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}
