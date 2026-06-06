import { createHash } from "node:crypto";

export function resolveProjectName(value?: string): string | null {
  if (!value) {
    return null;
  }

  const normalized = slugify(value);
  return normalized ? normalized : null;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createFeatureId(): string {
  return createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("base64url")
    .slice(0, 12);
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
