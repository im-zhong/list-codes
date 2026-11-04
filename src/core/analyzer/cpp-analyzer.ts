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

  // in cpp14, ' could be a digit separator: 1'000'000, 0x0fff'ffff
  // it is a separator if the token before it is a number, i.e. starts with a digit,
  // or if it follows an earlier separator in the same number
  // character literals like u8'a' or L'a' start with a letter
  isStringHead(): boolean {
    const line = this.stringStream.getCurrentLine();
    const offset = this.stringStream.getCurrentOffset();
    if (line[offset] === "'") {
      let begin = offset;
      while (begin > 0 && /[0-9A-Za-z_.]/.test(line[begin - 1])) {
        begin--;
      }
      if (begin < offset && (/[0-9]/.test(line[begin]) || line[begin - 1] === "'")) {
        return false;
      }
    }
    return super.isStringHead();
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
