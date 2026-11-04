// 2024/10/14
// zhangzhong

import { LineClass } from "../common/types";

import { Analyzer } from "./base-analyzer";

// "...", $"..." interpolated, @"..." verbatim, $@"..." or @$"..." both
const STRING_HEADS = ['$@"', '@$"', '$"', '@"', '"'];

export class CSharpAnalyzer extends Analyzer {
  constructor({ text }: { text: string }) {
    super({
      lineCommentHead: "//",
      blockCommentHead: "/*",
      blockCommentTail: "*/",
      text,
    });
  }

  isStringHead(): boolean {
    return this.matchStringHead() !== undefined || super.isStringHead();
  }

  // the base analyzer does not know that an interpolation hole {...} could contain
  // other strings, i.e. $"{string.Join(" ", xs)}", or that \ is not an escape in @"..."
  skipString(): void {
    if (!this.skipStringIfPresent()) {
      super.skipString();
      return;
    }
    this.setLineClass({ lineClass: LineClass.Code });
  }

  private matchStringHead(): string | undefined {
    const line = this.stringStream.getCurrentLine();
    const offset = this.stringStream.getCurrentOffset();
    return STRING_HEADS.find((head) => line.startsWith(head, offset));
  }

  private skipStringIfPresent(): boolean {
    const head = this.matchStringHead();
    if (head === undefined) {
      return false;
    }
    this.stringStream.addToCurrentOffset(head.length);
    this.skipStringBody({
      quote: '"',
      interpolated: head.includes("$"),
      verbatim: head.includes("@"),
    });
    return true;
  }

  // offset -> the first character after the opening quote
  // after return, offset -> the first character after the closing quote
  private skipStringBody({
    quote,
    interpolated,
    verbatim,
  }: {
    quote: string;
    interpolated: boolean;
    verbatim: boolean;
  }): void {
    for (;;) {
      const char = this.nextCharacter();
      const next = this.stringStream.getCurrentLine()[this.stringStream.getCurrentOffset() + 1];
      if (
        (char === "\\" && !verbatim) ||
        (char === quote && verbatim && next === quote) ||
        (char === "{" && interpolated && next === "{")
      ) {
        // escape sequence: \x, "" in verbatim string, {{ in interpolated string
        this.stringStream.addToCurrentOffset(2);
        continue;
      }
      this.stringStream.addToCurrentOffset(1);
      if (char === quote) {
        return;
      }
      if (char === "{" && interpolated) {
        this.skipInterpolationHole();
      }
    }
  }

  // offset -> the first character after {
  // after return, offset -> the first character after the matching }
  private skipInterpolationHole(): void {
    let depth = 1;
    while (depth > 0) {
      const char = this.nextCharacter();
      if (this.skipStringIfPresent()) {
        continue;
      }
      this.stringStream.addToCurrentOffset(1);
      if (char === "'") {
        this.skipStringBody({ quote: "'", interpolated: false, verbatim: false });
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      }
    }
  }

  // string literals could span lines, so move to the next line at the end of a line
  private nextCharacter(): string {
    while (this.stringStream.getCurrentOffset() >= this.stringStream.getCurrentLine().length) {
      if (this.getLineAndResetOffset() === undefined) {
        throw new Error("string not closed before end of file");
      }
    }
    return this.stringStream.getCurrentCharacter();
  }
}
