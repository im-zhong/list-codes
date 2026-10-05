// 2024/7/8
// zhangzhong

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
}
