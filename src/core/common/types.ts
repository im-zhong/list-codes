// 2024/7/22
// zhangzhong

import { SupportedLanguage } from "./supported-languages";

export enum LineClass {
  Blank,
  Code,
  LineComment,
  BlockComment,
  Comment,
  CodeComment,
}

export interface FileKey {
  workspacePath: string;
  language: SupportedLanguage;
  absolutePath: string;
}

export interface FileResult {
  lines: number;
  codes: number;
  comments: number;
  lineClasses: LineClass[];
}

export type FolderResult = {
  [absolutePath: string]: FileResult;
};

// The [key in SupportedLanguage]?: FolderResult; syntax is an index signature that indicates
// every key of the WorkspaceResult object must be a member of the SupportedLanguage enum,
// and its value must be of type FolderResult
// but this method does not work either, cause type script think a value of a enum key maybe undefined
//
// because the underlying type of enum is string, so we use the string as the key
export type WorkspaceResult = {
  // [key in SupportedLanguage]?: FolderResult;
  [language: string]: FolderResult;
};
