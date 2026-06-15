import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface DownloadableAsset {
  featureId: string;
  index: number;
  url: string;
  destinationDir: string;
  destinationStem: string;
  fallbackExtension?: string;
}

export interface DownloadedAsset {
  localPath?: string;
  mimeType?: string;
}

export async function downloadAssetsInBatches(
  assets: DownloadableAsset[],
): Promise<DownloadedAsset[]> {
  await Promise.all(
    [...new Set(assets.map((asset) => asset.destinationDir))].map((directory) =>
      mkdir(directory, { recursive: true })),
  );

  const results: DownloadedAsset[] = Array.from({ length: assets.length }, () => ({}));
  const tasks = assets.map((asset, index) => async () => {
    results[index] = await downloadAsset(asset);
  });

  await runWithConcurrency(tasks, DEFAULT_CONCURRENCY, async (task) => {
    await task();
  });

  return results;
}

async function downloadAsset(asset: DownloadableAsset): Promise<DownloadedAsset> {
  try {
    const response = await fetch(asset.url, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {};
    }

    const extension = extensionFromResponse(
      asset.url,
      response.headers.get("content-type"),
      asset.fallbackExtension,
    );
    const filename = `${asset.destinationStem}.${String(asset.index + 1).padStart(2, "0")}${extension}`;
    const destinationFile = path.join(asset.destinationDir, filename);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(destinationFile, bytes);

    return {
      localPath: filename,
      mimeType: response.headers.get("content-type") ?? undefined,
    };
  } catch {
    return {};
  }
}

function extensionFromResponse(
  url: string,
  contentType: string | null,
  fallbackExtension?: string,
): string {
  if (contentType) {
    if (contentType.includes("png")) {
      return ".png";
    }
    if (contentType.includes("webp")) {
      return ".webp";
    }
    if (contentType.includes("gif")) {
      return ".gif";
    }
    if (contentType.includes("svg")) {
      return ".svg";
    }
    if (contentType.includes("pdf")) {
      return ".pdf";
    }
    if (contentType.includes("zip")) {
      return ".zip";
    }
    if (contentType.includes("html")) {
      return ".html";
    }
    if (contentType.includes("json")) {
      return ".json";
    }
    if (contentType.includes("audio/mpeg")) {
      return ".mp3";
    }
    if (contentType.includes("audio/mp4")) {
      return ".m4a";
    }
    if (contentType.includes("video/mp4")) {
      return ".mp4";
    }
  }

  try {
    const pathname = new URL(url).pathname;
    const parsed = path.extname(pathname);
    if (parsed) {
      return parsed.toLowerCase();
    }
  } catch {
    // Ignore invalid asset URLs and fall back below.
  }

  if (fallbackExtension) {
    return fallbackExtension.startsWith(".") ? fallbackExtension : `.${fallbackExtension}`;
  }

  return ".bin";
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
