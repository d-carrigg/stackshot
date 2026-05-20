import LZString from "lz-string";
import type { Composition } from "./state";

// Strip selectedId before persisting — it's UI state, not composition state.
const stripUiState = (c: Composition) => {
  const { selectedId, ...rest } = c;
  return rest;
};

export const encodeToHash = (c: Composition): string => {
  const json = JSON.stringify(stripUiState(c));
  return LZString.compressToEncodedURIComponent(json);
};

export const decodeFromHash = (hash: string): Composition | null => {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(raw);
    if (!json) return null;
    const parsed = JSON.parse(json) as Omit<Composition, "selectedId">;
    return { ...parsed, selectedId: parsed.panels[0]?.id ?? null };
  } catch {
    return null;
  }
};

export const writeHash = (c: Composition): void => {
  const encoded = encodeToHash(c);
  // Use replaceState to avoid spamming history on every keystroke.
  history.replaceState(null, "", `#${encoded}`);
};
