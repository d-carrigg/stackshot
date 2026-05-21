// Code editor: a textarea overlaid on a Shiki-highlighted <pre>. Both use
// identical font metrics, so the textarea caret/selection align with the
// rendered tokens. Textarea text is transparent; its caret is visible.
//
// We re-tokenize on input (debounced to next animation frame) and keep
// scroll positions in sync.
import { tokenize } from "../render/highlight";
import { PANEL_BG_HEX } from "../render/colors";

const FONT = '14px "DejaVu Sans Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const LINE_HEIGHT = "1.5";
const PADDING = "12px";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type CodeEditorHandle = {
  root: HTMLElement;
  setCode: (code: string) => void;
  setLanguage: (lang: string) => void;
  focus: () => void;
  destroy: () => void;
};

export const createCodeEditor = (opts: {
  initialCode: string;
  initialLanguage: string;
  onChange: (code: string) => void;
}): CodeEditorHandle => {
  const root = document.createElement("div");
  root.className = "code-editor";
  root.innerHTML = `
    <pre class="hl" aria-hidden="true"><code></code></pre>
    <textarea spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>
  `;

  const pre = root.querySelector<HTMLPreElement>("pre.hl")!;
  const code = pre.querySelector<HTMLElement>("code")!;
  const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;

  // Identical font metrics on both layers.
  const shared = `font: ${FONT}; line-height: ${LINE_HEIGHT}; padding: ${PADDING}; tab-size: 4; white-space: pre; word-wrap: normal;`;
  pre.style.cssText = `${shared} margin: 0; color: #cdd6f4; background: ${PANEL_BG_HEX}; border-radius: 12px; overflow: auto; pointer-events: none;`;
  ta.style.cssText = `${shared} position: absolute; inset: 0; margin: 0; background: transparent; color: transparent; caret-color: #cdd6f4; border: 0; outline: none; resize: none; overflow: auto; white-space: pre; -webkit-text-fill-color: transparent;`;

  root.style.cssText = "position: relative; min-width: 280px; min-height: 80px;";

  let language = opts.initialLanguage;
  let scheduled = false;

  const rerender = async () => {
    scheduled = false;
    const text = ta.value;
    try {
      const lines = await tokenize(text, language);
      const html = lines
        .map((line) => {
          if (line.length === 0) return "<span></span>";
          return line
            .map((t) => `<span style="color:${t.color}">${escapeHtml(t.content)}</span>`)
            .join("");
        })
        .join("\n");
      code.innerHTML = html + "\n"; // trailing line so the last empty line gets height
    } catch {
      code.textContent = text;
    }
    autoSize();
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(rerender);
  };

  const autoSize = () => {
    // Grow textarea + pre to fit content so the card expands naturally.
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
    pre.style.height = ta.style.height;
  };

  ta.addEventListener("input", () => {
    opts.onChange(ta.value);
    schedule();
  });
  // Tab inserts 4 spaces.
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const insert = "    ";
      ta.setRangeText(insert, start, end, "end");
      opts.onChange(ta.value);
      schedule();
    }
  });
  // Sync horizontal scroll on the highlighted layer.
  ta.addEventListener("scroll", () => {
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  });

  ta.value = opts.initialCode;
  schedule();
  // Initial sizing needs to wait for the element to be in the DOM.
  queueMicrotask(autoSize);

  return {
    root,
    setCode(c) {
      if (ta.value !== c) {
        ta.value = c;
        schedule();
      }
    },
    setLanguage(l) {
      if (language !== l) {
        language = l;
        schedule();
      }
    },
    focus() {
      ta.focus();
    },
    destroy() {
      // listeners are GC'd with the element
    },
  };
};
