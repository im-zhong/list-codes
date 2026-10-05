# count-code

Count code and comment lines from a terminal, without VS Code. It scans one or
more files or directories and prints totals by language. The line analyzers
come from [Code Count](https://github.com/im-zhong/code-count) at commit
`7d0bdeac5fce1fcb584e8201f8b0679ed438679d` (version 0.6.0). The core
TypeScript analyzer also recognizes regex literals, including quotes inside
them.

## Install

Building from source requires [Bun](https://bun.sh):

```sh
bun install
bun run build
./dist/count-code --help
```

The compiled binary is standalone. The release workflow builds macOS arm64,
Linux arm64, and Linux x86_64 binaries. After a release is published, the
installer downloads the matching binary to `~/.local/bin`:

```sh
./install.sh
```

## Usage

```sh
count-code                       # scan the current directory
count-code src tests             # scan several paths
count-code src/main.ts           # count one file
count-code --language python     # select one language; repeat for several
count-code --files               # include per-file rows
count-code --json                # machine-readable totals and per-file rows
count-code --no-gitignore        # include files matched by .gitignore
```

The CLI supports Python (`.py`, `.py.in`, `.ipynb`), TypeScript and JavaScript,
C and C++ including CUDA, GDScript, C#, Rust, Go, Java, SQL, and shell scripts.
It uses the original extension's language groups; for example, TypeScript and
JavaScript appear in one row. `--language` accepts the names shown by
`count-code --help`.

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
symlinks and `.git` directories. They do not require Git. A missing or
unreadable path produces a diagnostic on stderr and a nonzero exit code.

`--json` includes `totals`, `languages`, and `files`. File paths are relative to
the directory where the command runs:

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
  ]
}
```

## Development

`src/core` contains the analyzers, language table, types, and supporting
utilities from Code Count. The base and TypeScript analyzers include a regex
literal fix. The new code in `src/count.ts` handles
filesystem traversal and aggregation; `src/cli.ts` handles arguments and
output. SQL and Shell are connected by the CLI adapter because the original
factory omits them. Biome excludes `src/core` to preserve the upstream
formatting in the other analyzer files.

```sh
bun run check     # lint, typecheck, source tests, compiled binary tests
bun run format    # format new CLI code only
```
