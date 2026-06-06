import type { FeatureRecord } from "./feature.ts";

export interface LayerRecord {
  id: string;
  mapId: string;
  name: string;
  sourceFolderPath?: string[];
  features: FeatureRecord[];
}
