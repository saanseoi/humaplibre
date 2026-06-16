export interface ImageAsset {
	url: string;
	localPath?: string;
	filename?: string;
	mimeType?: string;
}

export interface SourceRef {
	mapUrl: string;
	sourceFeatureKey: string;
}

export interface FeatureRecord {
	featureId: string;
	mapId: string;
	layerId: string;
	name: string;
	description?: string;
	descriptionRaw?: string;
	images: ImageAsset[];
	latitude: number;
	longitude: number;
	rawAddress?: string;
	sourceFolderPath?: string[];
	sourceRef: SourceRef;
}
