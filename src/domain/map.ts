import type { LayerRecord } from "./layer.ts";

export interface MapRecord {
	id: string;
	title: string;
	description?: string;
	originalUrl: string;
	layers: LayerRecord[];
}
