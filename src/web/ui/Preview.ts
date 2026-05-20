import type { Store } from "../state";
import { composeCanvas } from "../render/compose";
import { debounce } from "./util";

export const mountPreview = (root: HTMLElement, store: Store): void => {
  root.innerHTML = "";
  let token = 0;

  const render = async () => {
    const current = ++token;
    try {
      const canvas = await composeCanvas(store.get());
      if (current !== token) return; // stale
      root.classList.remove("error");
      root.innerHTML = "";
      root.appendChild(canvas);
    } catch (e) {
      if (current !== token) return;
      root.classList.add("error");
      root.textContent = `Render error: ${(e as Error).message}`;
    }
  };

  const debounced = debounce(render, 120);
  render();
  store.subscribe(debounced);
};
