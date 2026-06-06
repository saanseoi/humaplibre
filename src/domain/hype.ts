export interface HypeUser {
  email: string;
  id: string;
}

export interface HypeRow {
  [key: string]: string;
  status: "OK" | "ERROR" | "SKIP";
  error: string;
  "feature.id": string;
  "layer.name": string;
  "feature.latitude": string;
  "feature.longitude": string;
  "feature.i18n.locale": string;
  "feature.i18n.featureId": string;
  "feature.i18n.title": string;
  "feature.i18n.titleGen": string;
  "feature.i18n.description": string;
  "feature.i18n.descriptionGen": string;
  "feature.i18n.rawAddress": string;
  "feature.isArchived": string;
  "feature.isIntangible": string;
  "feature.isPublished": string;
  "feature.isVisitable": string;
  "user.email": string;
  "user.id": string;
}
