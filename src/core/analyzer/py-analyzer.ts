// 2024/7/8
// zhangzhong

import { LineClass } from "../common/types";

import { Analyzer } from "./base-analyzer";

function extractCodesFromIpynb({ text }: { text: string }): string {
  // first check if current file is empty
  // cause empty ipynb is a valid ipynb, but its content is an empty file
  text = text.trim();
  if (text === "") {
    return "";
  }

  const codes: string[] = [];
  const ipynb = JSON.parse(text);
  for (const cell of ipynb.cells) {
    if (cell.cell_type === "code") {
      const source: string[] = cell.source;
      if (cell.source.length === 0) {
        continue;
      }
      source[source.length - 1] += "\n";
      codes.push(...source);
    }
  }

  return codes.join("");
}

export class PyAnalyzer extends Analyzer {
  constructor({ text, absolutePath }: { text: string; absolutePath: string }) {
    if (absolutePath.endsWith(".ipynb")) {
      text = extractCodesFromIpynb({ text });
    }
    super({
      lineCommentHead: "#",
      blockCommentHead: "",
      blockCommentTail: "",
      text,
    });
  }

  // overload the block comment check method
  // cause python do not has block comment
  isBlockCommentHead(): boolean {
    return false;
  }

  skipBlockComment(): void {}

  // in python, raw string could be r' r" r""" r''' etc.
  isRawStringHead(): boolean {
    const line = this.stringStream.getCurrentLine();
    const offset = this.stringStream.getCurrentOffset();
    return (
      line.slice(offset, offset + 2) === "r'" ||
      line.slice(offset, offset + 2) === 'r"' ||
      line.slice(offset, offset + 4) === 'r"""' ||
      line.slice(offset, offset + 4) === "r'''"
    );
  }

  skipRawString(): void {
    // determine the raw string head is r' or r" or r''' or r"""
    const line = this.stringStream.getCurrentLine();
    const offset = this.stringStream.getCurrentOffset();
    let delimiterLength = 1;
    if (
      line.slice(offset, offset + 4) === "r'''" ||
      line.slice(offset, offset + 4) === 'r"""'
    ) {
      delimiterLength = 3;
    }

    // raw string: r"..."
    // offset -> r, but r should not couat as a part of raw string
    const delimiter = line.slice(offset + 1, offset + 1 + delimiterLength);
    this.skipUntilFindDelimiter({
      firstSkipLength: 1 + delimiterLength,
      delimiter,
      lineClass: LineClass.Code,
    });
  }

  skipString() {
    // maybe is ''' or """
    if (this.isBlockStringHead()) {
      this.skipBlockString();
      return;
    }

    super.skipString();
  }

  isBlockStringHead(): boolean {
    const line = this.stringStream.getCurrentLine();
    const offset = this.stringStream.getCurrentOffset();
    return (
      line.slice(offset, offset + 3) === '"""' ||
      line.slice(offset, offset + 3) === "'''"
    );
  }

  skipBlockString(): void {
    const delimiter = this.stringStream
      .getCurrentLine()
      .slice(
        this.stringStream.getCurrentOffset(),
        this.stringStream.getCurrentOffset() + 3,
      );

    // offset -> "...["]""..."
    this.skipUntilFindDelimiter({
      firstSkipLength: delimiter.length,
      delimiter,
      lineClass: LineClass.Code,
    });
    // offset -> "..."""[x]..."

    // at this point, we could not say that we found the true delimiter
    // cause there maybe escape sequence before the tail delimiter
    // so we need to check it
    // if it has, then we should coutinue found the true tail delimiter
    while (this.isFoundEscapeSequence({ backLength: delimiter.length + 1 })) {
      this.skipUntilFindDelimiter({
        firstSkipLength: 0,
        delimiter,
        lineClass: LineClass.Code,
      });
    }
  }
}
