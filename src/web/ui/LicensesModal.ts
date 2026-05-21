// Open-source licenses modal — bundles THIRD_PARTY_LICENSES.md as raw
// text and shows it in a scrollable <dialog>. The file ships at repo
// root and is included via Vite's ?raw query.
import licensesText from "../../../THIRD_PARTY_LICENSES.md?raw";
import { x as xIcon } from "./icons";

export type LicensesModalHandle = {
  open: () => void;
};

export const mountLicensesModal = (): LicensesModalHandle => {
  const dlg = document.createElement("dialog");
  dlg.className = "licenses-modal";

  const header = document.createElement("div");
  header.className = "licenses-modal-header";
  const title = document.createElement("h2");
  title.textContent = "Open-source licenses";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.title = "Close";
  closeBtn.appendChild(xIcon());
  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "licenses-modal-body";
  const pre = document.createElement("pre");
  pre.className = "licenses-modal-text";
  pre.textContent = licensesText;
  body.appendChild(pre);

  dlg.append(header, body);
  closeBtn.addEventListener("click", () => dlg.close());
  // Click on the backdrop (the dialog element itself, not its children).
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  document.body.appendChild(dlg);

  return {
    open() {
      body.scrollTop = 0;
      dlg.showModal();
    },
  };
};
