const STORAGE_PREFIX = "wgdeepinsight-offline";

export function readLocalCollection<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalCollection<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(value));
}

export function appendLocalCollection<T extends { id: string }>(key: string, item: T, fallback: T[] = []) {
  const existing = readLocalCollection<T[]>(key, fallback);
  const next = [item, ...existing.filter((entry) => entry.id !== item.id)];
  writeLocalCollection(key, next);
  return next;
}

export function replaceLocalCollection<T extends { id: string }>(key: string, items: T[]) {
  writeLocalCollection(key, items);
  return items;
}
