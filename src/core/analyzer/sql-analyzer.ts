// 2025/10/6
// zhangzhong

import { Analyzer } from "./base-analyzer";

export class SQLAnalyzer extends Analyzer {
    constructor({ text }: { text: string }) {
        super({
            lineCommentHead: "--",
            blockCommentHead: "/*",
            blockCommentTail: "*/",
            text,
        });
    }

    // SQL doesn't have raw strings
    isRawStringHead(): boolean {
        return false;
    }

    skipRawString(): void {
        throw new Error("SQL doesn't support raw strings");
    }
}