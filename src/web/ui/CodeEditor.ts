// Code editor: a textarea overlaid on a Shiki-highlighted <pre>. Both use
// identical font metrics, so the textarea caret/selection align with the
// rendered tokens. Textarea text is transparent; its caret is visible.
//
// We re-tokenize on input (debounced to next animation frame) and keep
// scroll positions in sync.
import { tokenize } from "../render/highlight";
import type { Theme } from "../themes";

const FONT = '14px "DejaVu Sans Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const LINE_HEIGHT = "1.5";
const PADDING = "12px";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type CodeEditorHandle = {
  root: HTMLElement;
  setCode: (code: string) => void;
  setLanguage: (lang: string) => void;
  setTheme: (t: Theme) => void;
  setLineNumbers: (on: boolean) => void;
  focus: () => void;
  destroy: () => void;
};

export const createCodeEditor = (opts: {
  initialCode: string;
  initialLanguage: string;
  theme: Theme;
  lineNumbers?: boolean;
  onChange: (code: string) => void;
}): CodeEditorHandle => {
  const root = document.createElement("div");
  root.className = "code-editor";
  root.innerHTML = `
    <div class="ln-gutter" aria-hidden="true"></div>
    <pre class="hl" aria-hidden="true"><code></code></pre>
    <textarea spellcheck="false" data-form-type="other" autocorrect="off" autocapitalize="off"></textarea>
  `;

  const gutter = root.querySelector<HTMLDivElement>(".ln-gutter")!;
  const pre = root.querySelector<HTMLPreElement>("pre.hl")!;
  const code = pre.querySelector<HTMLElement>("code")!;
  const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;

  let lineNumbers = !!opts.lineNumbers;

  // Identical font metrics on both layers.
  const shared = `font: ${FONT}; line-height: ${LINE_HEIGHT}; padding: ${PADDING}; tab-size: 4; white-space: pre; word-wrap: normal;`;
  let theme = opts.theme;
  const applyThemeStyles = () => {
    pre.style.cssText = `${shared} margin: 0; color: ${theme.title}; background: ${theme.panelBg}; border-radius: 12px; overflow: auto; pointer-events: none;`;
    ta.style.cssText = `${shared} position: absolute; inset: 0; margin: 0; background: transparent; color: transparent; caret-color: ${theme.title}; border: 0; outline: none; resize: none; overflow: auto; white-space: pre; -webkit-text-fill-color: transparent;`;
    // Gutter shares the vertical metrics; it sits in the left padding band
    // and right-aligns its numbers against the code column.
    gutter.style.cssText =
      `font: ${FONT}; line-height: ${LINE_HEIGHT}; padding: ${PADDING} 8px ${PADDING} ${PADDING};` +
      ` position: absolute; left: 0; top: 0; bottom: 0; margin: 0; text-align: right;` +
      ` color: ${theme.chromeMuted}; background: transparent; pointer-events: none;` +
      ` white-space: pre; overflow: hidden; box-sizing: border-box; border-radius: 12px 0 0 12px;`;
    applyGutter();
  };

  // Show/size the gutter and shift the code layers right to make room.
  const applyGutter = () => {
    if (!lineNumbers) {
      gutter.style.display = "none";
      pre.style.paddingLeft = PADDING;
      ta.style.paddingLeft = PADDING;
      return;
    }
    gutter.style.display = "block";
    const count = Math.max(1, ta.value.split("\n").length);
    let nums = "";
    for (let i = 1; i <= count; i++) nums += (i > 1 ? "\n" : "") + i;
    gutter.textContent = nums;
    const w = gutter.offsetWidth;
    pre.style.paddingLeft = `${w}px`;
    ta.style.paddingLeft = `${w}px`;
  };

  applyThemeStyles();

  root.style.cssText = "position: relative; min-width: 280px; min-height: 80px;";

  let language = opts.initialLanguage;
  let scheduled = false;

  const rerender = async () => {
    scheduled = false;
    const text = ta.value;
    try {
      const lines = await tokenize(text, language, theme.syntax);
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
    applyGutter();
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
    gutter.scrollTop = ta.scrollTop;
  });
  // Block the browser's native "drop text/file into textarea" behaviour
  // so dragging a file over a code panel doesn't show a caret-insert
  // indicator and doesn't replace the editor's contents on drop. The
  // global drop handler still picks the file up.
  //
  // Panel-reorder drags (text/x-panel-id) must bubble to the card's
  // drop handler, and file drags must reach the global drop handler
  // (which replaces this code panel with the dropped image) — otherwise
  // setting dropEffect="none" here suppresses the drop entirely. We only
  // block plain text drags so they don't insert into the textarea.
  const isPanelDrag = (e: DragEvent): boolean =>
    !!e.dataTransfer?.types.includes("text/x-panel-id");
  const isFileDrag = (e: DragEvent): boolean => {
    const t = e.dataTransfer?.types;
    return !!t && (Array.from(t).includes("Files") || Array.from(t).includes("application/x-moz-file"));
  };
  const blockDrop = (e: DragEvent) => {
    if (isPanelDrag(e) || isFileDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  };
  ta.addEventListener("dragenter", blockDrop);
  ta.addEventListener("dragover", blockDrop);
  ta.addEventListener("drop", (e) => {
    if (isPanelDrag(e) || isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
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
    setTheme(t) {
      if (theme.id === t.id && theme.syntax === t.syntax && theme.panelBg === t.panelBg) return;
      theme = t;
      applyThemeStyles();
      schedule();
    },
    setLineNumbers(on) {
      if (lineNumbers === on) return;
      lineNumbers = on;
      applyGutter();
    },
    focus() {
      ta.focus();
    },
    destroy() {
      // listeners are GC'd with the element
    },
  };
};
