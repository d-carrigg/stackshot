// Auto-persist the composition to localStorage so refreshes don't lose
// work. Image blob bytes live in IndexedDB (see ./storage/blobStore);
// localStorage just holds the composition shape with blobId refs.
//
// Schema v1 inlined image data: URLs straight into the JSON. That blew
// past the ~5MB localStorage quota the moment users added an animated
// GIF. v2 moves bytes to IndexedDB and only persists the blobId.
import LZString from "lz-string";
import type { Composition, ImagePanel, Panel } from "./state";
import { putBlob, resolveBlobUrl, nextBlobId, gcUnused } from "./storage/blobStore";

const KEY_V2 = "stackshot.composition.v2";
const KEY_V1 = "stackshot.composition.v1";

// What actually lands in localStorage: composition minus selectedId,
// and image panels minus `src` (which is an in-memory object URL and
// regenerated on load).
type PersistedImagePanel = Omit<ImagePanel, "src"> & { src?: never };
type PersistedPanel = Exclude<Panel, ImagePanel> | PersistedImagePanel;
type Persisted = Omit<Composition, "selectedId" | "panels"> & { panels: PersistedPanel[] };

const toPersisted = (c: Composition): Persisted => {
  const { selectedId: _ignored, ...rest } = c;
  return {
    ...rest,
    panels: c.panels.map((p) => {
      if (p.kind !== "image") return p;
      const { src: _src, ...img } = p;
      return img as PersistedImagePanel;
    }),
  };
};

export const save = (c: Composition): void => {
  try {
    const json = JSON.stringify(toPersisted(c));
    localStorage.setItem(KEY_V2, LZString.compressToUTF16(json));
    // GC orphaned blobs — fire-and-forget so save stays sync.
    const keep = new Set<string>();
    for (const p of c.panels) {
      if (p.kind === "image" && p.blobId) keep.add(p.blobId);
    }
    gcUnused(keep).catch(() => undefined);
  } catch {
    // Quota or private mode — silently drop; the live composition is
    // still in memory and Export works fine.
  }
};

const hydrateImagePanel = async (p: PersistedImagePanel): Promise<ImagePanel> => {
  let url = "";
  if (p.blobId) {
    const resolved = await resolveBlobUrl(p.blobId);
    if (resolved) url = resolved;
  }
  return { ...(p as Omit<ImagePanel, "src">), src: url };
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return res.blob();
};

const migrateV1 = async (parsed: any): Promise<Composition> => {
  const panels: Panel[] = [];
  for (const p of parsed.panels ?? []) {
    if (p.kind === "image" && typeof p.src === "string" && p.src.startsWith("data:")) {
      try {
        const blob = await dataUrlToBlob(p.src);
        const blobId = nextBlobId();
        await putBlob(blobId, blob);
        const url = (await resolveBlobUrl(blobId)) ?? "";
        panels.push({
          ...p,
          blobId,
          mime: blob.type,
          animated: false,
          src: url,
        });
      } catch {
        // Drop unreadable images rather than failing the whole load.
      }
    } else {
      panels.push(p as Panel);
    }
  }
  return {
    panels,
    layout: parsed.layout ?? "vertical",
    bgColor: parsed.bgColor,
    arrowColor: parsed.arrowColor,
    scale: parsed.scale ?? 2.0,
    gridRows: parsed.gridRows ?? 2,
    gridCols: parsed.gridCols ?? 2,
    exportFormat: parsed.exportFormat ?? "auto",
    selectedId: panels[0]?.id ?? null,
  };
};

export const load = async (): Promise<Composition | null> => {
  try {
    const v2raw = localStorage.getItem(KEY_V2);
    if (v2raw) {
      const json = LZString.decompressFromUTF16(v2raw);
      if (!json) return null;
      const parsed = JSON.parse(json) as Persisted;
      const panels: Panel[] = await Promise.all(
        parsed.panels.map(async (p) => {
          if (p.kind === "image") return hydrateImagePanel(p);
          return p as Panel;
        }),
      );
      return {
        ...parsed,
        panels,
        gridRows: parsed.gridRows ?? 2,
        gridCols: parsed.gridCols ?? 2,
        exportFormat: parsed.exportFormat ?? "auto",
        selectedId: panels[0]?.id ?? null,
      };
    }
    const v1raw = localStorage.getItem(KEY_V1);
    if (v1raw) {
      const json = LZString.decompressFromUTF16(v1raw);
      if (!json) return null;
      const migrated = await migrateV1(JSON.parse(json));
      // Write through to v2 so we don't migrate every load.
      save(migrated);
      localStorage.removeItem(KEY_V1);
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
};

export const clearPersisted = (): void => {
  try {
    localStorage.removeItem(KEY_V1);
    localStorage.removeItem(KEY_V2);
  } catch {
    // ignore
  }
};
