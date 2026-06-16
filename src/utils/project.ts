import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";

const createNanoId = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	12,
);

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
	return createNanoId();
}

export function createLayerId(): string {
	return createNanoId();
}

export function hashValue(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
