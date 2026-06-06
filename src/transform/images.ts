import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureRecord, ImageAsset } from "../domain/feature.ts";

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ImageDownloadProgress {
  total: number;
  completed: number;
  activeFeatures: {
    name: string;
    remaining: number;
  }[];
}

export async function downloadImagesForFeatures(
  features: FeatureRecord[],
  imagesDir: string,
  onProgress?: (progress: ImageDownloadProgress) => void,
): Promise<number> {
  await mkdir(imagesDir, { recursive: true });
  const tasks = features.flatMap((feature) =>
    feature.images.map((image, index) => ({
      featureName: feature.name,
      run: async () => {
        const asset = await downloadImageAsset(feature, image, index, imagesDir);
        return { feature, index, asset };
      },
    })),
  );
  const tracker = new ProgressTracker(features, tasks.length, onProgress);

  let completed = 0;
  await runWithConcurrency(tasks, DEFAULT_CONCURRENCY, async (task) => {
    tracker.start(task.featureName);
    try {
      const result = await task.run();
      result.feature.images[result.index] = result.asset;
      if (result.asset.localPath) {
        completed += 1;
      }
    } finally {
      tracker.finish(task.featureName);
    }
  });

  return completed;
}

async function downloadImageAsset(
  feature: FeatureRecord,
  image: ImageAsset,
  index: number,
  imagesDir: string,
): Promise<ImageAsset> {
  try {
    const response = await fetch(image.url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        referer: "https://www.google.com/",
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { url: image.url };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const extension = extensionFromResponse(image.url, response.headers.get("content-type"));
    const filename = `${feature.featureId}-${String(index).padStart(2, "0")}.${extension}`;
    const file = path.join(imagesDir, filename);
    await writeFile(file, bytes);
    return {
      url: image.url,
      localPath: path.join("images", filename),
      filename,
      mimeType: response.headers.get("content-type") ?? undefined,
    };
  } catch {
    return { url: image.url };
  }
}

function extensionFromResponse(url: string, contentType: string | null): string {
  if (contentType) {
    if (contentType.includes("png")) {
      return "png";
    }
    if (contentType.includes("webp")) {
      return "webp";
    }
    if (contentType.includes("gif")) {
      return "gif";
    }
    if (contentType.includes("svg")) {
      return "svg";
    }
  }

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    const extension = match?.[1];
    if (extension) {
      return extension.toLowerCase();
    }
  } catch {
    // Ignore invalid image URLs and fall back to jpg.
  }

  return "jpg";
}

async function runWithConcurrency<T>(
  tasks: T[],
  concurrency: number,
  worker: (task: T) => Promise<void>,
): Promise<void> {
  let index = 0;

  async function next(): Promise<void> {
    const current = tasks[index];
    index += 1;
    if (!current) {
      return;
    }

    await worker(current);
    await next();
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => next());
  await Promise.all(workers);
}

class ProgressTracker {
  private readonly total: number;
  private readonly onProgress?: (progress: ImageDownloadProgress) => void;
  private readonly totalCounts = new Map<string, number>();
  private readonly activeCounts = new Map<string, number>();
  private readonly completedCounts = new Map<string, number>();
  private completed = 0;
  private lastReportedAt = 0;

  constructor(
    features: FeatureRecord[],
    total: number,
    onProgress?: (progress: ImageDownloadProgress) => void,
  ) {
    this.total = total;
    this.onProgress = onProgress;
    for (const feature of features) {
      const key = normalizeFeatureName(feature.name);
      this.totalCounts.set(key, (this.totalCounts.get(key) ?? 0) + feature.images.length);
    }
  }

  start(featureName: string): void {
    const key = normalizeFeatureName(featureName);
    this.activeCounts.set(key, (this.activeCounts.get(key) ?? 0) + 1);
    this.report(false);
  }

  finish(featureName: string): void {
    const key = normalizeFeatureName(featureName);
    const remaining = (this.activeCounts.get(key) ?? 0) - 1;
    if (remaining > 0) {
      this.activeCounts.set(key, remaining);
    } else {
      this.activeCounts.delete(key);
    }

    this.completedCounts.set(key, (this.completedCounts.get(key) ?? 0) + 1);
    this.completed += 1;
    this.report(this.completed === this.total);
  }

  private report(force: boolean): void {
    if (!this.onProgress) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastReportedAt < 1_000) {
      return;
    }

    this.lastReportedAt = now;

    this.onProgress({
      total: this.total,
      completed: this.completed,
      activeFeatures: [...this.activeCounts.keys()].map((name) => ({
        name,
        remaining: Math.max(
          0,
          (this.totalCounts.get(name) ?? 0) - (this.completedCounts.get(name) ?? 0),
        ),
      })),
    });
  }
}

function normalizeFeatureName(value: string): string {
  const trimmed = value.trim();
  return trimmed || "Untitled feature";
}
