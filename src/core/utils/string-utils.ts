// 2024/7/24
// zhangzhong

export function expectChar(ch: string): void {
  if (ch.length !== 1) { throw new Error("Expected single character"); }
}

export function isSpace(ch: string): boolean {
  // expectChar(ch);
  const code = ch.charCodeAt(0);

  // Fast-path for common ASCII whitespace
  // 32: space, 9: \t, 10: \n, 13: \r, 12: \f, 11: \v
  return (
    code === 32 || // ' '
    code === 9 || // '\t'
    code === 10 || // '\n'
    code === 13 || // '\r'
    code === 12 || // '\f'
    code === 11    // '\v'
  );
}

export function isAlpha(ch: string): boolean {
  // expectChar(ch);
  const code = ch.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) ||   // A–Z
    (code >= 97 && code <= 122)     // a–z
  );
}

export function isDigit(ch: string): boolean {
  // expectChar(ch);
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;    // 0–9
}

export function isAlnum(ch: string): boolean {
  // expectChar(ch);
  return isAlpha(ch) || isDigit(ch);
}

export function isIdentStart(ch: string): boolean {
  // expectChar(ch);
  return isAlpha(ch) || ch === '_';
}

export function isIdentPart(ch: string): boolean {
  // expectChar(ch);
  return isAlnum(ch) || ch === '_';
}