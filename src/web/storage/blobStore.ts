// IndexedDB-backed image blob store. localStorage caps at ~5MB per
// origin, which animated GIFs/WEBPs blow through immediately. We keep
// the composition shape in localStorage (compressed JSON) but stash
// image bytes here, addressed by blobId.
//
// Single database, single object store with `id` as the keyPath.

const DB_NAME = "stackshot";
const DB_VERSION = 1;
const STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  return dbPromise;
};

const tx = async <T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    if (result instanceof IDBRequest) {
      result.onsuccess = () => resolve(result.result as T);
      result.onerror = () => reject(result.error);
    } else {
      result.then(resolve, reject);
    }
    t.onerror = () => reject(t.error);
  });
};

let idCounter = 0;
export const nextBlobId = (): string => `b${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export const putBlob = async (id: string, blob: Blob): Promise<void> => {
  await tx("readwrite", (s) => s.put({ id, blob, mime: blob.type, size: blob.size }));
};

export const getBlob = async (id: string): Promise<Blob | undefined> => {
  const record = await tx<{ id: string; blob: Blob } | undefined>("readonly", (s) => s.get(id));
  return record?.blob;
};

export const deleteBlob = async (id: string): Promise<void> => {
  await tx("readwrite", (s) => s.delete(id));
};

export const listBlobIds = async (): Promise<string[]> => {
  const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
  return keys.map(String);
};

// Drop any stored blob whose id isn't in `keepIds`. Cheap garbage
// collection — call at save time so removed/replaced images don't leak.
export const gcUnused = async (keepIds: Set<string>): Promise<void> => {
  const all = (await listBlobIds()).map(String);
  for (const id of all) {
    if (!keepIds.has(id)) await deleteBlob(id);
  }
};

// Object URL cache so the render layer doesn't recreate them every
// frame. Caller invalidates by re-calling resolveBlobUrl with a fresh
// id after replace.
const urlCache = new Map<string, string>();

export const resolveBlobUrl = async (id: string): Promise<string | null> => {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
};

export const invalidateBlobUrl = (id: string): void => {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
};
