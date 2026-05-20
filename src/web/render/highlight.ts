// Shiki wrapper — lazy-loads grammars on demand to keep initial bundle small.
import { type Highlighter, createHighlighter, type BundledLanguage, bundledLanguages } from "shiki";

import { PANEL_BG_HEX } from "./colors";

export type Token = { content: string; color: string };
export type TokenLine = Token[];

// Subset registered eagerly. Others lazy-load via loadLanguage().
const INITIAL_LANGS: BundledLanguage[] = ["python", "javascript", "typescript"];

const SHIKI_THEME = "one-dark-pro";
const DEFAULT_FG = "#cdd6f4";

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>(INITIAL_LANGS);

const getHighlighter = async (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEME],
      langs: INITIAL_LANGS,
    });
  }
  return highlighterPromise;
};

const SUPPORTED_LANGS = new Set(Object.keys(bundledLanguages));

const normalizeLang = (lang: string): string => {
  const l = lang.toLowerCase().trim();
  if (l === "auto" || l === "" || l === "text") return "text";
  // Common aliases
  const aliases: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    sh: "bash",
    shell: "bash",
    yml: "yaml",
    md: "markdown",
    "c++": "cpp",
    "c#": "csharp",
  };
  const resolved = aliases[l] ?? l;
  return SUPPORTED_LANGS.has(resolved) ? resolved : "text";
};

export const ensureLanguage = async (lang: string): Promise<string> => {
  const normalized = normalizeLang(lang);
  if (normalized === "text" || loadedLangs.has(normalized)) return normalized;
  const h = await getHighlighter();
  await h.loadLanguage(normalized as BundledLanguage);
  loadedLangs.add(normalized);
  return normalized;
};

export const tokenize = async (code: string, lang: string): Promise<TokenLine[]> => {
  const h = await getHighlighter();
  const normalized = await ensureLanguage(lang);
  if (normalized === "text") {
    return code.split("\n").map((line) => [{ content: line, color: DEFAULT_FG }]);
  }
  const result = h.codeToTokens(code, {
    lang: normalized as BundledLanguage,
    theme: SHIKI_THEME,
  });
  return result.tokens.map((line) =>
    line.map((t) => ({ content: t.content, color: t.color ?? DEFAULT_FG }))
  );
};

export const themePanelBg = PANEL_BG_HEX;
