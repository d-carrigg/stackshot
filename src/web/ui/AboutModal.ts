// About dialog — a small modal describing what stackshot is, with links
// to the repo and releases. Static content; no per-session state.
import { x as xIcon, layoutTemplate as logoIcon } from "./icons";

export type AboutModalHandle = {
  open: () => void;
};

export const mountAboutModal = (): AboutModalHandle => {
  const dlg = document.createElement("dialog");
  dlg.className = "app-dialog about-modal";

  const header = document.createElement("div");
  header.className = "about-modal-header";
  const title = document.createElement("h2");
  title.textContent = "About stackshot";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.title = "Close";
  closeBtn.appendChild(xIcon());

  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "about-modal-body";
  const logo = logoIcon();
  logo.classList.add("about-modal-logo");
  body.append(logo);
  body.insertAdjacentHTML(
    "beforeend",
    `
    <p class="about-modal-tagline">Compose code snippets, screenshots, and images into
    multi-panel illustrations — for READMEs, docs, blog posts, and tutorials.</p>
    <p>stackshot runs entirely in your browser; nothing you compose is uploaded
    anywhere. There's also a CLI for scripting and CI.</p>
    <ul class="about-modal-links">
      <li><a href="https://github.com/d-carrigg/stackshot" target="_blank" rel="noreferrer">View on GitHub</a></li>
      <li><a href="https://github.com/d-carrigg/stackshot/releases" target="_blank" rel="noreferrer">Get the CLI / releases</a></li>
    </ul>
    <p class="about-modal-license">MIT licensed.</p>
  `,
  );

  dlg.append(header, body);
  closeBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  document.body.appendChild(dlg);

  return {
    open() {
      dlg.showModal();
    },
  };
};
