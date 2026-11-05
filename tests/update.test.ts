import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, releaseTarget, selfUpdate } from "../src/update";

const oldBinary = "#!/bin/sh\necho 1.1.0\n";
const newBinary = "#!/bin/sh\necho 1.2.0\n";
const sha256 = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

interface Release {
  tag: string;
  binary?: string;
  digest?: string | null;
  assets?: string[];
  /** HTTP status of the API response instead of the release JSON. */
  status?: number;
  downloadStatus?: number;
  /** Send part of the binary, then never finish the response. */
  stall?: boolean;
}

interface FakeGitHub {
  api: string;
  page: string;
  requests: string[];
  authorization: Record<string, string | null>;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

// Serves a stand-in for GitHub: the "latest release" API, the /releases/latest redirect of the
// release page, and the asset downloads, with the same paths as github.com.
function serveRelease(release: Release): FakeGitHub {
  const requests: string[] = [];
  const authorization: Record<string, string | null> = {};
  let base = "";
  const server = Bun.serve({
    port: 0,
    fetch(request): Response {
      const { pathname } = new URL(request.url);
      requests.push(pathname);
      authorization[pathname] = request.headers.get("authorization");
      if (pathname === "/api/latest") {
        if (release.status) return new Response("rate limited", { status: release.status });
        const names = release.assets ?? ["lc-linux-x64", "lc-darwin-arm64"];
        return Response.json({
          tag_name: release.tag,
          assets: names.map((name) => ({
            name,
            browser_download_url: `${base}releases/download/${release.tag}/${name}`,
            digest: release.digest === undefined ? sha256(release.binary ?? "") : release.digest,
          })),
        });
      }
      if (pathname === "/releases/latest") {
        return Response.redirect(`${base}releases/tag/${release.tag}`, 302);
      }
      if (pathname.startsWith("/releases/download/")) {
        if (release.downloadStatus) return new Response("gone", { status: release.downloadStatus });
        if (release.stall) {
          return new Response(
            new ReadableStream({ start: (controller) => controller.enqueue(new Uint8Array(8)) }),
          );
        }
        return new Response(release.binary ?? "");
      }
      return new Response("not found", { status: 404 });
    },
  });
  base = server.url.href;
  cleanups.push(() => server.stop(true));
  return { api: `${base}api/latest`, page: `${base}releases`, requests, authorization };
}

function installed(): { directory: string; executable: string } {
  const directory = mkdtempSync(join(tmpdir(), "lc-update-"));
  const executable = join(directory, "lc");
  writeFileSync(executable, oldBinary, { mode: 0o755 });
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, executable };
}

async function update(github: FakeGitHub, executable: string, token?: string) {
  const messages: string[] = [];
  await selfUpdate({
    currentVersion: "1.1.0",
    executable,
    target: "linux-x64",
    api: github.api,
    page: github.page,
    token,
    log: (message: string) => messages.push(message),
    downloadTimeoutMs: 500,
    checkTimeoutMs: 500,
  });
  return messages;
}

test("compareVersions orders numeric semver parts", () => {
  expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
  expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
  expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
  expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
});

test("releaseTarget maps supported platforms to release asset suffixes", () => {
  expect(releaseTarget("linux", "x64")).toBe("linux-x64");
  expect(releaseTarget("linux", "arm64")).toBe("linux-arm64");
  expect(releaseTarget("darwin", "x64")).toBe("darwin-x64");
  expect(releaseTarget("darwin", "arm64")).toBe("darwin-arm64");
  expect(() => releaseTarget("win32", "x64")).toThrow("not supported on win32 x64");
});

test("an up-to-date or newer lc does not download the release binary", async () => {
  for (const tag of ["v1.1.0", "v1.0.0"]) {
    const github = serveRelease({ tag, binary: newBinary });
    const { executable } = installed();
    expect(await update(github, executable)).toEqual(["lc 1.1.0 is already the latest version."]);
    expect(github.requests).toEqual(["/api/latest"]);
    expect(readFileSync(executable, "utf8")).toBe(oldBinary);
  }
});

test("a newer release replaces the executable after it is verified", async () => {
  const github = serveRelease({ tag: "v1.2.0", binary: newBinary });
  const { directory, executable } = installed();
  expect(await update(github, executable)).toEqual([
    "Downloading lc 1.2.0 (linux-x64)...",
    "Updated lc from 1.1.0 to 1.2.0.",
  ]);
  expect(github.requests).toEqual(["/api/latest", "/releases/download/v1.2.0/lc-linux-x64"]);
  expect(readFileSync(executable, "utf8")).toBe(newBinary);
  expect(statSync(executable).mode & 0o777).toBe(0o755);
  expect(readdirSync(directory)).toEqual(["lc"]);
});

