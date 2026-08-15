export type Bucket =
  | "reference-images"
  | "geometry-images"
  | "captured-images"
  | "annotated-images"
  | "reports";

const STORAGE_PREFIX = "wgdeepinsight-storage";

export function encodeRef(bucket: Bucket, path: string) {
  return `${bucket}::${path}`;
}

export function decodeRef(ref: string): { bucket: Bucket; path: string } | null {
  const [bucket, ...rest] = ref.split("::");
  if (!bucket || rest.length === 0) return null;
  return { bucket: bucket as Bucket, path: rest.join("::") };
}

export async function uploadFile(bucket: Bucket, file: File, prefix: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const reader = new FileReader();

  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read uploaded file"));
    reader.readAsDataURL(file);
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${STORAGE_PREFIX}:${bucket}:${path}`, dataUrl);
  }

  return encodeRef(bucket, path);
}

export async function signedUrl(ref: string | null | undefined) {
  if (!ref) return null;
  if (ref.startsWith("http")) return ref;
  const parsed = decodeRef(ref);
  if (!parsed) return null;
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${STORAGE_PREFIX}:${parsed.bucket}:${parsed.path}`) ?? null;
}

export async function signedUrls(refs: Array<string | null | undefined>) {
  return Promise.all(refs.map((r) => signedUrl(r)));
}
