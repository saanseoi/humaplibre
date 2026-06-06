import { CliError } from "../core/errors.ts";

export interface ParsedArgs {
  flags: Record<string, string | boolean | string[]>;
  positionals: string[];
}

const MULTI_VALUE_FLAGS = new Set(["url"]);

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: ParsedArgs["flags"] = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    if (!key) {
      throw new CliError("Invalid flag syntax.");
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    if (MULTI_VALUE_FLAGS.has(key)) {
      const values = (flags[key] as string[] | undefined) ?? [];
      values.push(next);
      flags[key] = values;
    } else {
      flags[key] = next;
    }

    index += 1;
  }

  return { flags, positionals };
}

export function getStringFlag(
  flags: ParsedArgs["flags"],
  name: string,
): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

export function getStringArrayFlag(
  flags: ParsedArgs["flags"],
  name: string,
): string[] {
  const value = flags[name];
  return Array.isArray(value) ? value : [];
}
