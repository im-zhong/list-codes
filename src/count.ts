import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import { newAnalyzer } from "./core/analyzer/factory";
import { ShellAnalyzer } from "./core/analyzer/shell-analyzer";
import { SQLAnalyzer } from "./core/analyzer/sql-analyzer";
import { SupportedLanguage } from "./core/common/supported-languages";
import { type FileResult, LineClass } from "./core/common/types";
import { type Language, languageForPath, languages } from "./languages";

export interface Counts {
  lines: number;
  code: number;
  comments: number;
  blank: number;
  mixed: number;
}

export interface FileCount extends Counts {
  path: string;
  language: Language;
}

export interface LanguageCount extends Counts {
  language: Language;
  files: number;
}

export interface Report {
  totals: Counts & { files: number };
  languages: LanguageCount[];
  files: FileCount[];
}

export interface ScanOptions {
  paths: readonly string[];
  languages?: readonly Language[];
  gitignore?: boolean;
  cwd?: string;
}

interface IgnoreScope {
  directory: string;
  rules: Ignore;
}

function zeroCounts(): Counts {
  return { lines: 0, code: 0, comments: 0, blank: 0, mixed: 0 };
}

function addCounts(target: Counts, source: Counts): void {
  target.lines += source.lines;
  target.code += source.code;
  target.comments += source.comments;
  target.blank += source.blank;
  target.mixed += source.mixed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarize(result: FileResult): Counts {
  return {
    lines: result.lines,
    code: result.codes,
    comments: result.comments,
    blank: result.lineClasses.filter((line) => line === LineClass.Blank).length,
    mixed: result.lineClasses.filter((line) => line === LineClass.CodeComment).length,
  };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function withLocalRules(
  directory: string,
  scopes: readonly IgnoreScope[],
): Promise<IgnoreScope[]> {
  const file = resolve(directory, ".gitignore");
  let patterns: string;
  try {
    patterns = await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return [...scopes];
    throw new Error(`Cannot read ${file}: ${errorMessage(error)}`, { cause: error });
  }
  return [...scopes, { directory, rules: ignore().add(patterns) }];
}

function isIgnored(path: string, directory: boolean, scopes: readonly IgnoreScope[]): boolean {
  let ignored = false;
  for (const scope of scopes) {
    const name = relative(scope.directory, path).split(sep).join("/") + (directory ? "/" : "");
    const match = scope.rules.test(name);
    if (match.ignored) ignored = true;
    if (match.unignored) ignored = false;
  }
  return ignored;
}

/**
 * Scan files or directories without a Git or VS Code dependency.
 * Explicit file paths are counted even when a .gitignore would exclude them.
 * Throws with the offending path when a requested root cannot be read.
 */
export async function countPaths(options: ScanOptions): Promise<Report> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const roots = options.paths.length > 0 ? options.paths : ["."];
  const selected = new Set(options.languages ?? languages);
  const useGitignore = options.gitignore !== false;
  const files: FileCount[] = [];
  const seen = new Set<string>();

  async function countFile(path: string, language: Language): Promise<void> {
    if (!selected.has(language) || seen.has(path)) return;
    seen.add(path);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      throw new Error(`Cannot read ${path}: ${errorMessage(error)}`, { cause: error });
    }
    let result: FileResult | undefined;
    try {
      const analyzer =
        language === SupportedLanguage.SQL
          ? new SQLAnalyzer({ text })
          : language === SupportedLanguage.SHELL
            ? new ShellAnalyzer({ text })
            : newAnalyzer({ text, language, absolutePath: path });
      result = analyzer?.analyze();
    } catch (error) {
      throw new Error(`Cannot count ${path}: ${errorMessage(error)}`, { cause: error });
    }
    if (!result) {
      throw new Error(`Cannot count ${path}: analyzer returned no result.`);
    }
    const counts = summarize(result);
    files.push({ path: relative(cwd, path).split(sep).join("/"), language, ...counts });
  }

  async function walk(directory: string, parentScopes: readonly IgnoreScope[]): Promise<void> {
    const scopes = useGitignore ? await withLocalRules(directory, parentScopes) : parentScopes;
    let entries: Dirent<string>[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Cannot list ${directory}: ${errorMessage(error)}`, { cause: error });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnored(path, true, scopes)) await walk(path, scopes);
      } else if (entry.isFile()) {
        const language = languageForPath(path);
        if (language && !isIgnored(path, false, scopes)) await countFile(path, language);
      }
      // Symlinks are skipped during recursion to avoid cycles and duplicate files.
    }
  }

  async function scopesAbove(directory: string): Promise<IgnoreScope[]> {
    if (!useGitignore) return [];
    const fromCwd = relative(cwd, directory);
    if (!fromCwd || fromCwd === ".." || fromCwd.startsWith(`..${sep}`) || isAbsolute(fromCwd)) {
      return [];
    }
    let current = cwd;
    let scopes: IgnoreScope[] = [];
    for (const part of fromCwd.split(sep)) {
      scopes = await withLocalRules(current, scopes);
      current = resolve(current, part);
    }
    return scopes;
  }

  for (const root of roots) {
    const path = resolve(cwd, root);
    let details: Awaited<ReturnType<typeof stat>>;
    try {
      details = await stat(path);
    } catch (error) {
      throw new Error(`Cannot access ${path}: ${errorMessage(error)}`, { cause: error });
    }
    if (details.isDirectory()) {
      await walk(path, await scopesAbove(path));
    } else if (details.isFile()) {
      const language = languageForPath(path);
      if (!language) {
        throw new Error(
          `Unsupported file type: ${path}. Pass a directory or a supported source file.`,
        );
      }
      await countFile(path, language);
    } else {
      throw new Error(`Not a regular file or directory: ${path}`);
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const totals: Report["totals"] = { files: files.length, ...zeroCounts() };
  const byLanguage = new Map<Language, LanguageCount>();
  for (const file of files) {
    addCounts(totals, file);
    let row = byLanguage.get(file.language);
    if (!row) {
      row = { language: file.language, files: 0, ...zeroCounts() };
      byLanguage.set(file.language, row);
    }
    row.files++;
    addCounts(row, file);
  }
  return {
    totals,
    languages: languages.flatMap((language) => {
      const row = byLanguage.get(language);
      return row ? [row] : [];
    }),
    files,
  };
}
