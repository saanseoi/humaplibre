import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

export interface ProjectPaths {
  root: string;
  mapsDir: string;
  imagesDir: string;
  hypeDir: string;
  manifestFile: string;
  customDir: string;
}

const CWD = process.cwd();

export function getProjectPaths(project: string): ProjectPaths {
  const root = path.join(CWD, "export", project);
  return {
    root,
    mapsDir: root,
    imagesDir: path.join(root, "images"),
    hypeDir: path.join(root, "hype"),
    manifestFile: path.join(root, "manifest.json"),
    customDir: path.join(CWD, "custom", project),
  };
}

export async function ensureProjectDirs(paths: ProjectPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.root, { recursive: true }),
    mkdir(paths.mapsDir, { recursive: true }),
    mkdir(paths.imagesDir, { recursive: true }),
    mkdir(paths.hypeDir, { recursive: true }),
    mkdir(paths.customDir, { recursive: true }),
  ]);
}

export async function listExistingProjects(): Promise<string[]> {
  const customDir = path.join(CWD, "custom");
  const exportDir = path.join(CWD, "export");
  await mkdir(customDir, { recursive: true });
  await mkdir(exportDir, { recursive: true });

  const [customEntries, exportEntries] = await Promise.all([
    readdir(customDir, { withFileTypes: true }),
    readdir(exportDir, { withFileTypes: true }),
  ]);

  return [...new Set([
    ...customEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    ...exportEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  ])].sort();
}
