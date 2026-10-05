import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..");
const binary = process.env.COUNT_CODE_BIN
  ? [resolve(repo, process.env.COUNT_CODE_BIN)]
  : ["bun", resolve(repo, "src/cli.ts")];

async function run(cwd: string, args: string[] = []) {
  const proc = Bun.spawn([...binary, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "count-code-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "vendor"));
  writeFileSync(join(root, ".gitignore"), "*.ts\nvendor/\n");
  writeFileSync(join(root, "root.ts"), "const ignored = true;\n");
  writeFileSync(join(root, "notes.py"), "# note\nprint(1)\n");
  writeFileSync(join(root, "src", ".gitignore"), "!keep.ts\n");
  writeFileSync(join(root, "src", "keep.ts"), "let x = 1; // note\n");
  writeFileSync(join(root, "src", "drop.ts"), "let x = 2;\n");
  writeFileSync(join(root, "src", "util.js"), "const s = '//';\n");
  writeFileSync(join(root, "vendor", "large.ts"), "let x = 3;\n");
  return root;
}

test("counts a directory, respects nested .gitignore, and emits stable JSON", async () => {
  const root = fixture();
  try {
    const result = await run(root, ["--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      totals: { files: number; lines: number; code: number; comments: number; mixed: number };
      files: Array<{ path: string }>;
      languages: Array<{ language: string; files: number }>;
    };
    expect(report.files.map((file) => file.path)).toEqual([
      "notes.py",
      "src/keep.ts",
      "src/util.js",
    ]);
    expect(report.totals).toMatchObject({
      files: 3,
      lines: 7,
      code: 3,
      comments: 2,
      mixed: 1,
    });
    expect(report.languages).toEqual([
      expect.objectContaining({ language: "python", files: 1 }),
      expect.objectContaining({ language: "typescript", files: 2 }),
    ]);

    const human = await run(root, ["--files"]);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Language");
    expect(human.stdout).toContain("Total");
    expect(human.stdout).toContain("src/keep.ts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit files, language selection, no-gitignore, and overlapping roots", async () => {
  const root = fixture();
  try {
    const direct = await run(root, ["root.ts", "--json"]);
    expect(direct.exitCode).toBe(0);
    expect(JSON.parse(direct.stdout).files.map((file: { path: string }) => file.path)).toEqual([
      "root.ts",
    ]);

    const filtered = await run(root, ["--language", "python", "--json"]);
    expect(JSON.parse(filtered.stdout).files.map((file: { path: string }) => file.path)).toEqual([
      "notes.py",
    ]);

    const all = await run(root, ["--no-gitignore", "--json"]);
    expect(JSON.parse(all.stdout).totals.files).toBe(6);

    const overlapping = await run(root, [".", "src", "--json"]);
    expect(JSON.parse(overlapping.stdout).totals.files).toBe(3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid paths, languages, and notebooks fail with diagnostics", async () => {
  const root = fixture();
  try {
    const missing = await run(root, ["missing"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("Cannot access");
    expect(missing.stderr).toContain("missing");

    const language = await run(root, ["--language", "ruby"]);
    expect(language.exitCode).toBe(1);
    expect(language.stderr).toContain("language must be one of");

    writeFileSync(join(root, "bad.ipynb"), '{"cells":[{"cell_type":"code","source":42}]}');
    const notebook = await run(root, ["bad.ipynb"]);
    expect(notebook.exitCode).toBe(1);
    expect(notebook.stdout).toBe("");
    expect(notebook.stderr).toContain("bad.ipynb");
    expect(notebook.stderr).toContain("Attempted to assign to readonly property");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SQL and Shell files are counted through the CLI", async () => {
  const root = mkdtempSync(join(tmpdir(), "count-code-"));
  try {
    writeFileSync(join(root, "query.sql"), "SELECT '--'; -- note\n");
    writeFileSync(join(root, "script.sh"), "#!/bin/sh\necho hi\n");
    const result = await run(root, ["--json"]);
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as {
      files: Array<{ path: string; code: number; comments: number }>;
    };
    expect(report.files).toEqual([
      expect.objectContaining({ path: "query.sql", code: 1, comments: 1 }),
      expect.objectContaining({ path: "script.sh", code: 1, comments: 1 }),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("regex literals containing quotes do not make a TypeScript file fail", async () => {
  const root = mkdtempSync(join(tmpdir(), "count-code-"));
  try {
    writeFileSync(join(root, "app.ts"), 'const re = /["]/g;\nconst x = "ok"; // note\n');
    const result = await run(root, ["app.ts", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      totals: { files: number; lines: number; code: number; comments: number; mixed: number };
    };
    expect(report.totals).toMatchObject({
      files: 1,
      lines: 3,
      code: 2,
      comments: 1,
      mixed: 1,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("help and version work outside the repository", async () => {
  const root = mkdtempSync(join(tmpdir(), "count-code-"));
  try {
    const help = await run(root, ["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("Usage: count-code");
    expect(help.stdout).toContain("--no-gitignore");

    const version = await run(root, ["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe("0.1.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
