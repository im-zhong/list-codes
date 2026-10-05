// 2024/9/19
// zhangzhong

import { PyAnalyzer } from "./py-analyzer";

export class GDSAnalyzer extends PyAnalyzer {
  constructor({ text, absolutePath }: { text: string; absolutePath: string }) {
    super({
      text,
      absolutePath,
    });
  }
}
