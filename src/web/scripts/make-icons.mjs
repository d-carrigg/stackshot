// One-off PWA icon generator. Produces 192/512/512-maskable PNGs from
// an inline SVG. Run with `node scripts/make-icons.mjs` (from src/web).
// The output PNGs are tiny and committed alongside this script.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "public", "icons");
await mkdir(out, { recursive: true });

const ICON_BG = "#1e1e2e";
const ICON_FG = "#a6e22e";

// Full-bleed icon. Used for the regular (non-maskable) icon and the
// favicon-shaped chrome icon.
const iconSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${ICON_BG}"/>
  <g stroke="${ICON_FG}" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M14 22 L22 30 L14 38"/>
    <path d="M30 42 H50"/>
  </g>
  <g stroke="#89b4fa" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M48 18 L54 18"/>
    <path d="M44 26 L54 26"/>
  </g>
</svg>`;

// Maskable icon: same artwork pulled in to the safe zone (per
// w3.org/TR/appmanifest/#icon-masks).
const maskableSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${ICON_BG}"/>
  <g stroke="${ICON_FG}" stroke-width="4" stroke-linecap="round" fill="none" transform="translate(8 8) scale(0.75)">
    <path d="M14 22 L22 30 L14 38"/>
    <path d="M30 42 H50"/>
  </g>
  <g stroke="#89b4fa" stroke-width="2.5" stroke-linecap="round" fill="none" transform="translate(8 8) scale(0.75)">
    <path d="M48 18 L54 18"/>
    <path d="M44 26 L54 26"/>
  </g>
</svg>`;

const render = async (svg, size, filename) => {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(resolve(out, filename), buf);
  console.log(`wrote ${filename} (${buf.length} bytes)`);
};

await render(iconSvg(192), 192, "icon-192.png");
await render(iconSvg(512), 512, "icon-512.png");
await render(maskableSvg(512), 512, "icon-maskable-512.png");
