// 2024/7/16
// zhangzhong

import { LineClass } from "../common/types";

import { Analyzer } from "./base-analyzer";

export class CppAnalyzer extends Analyzer {
  constructor({ text }: { text: string }) {
    super({
      lineCommentHead: "//",
      blockCommentHead: "/*",
      blockCommentTail: "*/",
      text,
    });
  }

  // in cpp, raw string could be R"  R"..."
  // https://en.cppreference.com/w/cpp/language/string_literal
  isRawStringHead(): boolean {
    const line = this.stringStream.getCurrentLine();
    const offset = this.stringStream.getCurrentOffset();
    return (
      line.at(offset) === "R" &&
      this.isStringHeadImpl({ line, offset: offset + 1 })
    );
  }

  skipRawString(): void {
    const raw_string_tail = this.getRawStringTail();
    this.skipUntilFindDelimiter({
      // offset -> R"de()de""
      // the head and tail's length is the same,
      // and we also should skip the first 'R'
      firstSkipLength: raw_string_tail.length + 1,
      delimiter: raw_string_tail,
      lineClass: LineClass.Code,
    });
  }

  getRawStringTail(): string {
    // R"de( ... )de";
    // offset -> R
    // get d-char-seq first
    const line = this.stringStream.getCurrentLine();
    const offset = this.stringStream.getCurrentOffset();

    // end -> (
    const bracket = line.indexOf("(", offset + 2);
    if (bracket === -1) {
      throw new Error("raw string head not found");
    }

    // construct raw delimiter tail: )de"
    return ")" + line.slice(offset + 2, bracket) + line.at(offset + 1);
  }
}
