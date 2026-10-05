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
