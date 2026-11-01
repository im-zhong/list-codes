import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const installer = resolve(import.meta.dir, "..", "install.sh");
const releases = "https://github.com/im-zhong/list-codes/releases/latest/download";

const uname = `#!/bin/sh
case "$1" in
  -s) echo "$MOCK_OS" ;;
  -m) echo "$MOCK_ARCH" ;;
  *) exit 1 ;;
esac
`;

// Records the requested URL and writes a tiny stand-in for the release binary.
const curl = `#!/bin/sh
url=""
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    https://*) url="$1" ;;
  esac
  shift
done
echo "$url" >> "$MOCK_CURL_LOG"
printf '#!/bin/sh\\necho 1.0.0\\n' > "$out"
`;

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "lc-install-"));
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "home"));
  writeFileSync(join(root, "bin", "uname"), uname, { mode: 0o755 });
  writeFileSync(join(root, "bin", "curl"), curl, { mode: 0o755 });
  return root;
}

async function install(root: string, os: string, arch: string) {
  const proc = Bun.spawn(["/bin/sh", installer], {
    cwd: root,
    env: {
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      HOME: join(root, "home"),
      INSTALL_DIR: join(root, "install"),
      MOCK_OS: os,
      MOCK_ARCH: arch,
      MOCK_CURL_LOG: join(root, "curl.log"),
    },
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

const platforms: Array<[string, string, string]> = [
  ["Darwin", "x86_64", "darwin-x64"],
  ["Darwin", "arm64", "darwin-arm64"],
  ["Linux", "x86_64", "linux-x64"],
  ["Linux", "amd64", "linux-x64"],
  ["Linux", "aarch64", "linux-arm64"],
  ["Linux", "arm64", "linux-arm64"],
];

test.each(platforms)("installer on %s %s downloads lc-%s", async (os, arch, target) => {
  const root = fixture();
  try {
    const result = await install(root, os, arch);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, "install", "lc"))).toBe(true);
    expect(result.stdout.split("\n")).toContain("1.0.0");
    expect(readFileSync(join(root, "curl.log"), "utf8")).toBe(`${releases}/lc-${target}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer rejects an unsupported 32-bit platform without downloading", async () => {
  const root = fixture();
  try {
    const result = await install(root, "Linux", "i686");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unsupported platform: Linux i686");
    expect(existsSync(join(root, "curl.log"))).toBe(false);
    expect(existsSync(join(root, "install", "lc"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
