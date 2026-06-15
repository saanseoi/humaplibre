import { writeFile } from "node:fs/promises";

export interface ManifestCollectionRecord {
  id: string;
  filename: string;
  mapIds: string[];
  featureCount: number;
}

export interface ExportManifest {
  project: string;
  createdAt: string;
  updatedAt: string;
  sourceUrls: string[];
  collections: ManifestCollectionRecord[];
}

export function createDefaultManifest(project: string): ExportManifest {
  const now = new Date().toISOString();
  return {
    project,
    createdAt: now,
    updatedAt: now,
    sourceUrls: [],
    collections: [],
  };
}

export async function saveManifest(file: string, manifest: ExportManifest): Promise<void> {
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
