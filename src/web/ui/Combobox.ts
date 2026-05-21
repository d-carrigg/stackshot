// Flat combobox: text input that filters a themed dropdown of string
// options. Used for the per-panel language picker — the native <select>
// dropdown didn't follow our theme and password managers latched onto
// it. Typing filters case-insensitively; arrow keys / Enter / Esc work
// as expected. The value commits on selection (click or Enter); blurring
// without a match reverts to the last committed value.

export type ComboboxHandle = {
  root: HTMLElement;
  setValue: (v: string) => void;
  setOptions: (opts: string[]) => void;
  getValue: () => string;
};

export type ComboboxOptions = {
  value: string;
  options: string[];
  placeholder?: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
};

export const createCombobox = (opts: ComboboxOptions): ComboboxHandle => {
  const root = document.createElement("div");
  root.className = "combobox";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "combobox-input";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("data-form-type", "other");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-lpignore", "true");
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.ariaLabel) input.setAttribute("aria-label", opts.ariaLabel);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "combobox-toggle";
  toggle.setAttribute("aria-label", "Toggle options");
  toggle.tabIndex = -1;
  toggle.innerHTML = `<svg viewBox="0 0 12 12" aria-hidden="true" width="10" height="10"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const list = document.createElement("ul");
  list.className = "combobox-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  root.append(input, toggle, list);

  let allOptions = [...opts.options];
  let committed = opts.value;
  let highlightIdx = -1;
  let visible: string[] = [];

  const renderList = (filter: string): void => {
    const q = filter.trim().toLowerCase();
    visible = q ? allOptions.filter((o) => o.toLowerCase().includes(q)) : allOptions.slice();
    list.innerHTML = "";
    if (visible.length === 0) {
      const empty = document.createElement("li");
      empty.className = "combobox-empty";
      empty.textContent = "No matches";
      list.appendChild(empty);
      highlightIdx = -1;
      return;
    }
    visible.forEach((opt, i) => {
      const li = document.createElement("li");
      li.className = "combobox-option";
      li.setAttribute("role", "option");
      li.dataset.value = opt;
      li.textContent = opt;
      if (opt === committed) li.classList.add("selected");
      li.addEventListener("mousedown", (e) => {
        // mousedown (not click) so we commit before the input blurs and
        // wipes the selection.
        e.preventDefault();
        commit(opt);
      });
      li.addEventListener("mouseenter", () => setHighlight(i));
      list.appendChild(li);
    });
    // Highlight the committed value if visible, otherwise the first row.
    const idx = visible.indexOf(committed);
    setHighlight(idx >= 0 ? idx : 0);
  };

  const setHighlight = (i: number): void => {
    highlightIdx = i;
    const lis = list.querySelectorAll<HTMLLIElement>(".combobox-option");
    lis.forEach((el, idx) => el.classList.toggle("active", idx === highlightIdx));
    const cur = lis[highlightIdx];
    if (cur) cur.scrollIntoView({ block: "nearest" });
  };

  const open = (): void => {
    if (!list.hidden) return;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    renderList(input.value === committed ? "" : input.value);
  };
  const close = (revert: boolean): void => {
    if (list.hidden) return;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    if (revert) input.value = committed;
  };

  const commit = (val: string): void => {
    if (!allOptions.includes(val)) return;
    committed = val;
    input.value = val;
    close(false);
    opts.onChange(val);
  };

  input.value = committed;

  input.addEventListener("focus", () => {
    input.select();
    open();
  });
  input.addEventListener("input", () => {
    open();
    renderList(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.hidden) open();
      if (visible.length) setHighlight((highlightIdx + 1) % visible.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) open();
      if (visible.length) setHighlight((highlightIdx - 1 + visible.length) % visible.length);
    } else if (e.key === "Enter") {
      const pick = highlightIdx >= 0 ? visible[highlightIdx] : undefined;
      if (!list.hidden && pick) {
        e.preventDefault();
        commit(pick);
      } else if (allOptions.includes(input.value)) {
        e.preventDefault();
        commit(input.value);
      }
    } else if (e.key === "Escape") {
      if (!list.hidden) {
        e.preventDefault();
        close(true);
      }
    } else if (e.key === "Tab") {
      // On Tab, if the highlighted row exactly matches what the user
      // typed (or they typed an exact option), commit it. Otherwise just
      // revert so focus moves on without a half-edited value.
      if (allOptions.includes(input.value)) {
        commit(input.value);
      } else {
        close(true);
      }
    }
  });
  input.addEventListener("blur", () => {
    // Mousedown on a list option commits before blur fires; if the user
    // tabbed/clicked away without selecting, revert.
    if (input.value !== committed) close(true);
    else close(false);
  });
  toggle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (list.hidden) {
      input.focus();
      open();
    } else {
      close(false);
    }
  });

  return {
    root,
    setValue(v) {
      committed = v;
      input.value = v;
    },
    setOptions(o) {
      allOptions = [...o];
      if (!list.hidden) renderList(input.value);
    },
    getValue() {
      return committed;
    },
  };
};
