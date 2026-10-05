// 2025/10/6
// zhangzhong


import { Analyzer } from "./base-analyzer";

// https://go.dev/ref/spec
export class GolangAnalyzer extends Analyzer {
    // https://go.dev/ref/spec#Comments
    constructor({ text }: { text: string }) {
        super({
            lineCommentHead: "//",
            blockCommentHead: "/*",
            blockCommentTail: "*/",
            text,
        });
    }

    // https://go.dev/ref/spec#String_literals
    // use `` as raw string delimiter, just like ts and js
    // which will be handled by skipString in base-analyzer.ts
    isRawStringHead(): boolean {
        return false;
    }

    skipRawString(): void {
        throw new Error("Method not implemented.");
    }
}