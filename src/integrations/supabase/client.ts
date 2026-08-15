const APP_STORAGE_PREFIX = "wgdeepinsight-local";

type QueryResult<T> = { data: T | null; error: Error | null };

type QueryBuilder<T> = {
  select: (columns?: string) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  maybeSingle: () => Promise<QueryResult<T | null>>;
  single: () => Promise<QueryResult<T | null>>;
  insert: (rows: T | T[]) => Promise<QueryResult<T | T[] | null>>;
  update: (row: Partial<T>) => Promise<QueryResult<T | null>>;
  delete: () => Promise<QueryResult<T | null>>;
};

function readCollection<T>(table: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(`${APP_STORAGE_PREFIX}:${table}`);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCollection<T>(table: string, rows: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${APP_STORAGE_PREFIX}:${table}`, JSON.stringify(rows));
}

function createQuery<T>(table: string, collection: T[] = readCollection<T>(table)): QueryBuilder<T> {
  const state = { collection: [...collection], filters: new Map<string, unknown>(), orderBy: null as null | { column: string; ascending: boolean }, limitCount: null as number | null };

  const applyFilters = () => {
    let filtered = [...state.collection];
    for (const [column, value] of state.filters.entries()) {
      filtered = filtered.filter((row) => {
        const entry = row as Record<string, unknown>;
        return entry[column] === value;
      });
    }
    if (state.orderBy) {
      const { column, ascending } = state.orderBy;
      filtered.sort((a, b) => {
        const left = (a as Record<string, unknown>)[column];
        const right = (b as Record<string, unknown>)[column];
        if (typeof left === "number" && typeof right === "number") {
          return ascending ? left - right : right - left;
        }
        const leftStr = String(left ?? "");
        const rightStr = String(right ?? "");
        return ascending ? leftStr.localeCompare(rightStr) : rightStr.localeCompare(leftStr);
      });
    }
    if (state.limitCount !== null) {
      filtered = filtered.slice(0, state.limitCount);
    }
    return filtered;
  };

  const builder: QueryBuilder<T> = {
    select: () => builder,
    order: (column: string, options?: { ascending?: boolean }) => {
      state.orderBy = { column, ascending: options?.ascending ?? true };
      return builder;
    },
    eq: (column: string, value: unknown) => {
      state.filters.set(column, value);
      return builder;
    },
    limit: (count: number) => {
      state.limitCount = count;
      return builder;
    },
    maybeSingle: async () => {
      const rows = applyFilters();
      return { data: rows[0] ?? null, error: null };
    },
    single: async () => {
      const rows = applyFilters();
      return { data: rows[0] ?? null, error: null };
    },
    insert: async (rows) => {
      const next = Array.isArray(rows) ? rows : [rows];
      const existing = readCollection<T>(table);
      const merged = [
        ...existing,
        ...next.map((row) => ({
          ...(row as Record<string, unknown>),
          id: (row as Record<string, unknown>).id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          created_at: (row as Record<string, unknown>).created_at ?? new Date().toISOString(),
        })),
      ];
      writeCollection(table, merged);
      return { data: Array.isArray(rows) ? merged.slice(-next.length) : merged[merged.length - 1] ?? null, error: null };
    },
    update: async (row) => {
      const rows = applyFilters();
      const updated = rows.map((entry) => ({ ...entry, ...row }));
      const existing = readCollection<T>(table);
      for (const item of updated) {
        const index = existing.findIndex((entry) => JSON.stringify(entry) === JSON.stringify(item));
        if (index >= 0) existing[index] = item;
      }
      writeCollection(table, existing);
      return { data: updated[0] ?? null, error: null };
    },
    delete: async () => {
      const rows = applyFilters();
      const existing = readCollection<T>(table);
      const remaining = existing.filter((entry) => !rows.some((row) => JSON.stringify(row) === JSON.stringify(entry)));
      writeCollection(table, remaining);
      return { data: null, error: null };
    },
  };

  return builder;
}

function createStorageBucket(table: string) {
  return {
    upload: async (path: string, file: Blob | File, _options?: { upsert?: boolean }) => {
      const fileData = await file.text();
      const key = `${APP_STORAGE_PREFIX}:storage:${table}:${path}`;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify({ path, type: file.type, data: fileData }));
      }
      return { error: null, data: { path } };
    },
    createSignedUrl: async (path: string) => {
      if (typeof window === "undefined") return { data: { signedUrl: null }, error: null };
      const raw = window.localStorage.getItem(`${APP_STORAGE_PREFIX}:storage:${table}:${path}`);
      if (!raw) {
        return { data: { signedUrl: null }, error: null };
      }
      try {
        const payload = JSON.parse(raw) as { data: string; type?: string };
        const isDataUri = payload.data.startsWith("data:");
        const url = isDataUri ? payload.data : `data:${payload.type ?? "image/jpeg"};base64,${payload.data}`;
        return { data: { signedUrl: url }, error: null };
      } catch {
        return { data: { signedUrl: null }, error: null };
      }
    },
  };
}

const storage = {
  from: (bucket: string) => createStorageBucket(bucket),
};

const auth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  setSession: async () => ({ data: { session: null }, error: null }),
};

export const supabase = {
  from: <T = Record<string, unknown>>(table: string) => createQuery<T>(table),
  storage,
  auth,
};

