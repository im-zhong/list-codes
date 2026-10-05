// 2024/7/8
// zhangzhong

import { LineClass } from "../common/types";

import { Analyzer } from "./base-analyzer";

export class TsAnalyzer extends Analyzer {
  constructor({ text }: { text: string }) {
    super({
      lineCommentHead: "//",
      blockCommentHead: "/*",
      blockCommentTail: "*/",
      text,
    });
  }

  protected skipRegexIfPresent(): boolean {
    const line = this.stringStream.getCurrentLine();
    const start = this.stringStream.getCurrentOffset();
    if (line[start] !== "/" || line[start + 1] === "/" || line[start + 1] === "*") {
      return false;
    }

    const prefix = line.slice(0, start).trimEnd();
    if (
      prefix !== "" &&
      !/[([{:;,=!?&|+\-*%^~<>/]$/.test(prefix) &&
      !/\b(?:return|throw|case|delete|void|typeof|instanceof|in|of|yield|await|else|do)$/.test(prefix)
    ) {
      return false;
    }

    let inCharacterClass = false;
    for (let i = start + 1; i < line.length; i++) {
      const char = line[i];
      if (char === "\\") {
        i++;
      } else if (char === "[") {
        inCharacterClass = true;
      } else if (char === "]") {
        inCharacterClass = false;
      } else if (char === "/" && !inCharacterClass) {
        this.setLineClass({ lineClass: LineClass.Code });
        this.stringStream.setCurrentOffset(i + 1);
        return true;
      }
    }
    return false;
  }
}
