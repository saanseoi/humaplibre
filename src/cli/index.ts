import { cancel, intro, outro } from "@clack/prompts";
import { runExportCommand } from "./commands/export.ts";
import { runHypeCommand } from "./commands/hype.ts";
import { CliError, isCliError } from "../core/errors.ts";

export async function runCli(argv: string[]): Promise<void> {
  try {
    const [command, ...rest] = argv;

    if (command === "--help" || command === "-h" || command === "help") {
      printHelp();
      return;
    }

    if (!command || command === "export") {
      intro("gmaplibre");
      await runExportCommand(rest);
      outro("Export finished.");
      return;
    }

    if (command === "hype") {
      intro("gmaplibre hype");
      await runHypeCommand(rest);
      outro("HYPE export finished.");
      return;
    }

    throw new CliError(`Unknown command: ${command}`);
  } catch (error) {
    const message = isCliError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "Unknown error";
    cancel(message);
    process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`gmaplibre

Commands:
  gmaplibre export [--project <project>] [--mode replace|extend] [--layering same|separate] [--url <url> ...]
  gmaplibre hype [--project <project>] [--locale <locale>] [--email <email>] [--user-id <id>]
`);
}
