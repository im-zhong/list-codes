import { createHash } from "node:crypto";
import { constants, rmSync } from "node:fs";
import { access, chmod, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

export const RELEASES_API = "https://api.github.com/repos/im-zhong/list-codes/releases/latest";

const TARGETS = new Set(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"]);

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

export interface SelfUpdateOptions {
  currentVersion: string;
  executable: string;
  target: string;
  api?: string;
  log?: (message: string) => void;
  /** Time limit for the binary download. */
  downloadTimeoutMs?: number;
  /** Time limit for running the downloaded binary with --version. */
  checkTimeoutMs?: number;
}

/** The release asset suffix for a platform, matching install.sh and the release workflow. */
export function releaseTarget(platform: string = process.platform, arch: string = process.arch) {
  const target = `${platform}-${arch}`;
  if (!TARGETS.has(target)) {
    throw new Error(
      `self update is not supported on ${platform} ${arch}. ` +
        "Releases exist for macOS and Linux on x64 and arm64.",
    );
  }
  return target;
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The path of the running lc binary, or undefined when lc runs from source.
 * In a `bun build --compile` binary, the entry point is inside the embedded /$bunfs/ file system
 * and process.execPath is the binary itself; from source, process.execPath is the bun runtime.
 */
export function installedExecutable(): string | undefined {
  return Bun.main.startsWith("/$bunfs/") ? process.execPath : undefined;
}

async function fetchOk(url: string, what: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot ${what}: ${message}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Cannot ${what}: HTTP ${response.status} from ${url}`);
  }
  return response;
}

async function versionOf(executable: string, timeoutMs: number): Promise<string> {
  const proc = Bun.spawn([executable, "--version"], { stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
  try {
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (proc.signalCode === "SIGKILL") {
      throw new Error(`--version did not finish in ${timeoutMs / 1000} s.`);
    }
    if (exitCode !== 0) {
      throw new Error(`--version exited with code ${exitCode}.`);
    }
    return stdout.trim();
  } finally {
    clearTimeout(timer);
  }
}

// Remove `path` if lc is stopped with Ctrl-C or SIGTERM while `work` runs.
async function removeOnSignal<T>(path: string, work: () => Promise<T>): Promise<T> {
  const handlers = (["SIGINT", "SIGTERM"] as const).map((signal) => {
    const handler = () => {
      rmSync(path, { force: true });
      process.exit(signal === "SIGINT" ? 130 : 143);
    };
    process.once(signal, handler);
    return [signal, handler] as const;
  });
  try {
    return await work();
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }
}

/**
 * Replace `executable` with the latest release binary for `target`.
 * The download goes to a temporary file in the same directory, is verified by its SHA-256
 * digest (when the release lists one) and by its --version output, and then is renamed over
 * the executable. If any step fails, the installed executable is not changed.
 */
export async function selfUpdate(options: SelfUpdateOptions): Promise<void> {
  const {
    currentVersion,
    executable,
    target,
    api = RELEASES_API,
    log = console.log,
    downloadTimeoutMs = 600_000,
    checkTimeoutMs = 10_000,
  } = options;
  const userAgent = `lc/${currentVersion}`;
  const response = await fetchOk(api, "check the latest release", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  const release = (await response.json()) as Release;
  const latest = release.tag_name.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(latest)) {
    throw new Error(`The latest release tag is not a version: ${release.tag_name}`);
  }
  if (compareVersions(latest, currentVersion) <= 0) {
    log(`lc ${currentVersion} is already the latest version.`);
    return;
  }

  const name = `lc-${target}`;
  const asset = release.assets.find((item) => item.name === name);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} has no ${name} binary.`);
  }
  if (asset.digest && !asset.digest.startsWith("sha256:")) {
    throw new Error(
      `Release ${release.tag_name} has an unsupported digest for ${name}: ${asset.digest}`,
    );
  }

  const directory = dirname(executable);
  try {
    await access(directory, constants.W_OK);
  } catch {
    throw new Error(
      `Cannot update ${executable}: no permission to write to ${directory}. ` +
        "Run the command as a user that can write there, or install lc again with install.sh.",
    );
  }

  log(`Downloading lc ${latest} (${target})...`);
  let bytes: Uint8Array;
  try {
    const download = await fetchOk(asset.browser_download_url, `download ${name}`, {
      headers: { Accept: "application/octet-stream", "User-Agent": userAgent },
      signal: AbortSignal.timeout(downloadTimeoutMs),
    });
    bytes = new Uint8Array(await download.arrayBuffer());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message.startsWith("Cannot ") ? message : `Cannot download ${name}: ${message}`,
      {
        cause: error,
      },
    );
  }
  if (asset.digest) {
    const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (actual !== asset.digest) {
      throw new Error(`The SHA-256 of ${name} does not match the release: ${actual}`);
    }
  }

  const temporary = `${executable}.update-${process.pid}`;
  await removeOnSignal(temporary, async () => {
    try {
      await Bun.write(temporary, bytes);
      await chmod(temporary, 0o755);
      const reported = await versionOf(temporary, checkTimeoutMs);
      if (reported !== latest) {
        throw new Error(`The downloaded ${name} reports version ${reported}, expected ${latest}.`);
      }
      await rename(temporary, executable);
    } catch (error) {
      await rm(temporary, { force: true });
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot update ${executable}: ${message}`, { cause: error });
    }
  });
  log(`Updated lc from ${currentVersion} to ${latest}.`);
}
