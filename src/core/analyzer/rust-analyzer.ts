// 2025/10/5
// zhangzhong

import { LineClass } from "../common/types";
import { isIdentPart, isIdentStart } from "../utils/string-utils";

import { Analyzer } from "./base-analyzer";

export class RustAnalyzer extends Analyzer {
    // https://doc.rust-lang.org/reference/comments.html
    constructor({ text }: { text: string }) {
        super({
            lineCommentHead: "//",
            blockCommentHead: "/*",
            blockCommentTail: "*/",
            text,
        });
    }

    // rust有一个问题需要处理就是生命周期标注
    // 所以在skip string的时候，如果发现是&' 就忽略就行了
    // examples: foo<'a, 'b>
    // - fn print_refs<'a, 'b>(x: &'a i32, y: &'b i32)
    // - struct Ref<'a, T: 'a>(&'a T);
    // - fn choose_first<'a: 'b, 'b>(first: &'a i32, _: &'b i32) -> &'b i32
    // - let s: &'static str = "hello world";
    // 我们没有办法通过前缀或者后缀来区分生命周期标注和string
    // rust你这么设计你自己的lexer好写吗？真是的
    // '////////'
    // skipString(): void {
    //     const line = this.stringStream.getCurrentLine();
    //     const offset = this.stringStream.getCurrentOffset();

    //     // check if 
    //     const delimiter = this.stringStream.getCurrentCharacter();

    // }

    // 咱们碰到 '' 这种字符直接不处理了吧 看看会发生什么
    // '\\\\\'
    // 会出错，因为会导致 '\'' 这样的字符的处理不了



    // 然后rust的raw string是 r"" 或者 // r#""#
    // 所以大多数语言的raw string 都可以用类似的方法实现
    // 那么可以，感觉我目前实现的这几个语言的raw string都各有各的区别 还是实现一个特例吧


    // 找到了一种方法，因为生命周期标注后面必须是一个identifier
    // 并且identifier必须以一个字母开头，所以可以先看看' 后面是不是一个字符
    // 然后，如果是生命周期，那么后面一定是 [a-zA-Z_]+
    // 就这样读，直到碰到一个不是的，然后看看是不是 ' 也就是char的delimiter
    // 如果是，那么就是char，否则就是lifetime annotation

    // 比较好的实现方法是override isStringHead, 而不是skiphead
    // 全程使用peek 虽然性能上有一点点损失，但是更不容易出错


    isStringHead(): boolean {
        const line = this.stringStream.getCurrentLine();
        const offset = this.stringStream.getCurrentOffset();

        if (line[offset] === '"') {
            return true;
        }

        if (line[offset] === "'") {
            return !this.isLifetimeAnnotation();
        }

        return false;
    }

    isLifetimeAnnotation(): boolean {
        const line = this.stringStream.getCurrentLine();
        const offset = this.stringStream.getCurrentOffset();
        // current offset point to '

        // check if the next character is a valid identifier start
        if (offset + 1 >= line.length) {
            return false;
        }

        const nextChar = line[offset + 1];
        if (!isIdentStart(nextChar)) {
            return false;
        }

        // check if the following characters are valid identifier characters
        let i = offset + 2;
        for (; i < line.length; i++) {
            const char = line[i];
            if (!isIdentPart(char)) {
                break;
            }
        }

        // finally, the next character must be a '
        // first check if we are consume all the char in the current line
        // if we are a char, the ' must be on the same line, so we must not exceed the line
        // otherwise, we must be a lifetime annotation
        if (i >= line.length) {
            return true;
        }
        return line[i] !== "'";
    }

    // return except the first r
    getRawStringHead(): string {
        const line = this.stringStream.getCurrentLine();
        const offset = this.stringStream.getCurrentOffset();

        // return line.slice(offset, offset + 2) === 'r"' ||
        //     line.slice(offset, offset + 3) === 'r#"' ||
        //     line.slice(offset, offset + 4) === 'r##"';
        if (line[offset] !== "r") {
            return "";
        }

        // continue count the number of #
        let i = offset + 1;
        for (; i < line.length; i++) {
            if (line[i] !== "#") {
                break;
            }
        }

        // now i point to the first non-# character
        if (i < line.length && line[i] === '"') {
            return line.slice(offset + 1, i + 1);
        }
        return "";
    }

    // A raw string literal in Rust is written with the prefix r (optionally followed by #s):
    // r"..." or r#"..."# or r##"..."##, etc.
    isRawStringHead(): boolean {
        return this.getRawStringHead().length > 0;
    }

    skipRawString(): void {
        // determine the raw string head is r" or r#"
        // const line = this.stringStream.getCurrentLine();
        // const offset = this.stringStream.getCurrentOffset();
        const delimiter = this.getRawStringHead();

        // raw string: r"..." or r#"...#", then delimeter either be " or #"
        // example: let quotes = r#"And then I said: "There is no escape!""#;
        // offset -> r, but r should not count as a part of raw string
        // const delimiter = line.slice(offset + 1, offset + 1 + delimiterLength);
        this.skipUntilFindDelimiter({
            firstSkipLength: 1 + delimiter.length,
            delimiter: delimiter.split("").reverse().join(""), // reverse the delimiter for rust
            lineClass: LineClass.Code,
        });
    }

}