import { runCli } from "./src/cli/index.ts";

await runCli(Bun.argv.slice(2));
