export class CliError extends Error {
	override name = "CliError";
}

export function isCliError(value: unknown): value is CliError {
	return value instanceof CliError;
}
