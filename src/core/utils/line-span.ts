// 2024/7/24
// zhangzhong

export class LineSpan {
  private lineBegin: number;
  private lineEnd: number;

  constructor() {
    this.lineBegin = 0;
    this.lineEnd = 0;
  }

  getLineBegin() {
    return this.lineBegin;
  }

  getLineEnd() {
    return this.lineEnd;
  }

  nextLine() {
    this.lineEnd++;
  }

  // current line is already processed, make prepare for the next line
  resetForNextLine() {
    this.lineBegin = this.lineEnd;
  }

  // current block is processed, but current line is not
  resetForNextToken() {
    this.lineBegin = this.lineEnd - 1;
  }

  clear() {
    this.lineBegin = 0;
    this.lineEnd = 0;
  }
}
