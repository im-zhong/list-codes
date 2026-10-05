// 2024/7/8
// zhangzhong

export class StringStream {
  private currentOffset: number;
  private lines: string[];
  private currentLineNo: number;

  constructor(text: string) {
    this.currentOffset = 0;
    this.currentLineNo = -1;
    this.lines = text.split("\n");
  }

  getNextLine(): string | undefined {
    this.currentLineNo++;
    if (this.currentLineNo >= this.lines.length) {
      return undefined;
    }
    this.currentOffset = 0;
    return this.lines[this.currentLineNo];
  }

  getCurrentLine(): string {
    if (this.currentLineNo === -1) {
      this.currentLineNo++;
    }
    return this.lines[this.currentLineNo];
  }

  getCurrentOffset(): number {
    return this.currentOffset;
  }

  setCurrentOffset(offset: number): number {
    this.currentOffset = offset;
    return offset;
  }

  addToCurrentOffset(offset: number): number {
    this.currentOffset += offset;
    return this.currentOffset;
  }

  getCurrentCharacter(): string {
    return this.getCurrentLine()[this.currentOffset];
  }
}
