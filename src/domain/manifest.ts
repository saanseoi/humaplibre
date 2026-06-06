import { readFile, writeFile } from "node:fs/promises";

export type ExportMode = "replace" | "extend";
export type LayeringMode = "same" | "separate";

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
  mode: ExportMode;
  layering: LayeringMode;
  sourceUrls: string[];
  collections: ManifestCollectionRecord[];
}

export function createDefaultManifest(project: string): ExportManifest {
  const now = new Date().toISOString();
  return {
    project,
    createdAt: now,
    updatedAt: now,
    mode: "replace",
    layering: "same",
    sourceUrls: [],
    collections: [],
  };
}

export async function loadManifest(file: string): Promise<ExportManifest | null> {
  try {
    const contents = await readFile(file, "utf8");
    return JSON.parse(contents) as ExportManifest;
  } catch {
    return null;
  }
}

export async function saveManifest(file: string, manifest: ExportManifest): Promise<void> {
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
