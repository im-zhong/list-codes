import { expect, test } from "bun:test";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..");
const binary = process.env.LC_BIN
  ? [resolve(repo, process.env.LC_BIN)]
  : ["bun", resolve(repo, "src/cli.ts")];
const { version } = JSON.parse(readFileSync(resolve(repo, "package.json"), "utf8")) as {
  version: string;
};

async function run(cwd: string, args: string[] = [], command: string[] = binary, env = {}) {
  const proc = Bun.spawn([...command, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "lc-"));
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

test("invalid paths and languages fail; invalid notebooks are left out", async () => {
  const root = fixture();
  try {
    const missing = await run(root, ["missing"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toStartWith("lc: ");
    expect(missing.stderr).toContain("Cannot access");
    expect(missing.stderr).toContain("missing");

    const language = await run(root, ["--language", "ruby"]);
    expect(language.exitCode).toBe(1);
    expect(language.stderr).toContain("language must be one of");

    writeFileSync(join(root, "bad.ipynb"), '{"cells":[{"cell_type":"code","source":42}]}');
    const notebook = await run(root, ["bad.ipynb"]);
    expect(notebook.exitCode).toBe(0);
    expect(notebook.stderr).toBe("");
    expect(notebook.stdout).toContain("No files were counted.");
    expect(notebook.stdout).toContain("Left out 1 file that could not be counted:");
    expect(notebook.stdout).toContain("bad.ipynb: Attempted to assign to readonly property");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("files that cannot be counted are left out and listed in the report", async () => {
  const root = mkdtempSync(join(tmpdir(), "lc-"));
  try {
    writeFileSync(join(root, "bad.gd"), 'func test():\n\tprint(r"\\\\"")\n');
    writeFileSync(join(root, "good.gd"), "var x = 1 # note\n");
    const result = await run(root, ["--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      totals: { files: number };
      files: Array<{ path: string }>;
      skipped: Array<{ path: string; reason: string }>;
    };
    expect(report.totals.files).toBe(1);
    expect(report.files.map((file) => file.path)).toEqual(["good.gd"]);
    expect(report.skipped).toEqual([
      { path: "bad.gd", reason: "string not closed before end of file" },
    ]);

    const human = await run(root);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Total");
    expect(human.stdout).toEndWith(
      "Left out 1 file that could not be counted:\n  bad.gd: string not closed before end of file\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SQL and Shell files are counted through the CLI", async () => {
  const root = mkdtempSync(join(tmpdir(), "lc-"));
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
  const root = mkdtempSync(join(tmpdir(), "lc-"));
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
  const root = mkdtempSync(join(tmpdir(), "lc-"));
  try {
    const help = await run(root, ["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("Usage: lc");
    expect(help.stdout).toContain("--no-gitignore");

    const versionRun = await run(root, ["--version"]);
    expect(versionRun.exitCode).toBe(0);
    expect(versionRun.stdout.trim()).toBe(version);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("self is a command group; other paths and root options work as before", async () => {
  const root = mkdtempSync(join(tmpdir(), "lc-"));
  try {
    const help = await run(root, ["--help"]);
    expect(help.stdout).toMatch(/^Commands:\n\s+self\s+manage this lc installation$/m);

    const self = await run(root, ["self", "--help"]);
    expect(self.exitCode).toBe(0);
    expect(self.stdout).toContain("Usage: lc self");
    expect(self.stdout).toMatch(/^\s+update\s+replace this lc binary/m);

    const bare = await run(root, ["self"]);
    expect(bare.exitCode).toBe(1);
    expect(bare.stderr).toContain("Usage: lc self");

    const rootOption = await run(root, ["self", "update", "--json"]);
    expect(rootOption.exitCode).toBe(1);
    expect(rootOption.stderr).toContain("unknown option '--json'");

    // a directory named self is counted when it is written as a path
    mkdirSync(join(root, "self"));
    writeFileSync(join(root, "self", "main.py"), "print(1)\n");
    for (const args of [
      ["./self", "--json"],
      ["--json", "./self"],
    ]) {
      const count = await run(root, args);
      expect(count.exitCode).toBe(0);
      expect(JSON.parse(count.stdout).files.map((file: { path: string }) => file.path)).toEqual([
        "self/main.py",
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.skipIf(process.env.LC_BIN !== undefined)(
  "self update refuses to run from source",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "lc-"));
    try {
      const result = await run(root, ["self", "update"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("lc: self update only works for an installed lc binary");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// Serves a fake latest release whose binary for this platform is `script`.
function serveFakeRelease(script: string) {
  let base = "";
  const server = Bun.serve({
    port: 0,
    fetch(request): Response {
      if (new URL(request.url).pathname !== "/latest") return new Response(script);
      const name = `lc-${process.platform}-${process.arch}`;
      return Response.json({
        tag_name: "v9.9.9",
        assets: [{ name, browser_download_url: `${base}${name}` }],
      });
    },
  });
  base = server.url.href;
  return { server, env: { LC_RELEASES_API: `${base}latest` } };
}

test.skipIf(process.env.LC_BIN === undefined)(
  "self update replaces the compiled binary",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "lc-"));
    const newBinary = "#!/bin/sh\necho 9.9.9\n";
    const { server, env } = serveFakeRelease(newBinary);
    try {
      const lc = join(root, "lc");
      copyFileSync(binary[0], lc);
      const result = await run(root, ["self", "update"], [lc], env);
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Updated lc from ${version} to 9.9.9.`);
      expect(readFileSync(lc, "utf8")).toBe(newBinary);
      expect(readdirSync(root)).toEqual(["lc"]);
    } finally {
      server.stop(true);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test.skipIf(process.env.LC_BIN === undefined)(
  "stopping self update during the check removes the downloaded file",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "lc-"));
    const { server, env } = serveFakeRelease("#!/bin/sh\nexec sleep 30\n");
    try {
      const lc = join(root, "lc");
      copyFileSync(binary[0], lc);
      const proc = Bun.spawn([lc, "self", "update"], {
        cwd: root,
        env: { ...process.env, ...env },
        stdout: "ignore",
        stderr: "ignore",
      });
      while (!readdirSync(root).some((name) => name.startsWith("lc.update-"))) {
        await Bun.sleep(20);
      }
      proc.kill("SIGTERM");
      expect(await proc.exited).toBe(143);
      expect(readdirSync(root)).toEqual(["lc"]);
      expect(readFileSync(lc)).toEqual(readFileSync(binary[0]));
    } finally {
      server.stop(true);
      rmSync(root, { recursive: true, force: true });
    }
  },
);
