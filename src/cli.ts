#!/usr/bin/env bun

import { Command, InvalidArgumentError } from "commander";
import { countPaths } from "./count";
import { type Language, languages } from "./languages";
import { renderReport } from "./report";

const VERSION = "1.0.0";

function collectLanguage(value: string, previous: Language[]): Language[] {
  const language = languages.find((item) => item === value.toLowerCase());
  if (!language) {
    throw new InvalidArgumentError(`language must be one of: ${languages.join(", ")}`);
  }
  return [...previous, language];
}

const program = new Command()
  .name("lc")
  .description("Count source, comment, and blank lines in files or directories.")
  .version(VERSION)
  .argument("[paths...]", "files or directories to count (default: current directory)")
  .option(
    "-l, --language <name>",
    `only count a language; repeatable: ${languages.join(", ")}`,
    collectLanguage,
    [],
  )
  .option("--files", "show counts for each file")
  .option("--json", "print machine-readable JSON including per-file counts")
  .option("--no-gitignore", "count files matched by .gitignore rules")
  .helpCommand("help [command]", "display help")
  .action(async (paths: string[]) => {
    const options = program.opts<{
      language: Language[];
      files?: boolean;
      json?: boolean;
      gitignore: boolean;
    }>();
    const report = await countPaths({
      paths,
      languages: options.language.length > 0 ? options.language : undefined,
      gitignore: options.gitignore,
    });
    console.log(
      options.json ? JSON.stringify(report, null, 2) : renderReport(report, options.files === true),
    );
  });

await program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`lc: ${message}`);
  process.exitCode = 1;
});
