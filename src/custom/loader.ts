import path from "node:path";
import { pathToFileURL } from "node:url";
import type { HypeHooks } from "./hooks.ts";

export async function loadHypeHooks(project: string): Promise<HypeHooks> {
	const file = path.join(process.cwd(), "custom", project, "hype.ts");

	try {
		const module = await import(pathToFileURL(file).href);
		return (module.default ?? module) as HypeHooks;
	} catch {
		return {};
	}
}
