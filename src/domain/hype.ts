export interface HypeUser {
	email: string;
	id: string;
}

export interface HypeRow {
	[key: string]: string;
	status: "OK" | "ERROR" | "SKIP";
	error: string;
	"feature.id": string;
	"feature.latitude": string;
	"feature.longitude": string;
	"feature.isArchived": string;
	"feature.isIntangible": string;
	"feature.isPublished": string;
	"feature.isVisitable": string;
	"user.email": string;
	"user.id": string;
}
