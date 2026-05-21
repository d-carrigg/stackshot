// Auto-persist the composition to localStorage so refreshes don't lose
// work. localStorage handles image data URLs cleanly (~5-10MB quota per
// origin) whereas the old URL-hash approach choked on screenshots.
import LZString from "lz-string";
import type { Composition } from "./state";

const KEY = "codeimg.composition.v1";

const stripUiState = (c: Composition) => {
  const { selectedId, ...rest } = c;
  return rest;
};

export const save = (c: Composition): void => {
  try {
    const json = JSON.stringify(stripUiState(c));
    localStorage.setItem(KEY, LZString.compressToUTF16(json));
  } catch {
    // Quota or private mode — silently drop; the live composition is
    // still in memory and Export works fine.
  }
};

export const load = (): Composition | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const json = LZString.decompressFromUTF16(raw);
    if (!json) return null;
    const parsed = JSON.parse(json) as Omit<Composition, "selectedId">;
    return { ...parsed, selectedId: parsed.panels[0]?.id ?? null };
  } catch {
    return null;
  }
};

export const clearPersisted = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
