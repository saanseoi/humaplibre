import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureRecord, ImageAsset } from "../domain/feature.ts";

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 15_000;

export async function downloadImagesForFeatures(
  features: FeatureRecord[],
  imagesDir: string,
): Promise<number> {
  await mkdir(imagesDir, { recursive: true });
  const tasks = features.flatMap((feature) =>
    feature.images.map((image, index) => async () => {
      const asset = await downloadImageAsset(feature, image, index, imagesDir);
      return { feature, index, asset };
    }),
  );

  let completed = 0;
  await runWithConcurrency(tasks, DEFAULT_CONCURRENCY, async (task) => {
    const result = await task();
    result.feature.images[result.index] = result.asset;
    if (result.asset.localPath) {
      completed += 1;
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
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  worker: (task: () => Promise<T>) => Promise<void>,
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
