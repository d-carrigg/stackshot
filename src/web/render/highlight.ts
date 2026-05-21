// Shiki wrapper — uses shiki/core with an explicit per-language dynamic
// import map and the JS regex engine. This is the only way to keep Vite
// from emitting chunks for every grammar Shiki ships (the default `shiki`
// package pulls in ~200 grammars + a 600KB wasm engine through its
// internal `bundledLanguages` map). With this setup the initial bundle
// stays small, only the curated language list below is shippable at all,
// and each one is fetched on first use.
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import oneDarkPro from "shiki/themes/one-dark-pro.mjs";
import githubLight from "shiki/themes/github-light.mjs";

import type { SyntaxThemeId } from "../themes";

export type Token = { content: string; color: string };
export type TokenLine = Token[];

const DEFAULT_FG_FOR: Record<SyntaxThemeId, string> = {
  "one-dark-pro": "#cdd6f4",
  "github-light": "#1e1e2e",
};

// Curated language set. Each entry is a dynamic import so Vite emits one
// small chunk per grammar, fetched only when first requested. Keep in
// sync with languageOptions() in ui/util.ts.
const LANG_LOADERS: Record<string, () => Promise<unknown>> = {
  python:     () => import("shiki/langs/python.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx:        () => import("shiki/langs/tsx.mjs"),
  jsx:        () => import("shiki/langs/jsx.mjs"),
  rust:       () => import("shiki/langs/rust.mjs"),
  go:         () => import("shiki/langs/go.mjs"),
  java:       () => import("shiki/langs/java.mjs"),
  c:          () => import("shiki/langs/c.mjs"),
  cpp:        () => import("shiki/langs/cpp.mjs"),
  csharp:     () => import("shiki/langs/csharp.mjs"),
  ruby:       () => import("shiki/langs/ruby.mjs"),
  php:        () => import("shiki/langs/php.mjs"),
  swift:      () => import("shiki/langs/swift.mjs"),
  kotlin:     () => import("shiki/langs/kotlin.mjs"),
  scala:      () => import("shiki/langs/scala.mjs"),
  html:       () => import("shiki/langs/html.mjs"),
  css:        () => import("shiki/langs/css.mjs"),
  scss:       () => import("shiki/langs/scss.mjs"),
  json:       () => import("shiki/langs/json.mjs"),
  yaml:       () => import("shiki/langs/yaml.mjs"),
  toml:       () => import("shiki/langs/toml.mjs"),
  xml:        () => import("shiki/langs/xml.mjs"),
  bash:       () => import("shiki/langs/bash.mjs"),
  shell:      () => import("shiki/langs/shellscript.mjs"),
  powershell: () => import("shiki/langs/powershell.mjs"),
  sql:        () => import("shiki/langs/sql.mjs"),
  graphql:    () => import("shiki/langs/graphql.mjs"),
  markdown:   () => import("shiki/langs/markdown.mjs"),
  diff:       () => import("shiki/langs/diff.mjs"),
};

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
};

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();
const inflight = new Map<string, Promise<void>>();

const getHighlighter = async (): Promise<HighlighterCore> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [oneDarkPro, githubLight],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
};

const normalizeLang = (lang: string): string => {
  const l = lang.toLowerCase().trim();
  if (!l || l === "auto" || l === "text") return "text";
  const resolved = ALIASES[l] ?? l;
  return resolved in LANG_LOADERS ? resolved : "text";
};

export const ensureLanguage = async (lang: string): Promise<string> => {
  const normalized = normalizeLang(lang);
  if (normalized === "text" || loadedLangs.has(normalized)) return normalized;
  let pending = inflight.get(normalized);
  if (!pending) {
    pending = (async () => {
      const h = await getHighlighter();
      const mod = (await LANG_LOADERS[normalized]!()) as { default: unknown };
      // shiki's loadLanguage accepts the grammar module's default export.
      await h.loadLanguage(mod.default as Parameters<HighlighterCore["loadLanguage"]>[0]);
      loadedLangs.add(normalized);
    })();
    inflight.set(normalized, pending);
  }
  try {
    await pending;
  } finally {
    inflight.delete(normalized);
  }
  return normalized;
};

export const tokenize = async (
  code: string,
  lang: string,
  theme: SyntaxThemeId = "one-dark-pro",
): Promise<TokenLine[]> => {
  const normalized = await ensureLanguage(lang);
  const fallbackFg = DEFAULT_FG_FOR[theme];
  if (normalized === "text") {
    return code.split("\n").map((line) => [{ content: line, color: fallbackFg }]);
  }
  const h = await getHighlighter();
  const result = h.codeToTokens(code, { lang: normalized, theme });
  return result.tokens.map((line) =>
    line.map((t) => ({ content: t.content, color: t.color ?? fallbackFg }))
  );
};
