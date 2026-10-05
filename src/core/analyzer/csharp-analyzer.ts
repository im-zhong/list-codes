// 2024/10/14
// zhangzhong

import { Analyzer } from "./base-analyzer";

export class CSharpAnalyzer extends Analyzer {
  constructor({ text }: { text: string }) {
    super({
      lineCommentHead: "//",
      blockCommentHead: "/*",
      blockCommentTail: "*/",
      text,
    });
  }
}
