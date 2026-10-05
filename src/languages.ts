import { basename } from "node:path";
import { getLanguageSuffixes, SupportedLanguage } from "./core/common/supported-languages";

export const languages: readonly SupportedLanguage[] = Object.values(SupportedLanguage);
export type Language = SupportedLanguage;

export function languageForPath(path: string): Language | undefined {
  const name = basename(path).toLowerCase();
  for (const language of languages) {
    const suffixes = getLanguageSuffixes({ language });
    if (suffixes.some((suffix) => name.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`))) {
      return language;
    }
  }

  // These variants use the copied TypeScript and C++ analyzers.
  if (name.endsWith(".cts") || name.endsWith(".cjs")) return SupportedLanguage.TYPE_SCRIPT;
  if (name.endsWith(".cuh")) return SupportedLanguage.CPP;
  return undefined;
}
