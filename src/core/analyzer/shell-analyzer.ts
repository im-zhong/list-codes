// 2025/10/6
// zhangzhong

import { LineClass } from "../common/types";

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

    // in single quotes, a backslash is not an escape: '$a\' is a complete string
    // but $'...' is ANSI-C quoting, which supports \' escapes like a double quoted string
    skipString(): void {
        const line = this.stringStream.getCurrentLine();
        const offset = this.stringStream.getCurrentOffset();
        if (line[offset] === "'" && line[offset - 1] !== "$") {
            this.skipUntilFindDelimiter({
                firstSkipLength: 1,
                delimiter: "'",
                lineClass: LineClass.Code,
            });
            return;
        }
        super.skipString();
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