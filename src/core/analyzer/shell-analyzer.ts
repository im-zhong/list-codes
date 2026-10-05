// 2025/10/6
// zhangzhong

import { Analyzer } from "./base-analyzer";

export class ShellAnalyzer extends Analyzer {
    constructor({ text }: { text: string }) {
        super({
            lineCommentHead: "#",
            blockCommentHead: "",
            blockCommentTail: "",
            text,
        });
    }

    // Shell doesn't have block comments
    isBlockCommentHead(): boolean {
        return false;
    }

    skipBlockComment(): void {
        throw new Error("Shell doesn't support block comments");
    }

    // Shell doesn't have raw strings
    isRawStringHead(): boolean {
        return false;
    }

    skipRawString(): void {
        throw new Error("Shell doesn't support raw strings");
    }
}