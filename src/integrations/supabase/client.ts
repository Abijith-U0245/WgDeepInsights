/**
 * client.ts — Offline Local PostgreSQL Client Adapter for WGDeepInsight
 * Connects frontend directly to local PostgreSQL via local FastAPI endpoints (http://localhost:8000/api/).
 */

const LOCAL_API_BASE = "http://localhost:8000/api";

class LocalPostgresQueryBuilder {
  private tableName: string;
  private eqConditions: Record<string, any> = {};
  private isSingle = false;
  private insertData: any = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields?: string) {
    return this;
  }

  eq(column: string, value: any) {
    this.eqConditions[column] = value;
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    return this;
  }

  limit(count: number) {
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  insert(data: any) {
    this.insertData = data;
    return this;
  }

  update(data: any) {
    return this;
  }

  delete() {
    return this;
  }

  upsert(data: any) {
    this.insertData = data;
    return this;
  }

  async then(resolve: (res: { data: any; error: any }) => void, reject?: (err: any) => void) {
    try {
      // Handle INSERT operations
      if (this.insertData !== null) {
        const res = await fetch(`${LOCAL_API_BASE}/${this.tableName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.insertData),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        let inserted = await res.json();
        if (this.isSingle && Array.isArray(inserted)) {
          inserted = inserted[0] || null;
        }
        resolve({ data: inserted, error: null });
        return;
      }

      // Handle SELECT queries
      let endpoint = `${LOCAL_API_BASE}/${this.tableName}`;
      if (this.eqConditions["part_id"]) {
        endpoint += `?part_id=${encodeURIComponent(this.eqConditions["part_id"])}`;
      }

      // Special handling for inspection detail sub-tables
      if (this.eqConditions["inspection_id"] && this.tableName !== "inspections") {
        const detailRes = await fetch(`${LOCAL_API_BASE}/inspections/${encodeURIComponent(this.eqConditions["inspection_id"])}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          let items = [];
          if (this.tableName === "measurement_results") items = detail.measurements || [];
          else if (this.tableName === "defect_results") items = detail.defects || [];
          else if (this.tableName === "captured_images") items = detail.images || [];
          resolve({ data: items, error: null });
          return;
        }
      }

      // Handle single inspection fetch
      if (this.tableName === "inspections" && this.eqConditions["id"]) {
        const detailRes = await fetch(`${LOCAL_API_BASE}/inspections/${encodeURIComponent(this.eqConditions["id"])}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          resolve({ data: this.isSingle ? detail.inspection : [detail.inspection], error: null });
          return;
        }
      }

      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`Local DB HTTP ${res.status}: ${res.statusText}`);
      }
      let data = await res.json();

      // Apply client-side eq filtering if any remaining
      if (Array.isArray(data)) {
        for (const [col, val] of Object.entries(this.eqConditions)) {
          if (col !== "part_id") {
            data = data.filter((item: any) => String(item[col]) === String(val));
          }
        }
      }

      if (this.isSingle) {
        data = Array.isArray(data) ? (data[0] || null) : data;
      }

      resolve({ data, error: null });
    } catch (err: any) {
      console.warn(`[LocalPostgres] Request failed for '${this.tableName}':`, err);
      resolve({ data: null, error: err });
    }
  }
}

export const supabase: any = {
  from(tableName: string) {
    return new LocalPostgresQueryBuilder(tableName);
  },
  storage: {
    from(bucketName: string) {
      return {
        async upload(path: string, file: File, options?: any) {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Url = reader.result as string;
              resolve({ data: { path: base64Url }, error: null });
            };
            reader.readAsDataURL(file);
          });
        },
        async createSignedUrl(path: string, expiresIn: number) {
          return { data: { signedUrl: path }, error: null };
        },
      };
    },
  },
  auth: {
    getUser: async () => ({ data: { user: { id: "local-user", email: "manager@wgtech.com" } }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
  },
};
