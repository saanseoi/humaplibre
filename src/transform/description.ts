import { parse } from "node-html-parser";

export function extractDescriptionParts(
	descriptionRaw: string,
	seededImages: string[],
): { description: string; images: string[] } {
	if (!descriptionRaw) {
		return {
			description: "",
			images: dedupe(seededImages),
		};
	}

	const root = parse(descriptionRaw, {
		comment: false,
	});
	const imageUrls = [
		...seededImages,
		...root
			.querySelectorAll("img")
			.map((node) => node.getAttribute("src") ?? "")
			.filter(Boolean),
	];

	for (const image of root.querySelectorAll("img")) {
		image.remove();
	}

	for (const br of root.querySelectorAll("br")) {
		br.replaceWith("\n");
	}

	const description = root.structuredText
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.join("\n")
		.trim();

	return {
		description,
		images: dedupe(imageUrls),
	};
}

function dedupe(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
