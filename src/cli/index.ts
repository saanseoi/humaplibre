import { cancel, intro, outro } from "@clack/prompts";
import { runProcessCommand } from "./commands/process.ts";
import { runHypeCommand } from "./commands/hype.ts";
import { CliError, isCliError } from "../core/errors.ts";

export async function runCli(argv: string[]): Promise<void> {
  try {
    const [command, ...rest] = argv;

    if (command === "--help" || command === "-h" || command === "help") {
      printHelp();
      return;
    }

    if (!command || command === "process") {
      intro(`
│
│      ▗▖ ▗▖█  ▐▌▄▄▄▄  ▗▞▀▜▌▄▄▄▄  ▗▖   ▄ ▗▖    ▄▄▄ ▗▞▀▚▖
│      ▐▌ ▐▌▀▄▄▞▘█ █ █ ▝▚▄▟▌█   █ ▐▌   ▄ ▐▌   █    ▐▛▀▀▘
│      ▐▛▀▜▌     █   █      █▄▄▄▀ ▐▌   █ ▐▛▀▚▖█    ▝▚▄▄▖
│      ▐▌ ▐▌                █     ▐▙▄▄▖█ ▐▙▄▞▘
│                           ▀
│                    山水 | SaanSeoi`);
      await runProcessCommand(rest);
      outro("Export finished.");
      return;
    }

    if (command === "hype") {
      intro(`
│
│      ▗▖ ▗▖█  ▐▌▄▄▄▄  ▗▞▀▜▌▄▄▄▄  ▗▖   ▄ ▗▖    ▄▄▄ ▗▞▀▚▖
│      ▐▌ ▐▌▀▄▄▞▘█ █ █ ▝▚▄▟▌█   █ ▐▌   ▄ ▐▌   █    ▐▛▀▀▘
│      ▐▛▀▜▌     █   █      █▄▄▄▀ ▐▌   █ ▐▛▀▚▖█    ▝▚▄▄▖
│      ▐▌ ▐▌                █     ▐▙▄▄▖█ ▐▙▄▞▘
│                           ▀
│                 山水 | SaanSeoi | HYPE`);
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
  console.log(`humaplibre

Commands:
  gmaplibre export [--project <import-project>]
  gmaplibre hype [--project <project>] [--locale <locale>] [--email <email>] [--user-id <id>]
`);
}
