// Pure helpers for loading persisted compositions. Kept free of DOM and
// app imports so they can run under `node --test`.

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// Persisted colors are interpolated into SVG markup and inline styles, so
// anything that isn't a plain hex color (e.g. a tampered localStorage
// value) falls back instead of reaching the DOM.
export const safeHex = (v: unknown, fallback: string): string =>
  typeof v === "string" && HEX_COLOR.test(v) ? v : fallback;

type ArrowSpecLike = { style?: unknown; color?: unknown };

export const sanitizeArrows = <T extends ArrowSpecLike>(arrows: unknown): Record<string, T> => {
  const out: Record<string, T> = {};
  if (!arrows || typeof arrows !== "object") return out;
  for (const [id, spec] of Object.entries(arrows as Record<string, ArrowSpecLike>)) {
    if (!spec || typeof spec !== "object") continue;
    const clean: ArrowSpecLike = { ...spec };
    if (clean.color !== undefined && !(typeof clean.color === "string" && HEX_COLOR.test(clean.color))) {
      delete clean.color;
    }
    out[id] = clean as T;
  }
  return out;
};

// Decode a data: URL without fetch(). The CSP's connect-src doesn't allow
// data:, so fetch(dataUrl) is blocked in production.
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) throw new Error("not a data URL");
  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const params = meta.split(";");
  const mime = params[0] || "text/plain";
  const bytes = params.includes("base64")
    ? Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mime });
};
