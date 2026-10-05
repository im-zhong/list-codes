// 2025/10/6
// zhangzhong

import { LineClass } from "../common/types";

import { Analyzer } from "./base-analyzer";

export class JavaAnalyzer extends Analyzer {
    // https://docs.oracle.com/javase/specs/jls/se8/html/jls-3.html#jls-3.7
    constructor({ text }: { text: string }) {
        super({
            lineCommentHead: "//",
            blockCommentHead: "/*",
            blockCommentTail: "*/",
            text,
        });
    }

    // base analyzer 会把 " 开头的识别成string
    // 所以我们可以认为raw string和string有什么区别吗 现在
    // 我们都允许multiple line的话就没什么区别
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
        return line.slice(offset, offset + 3) === '"""';

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


    // https://docs.oracle.com/javase/specs/jls/se8/html/jls-3.html#jls-3.10.5
    // use "" as string delimiter, just like ts and js
    // which will be handled by skipString in base-analyzer.ts
    isRawStringHead(): boolean {
        return false;
    }

    skipRawString(): void {
        throw new Error("Method not implemented.");
    }
}