test("a release without a digest is still verified by its version output", async () => {
  const github = serveRelease({ tag: "v1.2.0", binary: newBinary, digest: null });
  const { executable } = installed();
  await update(github, executable);
  expect(readFileSync(executable, "utf8")).toBe(newBinary);
});

test("a failed check leaves the installed executable unchanged", async () => {
  const cases: [Release, string][] = [
    [
      { tag: "v1.2.0", binary: newBinary, digest: sha256("other") },
      "SHA-256 of lc-linux-x64 does not match",
    ],
    [{ tag: "v1.2.0", binary: oldBinary }, "reports version 1.1.0, expected 1.2.0"],
    [{ tag: "v1.2.0", binary: newBinary, assets: ["lc-darwin-arm64"] }, "has no lc-linux-x64"],
    [{ tag: "nightly", binary: newBinary }, "not a version: nightly"],
    [{ tag: "v1.2.0", status: 500 }, "HTTP 500"],
    [{ tag: "v1.2.0", binary: newBinary, downloadStatus: 404 }, "download lc-linux-x64: HTTP 404"],
    [{ tag: "v1.2.0", binary: newBinary, stall: true }, "Cannot download lc-linux-x64"],
    [{ tag: "v1.2.0", binary: newBinary, digest: "md5:abc" }, "unsupported digest"],
    [{ tag: "v1.2.0", binary: "#!/bin/sh\necho 1.2.0\nexit 3\n" }, "exited with code 3"],
    [{ tag: "v1.2.0", binary: "#!/bin/sh\nexec sleep 30\n" }, "did not finish"],
  ];
  for (const [release, message] of cases) {
    const github = serveRelease(release);
    const { directory, executable } = installed();
    const error = await update(github, executable).then(
      () => new Error("update did not fail"),
      (reason: unknown) => reason,
    );
    expect(String(error)).toContain(message);
    expect(readFileSync(executable, "utf8")).toBe(oldBinary);
    expect(readdirSync(directory)).toEqual(["lc"]);
  }
});

test.skipIf(process.getuid?.() === 0)(
  "a directory without write permission fails before the download",
  async () => {
    const github = serveRelease({ tag: "v1.2.0", binary: newBinary });
    const { directory, executable } = installed();
    chmodSync(directory, 0o555);
    try {
      const error = await update(github, executable).catch((reason: unknown) => reason);
      expect(String(error)).toContain(`no permission to write to ${directory}`);
      expect(github.requests).toEqual(["/api/latest"]);
      expect(readFileSync(executable, "utf8")).toBe(oldBinary);
    } finally {
      chmodSync(directory, 0o755);
    }
  },
);

test("a rate-limited API falls back to the release page without a digest", async () => {
  for (const status of [403, 429]) {
    const github = serveRelease({ tag: "v1.2.0", binary: newBinary, status });
    const { executable } = installed();
    const messages = await update(github, executable);
    expect(messages[0]).toContain(`The GitHub API refused the request (HTTP ${status})`);
    expect(messages.slice(1)).toEqual([
      "Downloading lc 1.2.0 (linux-x64)...",
      "Updated lc from 1.1.0 to 1.2.0.",
    ]);
    expect(github.requests).toEqual([
      "/api/latest",
      "/releases/latest",
      "/releases/download/v1.2.0/lc-linux-x64",
    ]);
    expect(readFileSync(executable, "utf8")).toBe(newBinary);
  }

  // the --version check still protects the fallback path
  const github = serveRelease({ tag: "v1.2.0", binary: oldBinary, status: 403 });
  const { executable } = installed();
  const error = await update(github, executable).catch((reason: unknown) => reason);
  expect(String(error)).toContain("reports version 1.1.0, expected 1.2.0");
  expect(readFileSync(executable, "utf8")).toBe(oldBinary);
});

test("a token is sent to the API but not to the download", async () => {
  const github = serveRelease({ tag: "v1.2.0", binary: newBinary });
  const { executable } = installed();
  await update(github, executable, "secret");
  expect(github.authorization).toEqual({
    "/api/latest": "Bearer secret",
    "/releases/download/v1.2.0/lc-linux-x64": null,
  });
});
