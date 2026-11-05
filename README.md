# lc — list codes

Count code and comment lines from a terminal, without VS Code. It scans one or
more files or directories and prints totals by language. The line analyzers
come from [Code Count](https://github.com/im-zhong/code-count) at commit
`7d0bdeac5fce1fcb584e8201f8b0679ed438679d` (version 0.6.0). The core
TypeScript analyzer also recognizes regex literals, including quotes inside
them.

## Install

The release workflow builds standalone binaries for macOS x86_64, macOS arm64,
Linux x86_64, and Linux arm64. The installer downloads the matching binary from
the latest release to `~/.local/bin/lc`:

```sh
curl -fsSL https://raw.githubusercontent.com/im-zhong/list-codes/main/install.sh | sh
```

Set `INSTALL_DIR` to select a different directory. For a local copy of
`install.sh`, give the directory as the first argument:

```sh
curl -fsSL https://raw.githubusercontent.com/im-zhong/list-codes/main/install.sh | INSTALL_DIR="$HOME/bin" sh
./install.sh "$HOME/bin"
```

To update an installed `lc` to the latest release, run:

```sh
lc self update
```

The command asks the GitHub releases API for the latest version. If that
version is newer, it downloads the binary for your platform to a temporary file
in the same directory as `lc`. It checks the SHA-256 digest from the release,
if the release gives one, and it runs the new file with `--version`. Only then
does it rename the new file over the old one. If a step fails, the installed
`lc` does not change. You must have permission to write to the directory that
holds `lc`. A copy that runs from source with `bun src/cli.ts` cannot update
itself.

Without a token, the GitHub API accepts only 60 requests per hour from one IP
address. If `GH_TOKEN` or `GITHUB_TOKEN` is set, `lc self update` sends it to
the API, and the limit is 5000 requests per hour. The token is not sent with
the download. If the API refuses the request, `lc self update` gets the latest
version from the release page. In that case, no SHA-256 digest is available,
so the `--version` check is the only check.

Building from source requires [Bun](https://bun.sh):

```sh
bun install
bun run build
./dist/lc --help
```

## Usage

```sh
lc                       # scan the current directory
lc src tests             # scan several paths
lc src/main.ts           # count one file
lc --language python     # select one language; repeat for several
lc --files               # include per-file rows
lc --json                # machine-readable totals and per-file rows
lc --no-gitignore        # include files matched by .gitignore
lc self update           # update lc to the latest release
```

`self` is a command name. To count a directory that has the name `self`, write
`lc ./self`.

The CLI supports Python (`.py`, `.py.in`, `.ipynb`), TypeScript and JavaScript,
C and C++ including CUDA, GDScript, C#, Rust, Go, Java, SQL, and shell scripts.
It uses the original extension's language groups; for example, TypeScript and
JavaScript appear in one row. `--language` accepts the names shown by
`lc --help`.

The table has these columns:

| Column | Meaning |
| --- | --- |
| Files | Number of supported files counted |
| Lines | Physical lines according to the copied analyzer |
| Code | Lines containing code, including strings |
| Comments | Lines containing a comment |
| Blank | Lines containing neither code nor a comment |
| Mixed | Lines counted in both Code and Comments |

Code and Comments can overlap. Therefore `Lines = Code + Comments + Blank - Mixed`.
The copied analyzer splits text on newlines, so an empty file counts as one
blank line and a file ending in a newline has a final blank line. Python
notebooks count code cells; markdown and outputs are excluded.

Directory scans read nested `.gitignore` files, including negation rules.
An explicit file path is counted even if ignored. Recursive scans skip
symlinks and `.git` directories. They do not require Git. A missing path, or a
directory that cannot be read, produces a diagnostic on stderr and a nonzero
exit code.

A file that cannot be read or analyzed, for example a file with a string that
is not closed, does not stop the scan. This also applies to a file given as an
argument. The file is left out of the totals, the exit code stays zero, and
the report ends with a list of the left-out files and the reason for each:

```text
Left out 1 file that could not be counted:
  tests/errors/bad_string.gd: string not closed before end of file
```

`--json` includes `totals`, `languages`, `files`, and `skipped`. File paths are
relative to the directory where the command runs:

```json
{
  "totals": {
    "files": 1,
    "lines": 2,
    "code": 1,
    "comments": 1,
    "blank": 1,
    "mixed": 1
  },
  "languages": [
    {
      "language": "typescript",
      "files": 1,
      "lines": 2,
      "code": 1,
      "comments": 1,
      "blank": 1,
      "mixed": 1
    }
  ],
  "files": [
    {
      "path": "src/main.ts",
      "language": "typescript",
      "lines": 2,
      "code": 1,
      "comments": 1,
      "blank": 1,
      "mixed": 1
    }
  ],
  "skipped": [
    {
      "path": "tests/errors/bad_string.gd",
      "reason": "string not closed before end of file"
    }
  ]
}
```

## Development

`src/core` contains the analyzers, language table, types, and supporting
utilities from Code Count. The base and TypeScript analyzers include a regex
literal fix. Local fixes also handle C++ digit separators (`1'000`), C#
interpolated and verbatim strings, and shell single quotes. The base analyzer
adds `analyzeOrThrow()`, which reports why a file cannot be analyzed.

The new code in `src/count.ts` handles filesystem traversal and aggregation;
`src/cli.ts` handles arguments and output; `src/update.ts` handles
`lc self update`. Tests set `LC_RELEASES_API` to a local server in place of the
GitHub releases API. SQL and Shell are connected by the CLI adapter because the
original factory omits them. Biome excludes `src/core` to preserve the upstream
formatting in the other analyzer files.

```sh
bun run check     # lint, typecheck, source tests, compiled binary tests
bun run format    # format new CLI code only
```
