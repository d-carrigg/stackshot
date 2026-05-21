// Hand-picked Lucide-style icons as inline SVG factories. No external dep
// so we pay zero bundle cost. Stroke-based, scale via CSS font-size by
// setting `width: 1em; height: 1em` on the returned element.
//
// Paths are simplified from lucide.dev (ISC) and edited to inherit
// `currentColor` for fill/stroke so they recolour with the surrounding
// element.

const NS = "http://www.w3.org/2000/svg";

const make = (paths: string, viewBox = "0 0 24 24"): SVGSVGElement => {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = "1em";
  svg.style.height = "1em";
  svg.style.display = "inline-block";
  svg.style.verticalAlign = "-0.125em";
  svg.innerHTML = paths;
  return svg;
};

export const chevronLeft = (): SVGSVGElement => make(`<path d="m15 18-6-6 6-6"/>`);
export const chevronRight = (): SVGSVGElement => make(`<path d="m9 18 6-6-6-6"/>`);
export const trash = (): SVGSVGElement =>
  make(
    `<path d="M3 6h18"/>` +
      `<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>` +
      `<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
  );
export const eye = (): SVGSVGElement =>
  make(`<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/>`);
export const download = (): SVGSVGElement =>
  make(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>`);
export const clipboard = (): SVGSVGElement =>
  make(
    `<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>` +
      `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>`,
  );
export const grid = (): SVGSVGElement =>
  make(`<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>`);
export const rows = (): SVGSVGElement =>
  make(`<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="18" height="7" x="3" y="14" rx="1"/>`);
export const columns = (): SVGSVGElement =>
  make(`<rect width="7" height="18" x="3" y="3" rx="1"/><rect width="7" height="18" x="14" y="3" rx="1"/>`);
export const code = (): SVGSVGElement =>
  make(`<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>`);
export const image = (): SVGSVGElement =>
  make(`<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.586-4.586a2 2 0 0 0-2.828 0L3 21"/>`);
export const refresh = (): SVGSVGElement =>
  make(`<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>`);
export const x = (): SVGSVGElement =>
  make(`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`);
export const plus = (): SVGSVGElement =>
  make(`<path d="M5 12h14"/><path d="M12 5v14"/>`);
export const github = (): SVGSVGElement =>
  make(
    `<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>`,
  );
