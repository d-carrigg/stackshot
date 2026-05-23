// Open-source licenses modal — bundles THIRD_PARTY_LICENSES.md (CLI /
// Python distribution) and THIRD_PARTY_LICENSES_WEB.md (web bundle)
// as raw text, renders them as HTML, and shows the two sections in a
// scrollable <dialog> with a small tab switcher.
import cliLicenses from "../../../THIRD_PARTY_LICENSES.md?raw";
import webLicenses from "../../../THIRD_PARTY_LICENSES_WEB.md?raw";
import { renderMarkdown } from "./markdownLite";
import { x as xIcon } from "./icons";

export type LicensesModalHandle = {
  open: () => void;
};

type Tab = { id: string; label: string; markdown: string };

const TABS: Tab[] = [
  { id: "web", label: "Web app", markdown: webLicenses },
  { id: "cli", label: "CLI / binaries", markdown: cliLicenses },
];

// Cache rendered HTML so we only parse once per session.
const renderedCache = new Map<string, string>();

export const mountLicensesModal = (): LicensesModalHandle => {
  const dlg = document.createElement("dialog");
  dlg.className = "licenses-modal";
  dlg.setAttribute("aria-labelledby", "licenses-modal-title");

  const header = document.createElement("div");
  header.className = "licenses-modal-header";
  const title = document.createElement("h2");
  title.id = "licenses-modal-title";
  title.textContent = "Open-source licenses";

  const tabsEl = document.createElement("div");
  tabsEl.className = "licenses-modal-tabs";
  tabsEl.setAttribute("role", "tablist");
  const tabButtons: HTMLButtonElement[] = [];
  for (const tab of TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "licenses-modal-tab";
    btn.dataset.tabId = tab.id;
    btn.textContent = tab.label;
    btn.setAttribute("role", "tab");
    btn.id = `licenses-tab-${tab.id}`;
    btn.setAttribute("aria-controls", "licenses-modal-panel");
    tabsEl.appendChild(btn);
    tabButtons.push(btn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.title = "Close";
  closeBtn.appendChild(xIcon());

  header.append(title, tabsEl, closeBtn);

  const body = document.createElement("div");
  body.className = "licenses-modal-body markdown-body";
  body.id = "licenses-modal-panel";
  body.setAttribute("role", "tabpanel");
  body.tabIndex = 0;

  const renderTab = (id: string) => {
    const tab = TABS.find((t) => t.id === id) ?? TABS[0]!;
    let html = renderedCache.get(tab.id);
    if (html === undefined) {
      html = renderMarkdown(tab.markdown);
      renderedCache.set(tab.id, html);
    }
    body.innerHTML = html;
    body.scrollTop = 0;
    body.setAttribute("aria-labelledby", `licenses-tab-${tab.id}`);
    for (const b of tabButtons) {
      const active = b.dataset.tabId === tab.id;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    }
  };
  for (const b of tabButtons) {
    b.addEventListener("click", () => renderTab(b.dataset.tabId!));
  }

  dlg.append(header, body);
  closeBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  document.body.appendChild(dlg);

  return {
    open() {
      renderTab(TABS[0]!.id);
      dlg.showModal();
    },
  };
};
