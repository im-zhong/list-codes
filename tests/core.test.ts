import { expect, test } from "bun:test";
import { newAnalyzer } from "../src/core/analyzer/factory";
import { ShellAnalyzer } from "../src/core/analyzer/shell-analyzer";
import { SQLAnalyzer } from "../src/core/analyzer/sql-analyzer";
import { SupportedLanguage } from "../src/core/common/supported-languages";
import { languageForPath } from "../src/languages";

test("TypeScript analyzer distinguishes strings, code, and comments", () => {
  const result = newAnalyzer({
    text: 'const s = "/* no */"; // yes\n/* block\nstill */ let x = 1;',
    language: SupportedLanguage.TYPE_SCRIPT,
    absolutePath: "main.ts",
  })?.analyze();
  expect(result).toMatchObject({ codes: 2, comments: 3, lines: 3 });
});

test("TypeScript analyzer treats quotes inside regex literals as code", () => {
  const result = newAnalyzer({
    text: 'const re = /["]/g;\nconst value = "ok"; // note',
    language: SupportedLanguage.TYPE_SCRIPT,
    absolutePath: "app.ts",
  })?.analyze();
  expect(result).toMatchObject({ lines: 2, codes: 2, comments: 1 });
});

test("copied Python analyzer counts code cells and ignores markdown cells", () => {
  const notebook = JSON.stringify({
    cells: [
      { cell_type: "markdown", source: ["# heading"] },
      { cell_type: "code", source: ["print(1)\n", "# note"] },
      { cell_type: "code", source: ["x = 2"] },
    ],
  });
  const result = newAnalyzer({
    text: notebook,
    language: SupportedLanguage.PYTHON,
    absolutePath: "book.ipynb",
  })?.analyze();
  expect(result).toMatchObject({ codes: 2, comments: 1 });
});

test("copied C++ and Rust analyzers handle raw strings and lifetimes", () => {
  const cpp = newAnalyzer({
    text: 'auto s = R"tag(// hello\n/* world */)tag";',
    language: SupportedLanguage.CPP,
    absolutePath: "main.cpp",
  })?.analyze();
  expect(cpp).toMatchObject({ codes: 2, comments: 0 });

  const rust = newAnalyzer({
    text: 'let x = r##"// string\n/* still string */"##;\nlet y: &\'a str = "ok";',
    language: SupportedLanguage.RUST,
    absolutePath: "main.rs",
  })?.analyze();
  expect(rust).toMatchObject({ codes: 3, comments: 0 });
});

function analyzeAs(language: SupportedLanguage, text: string) {
  return newAnalyzer({ text, language, absolutePath: `main.${language}` })?.analyze();
}

test("C++ analyzer treats digit separators as code, not character literals", () => {
  const text = "int a = 10'000; // note\nauto b = 0x0fff'ffff'ffffU; char c = u8'x';\nint d = 1;";
  expect(analyzeAs(SupportedLanguage.CPP, text)).toMatchObject({ lines: 3, codes: 3, comments: 1 });
});

test("C# analyzer handles interpolated, verbatim, and nested string literals", () => {
  const nested = 'var s = $"Run: \\"{cmd}\\" {string.Join(" ", xs.Select(x => $"\\"{x}\\""))}";';
  expect(analyzeAs(SupportedLanguage.CSHARP, `${nested}\nvar t = 1; // note`)).toMatchObject({
    lines: 2,
    codes: 2,
    comments: 1,
  });
  expect(
    analyzeAs(SupportedLanguage.CSHARP, 'var p = @"C:\\temp\\";\nvar t = 1; // note'),
  ).toMatchObject({ lines: 2, codes: 2, comments: 1 });
  expect(
    analyzeAs(SupportedLanguage.CSHARP, 'var q = $@"{p}\\"" {{";\nvar c = \'}\'; // note'),
  ).toMatchObject({ lines: 2, codes: 2, comments: 1 });
});

test("Shell analyzer does not treat a backslash as an escape in single quotes", () => {
  const single = new ShellAnalyzer({ text: "sed -e '$a\\' file\necho hi # note" }).analyze();
  expect(single).toMatchObject({ lines: 2, codes: 2, comments: 1 });
  const ansiC = new ShellAnalyzer({ text: "echo $'it\\'s' # note" }).analyze();
  expect(ansiC).toMatchObject({ lines: 1, codes: 1, comments: 1 });
});

test("analyzeOrThrow reports why a malformed file cannot be counted", () => {
  const text = 'func test():\n\tprint(r"\\\\"")';
  expect(analyzeAs(SupportedLanguage.GDSCRIPT, text)).toBeUndefined();
  const analyzer = newAnalyzer({
    text,
    language: SupportedLanguage.GDSCRIPT,
    absolutePath: "bad.gd",
  });
  expect(() => analyzer?.analyzeOrThrow()).toThrow("string not closed before end of file");
});

test("copied SQL and Shell analyzers are available through the CLI adapter", () => {
  expect(new SQLAnalyzer({ text: "SELECT '--'; -- note" }).analyze()).toMatchObject({
    codes: 1,
    comments: 1,
  });
  expect(new ShellAnalyzer({ text: '#!/bin/sh\necho "hello" # note' }).analyze()).toMatchObject({
    codes: 1,
    comments: 2,
  });
});

test("copied line counting includes the final split element", () => {
  const result = newAnalyzer({
    text: "let x = 1;\n",
    language: SupportedLanguage.TYPE_SCRIPT,
    absolutePath: "main.ts",
  })?.analyze();
  expect(result).toMatchObject({ lines: 2, codes: 1, comments: 0 });
});

test("CLI suffix adapter covers all copied analyzers", () => {
  expect(languageForPath("main.py.in")).toBe(SupportedLanguage.PYTHON);
  expect(languageForPath("book.ipynb")).toBe(SupportedLanguage.PYTHON);
  expect(languageForPath("main.mts")).toBe(SupportedLanguage.TYPE_SCRIPT);
  expect(languageForPath("main.cjs")).toBe(SupportedLanguage.TYPE_SCRIPT);
  expect(languageForPath("main.h.in")).toBe(SupportedLanguage.CPP);
  expect(languageForPath("main.cu")).toBe(SupportedLanguage.CPP);
  expect(languageForPath("main.gd")).toBe(SupportedLanguage.GDSCRIPT);
  expect(languageForPath("main.cs")).toBe(SupportedLanguage.CSHARP);
  expect(languageForPath("main.rs")).toBe(SupportedLanguage.RUST);
  expect(languageForPath("main.go")).toBe(SupportedLanguage.GOLANG);
  expect(languageForPath("main.java")).toBe(SupportedLanguage.JAVA);
  expect(languageForPath("main.sql")).toBe(SupportedLanguage.SQL);
  expect(languageForPath("main.zsh")).toBe(SupportedLanguage.SHELL);
  expect(languageForPath("readme.md")).toBeUndefined();
});
