import { convertFileSrc, invoke as tauriInvoke } from "@tauri-apps/api/core";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

// Im Entwicklungsmodus haengt src/lib/demo.ts hier eine Attrappe ein, damit die
// Oberflaeche mit Beispieldaten laeuft. In Produktionsbauten wird das Demo-Modul
// gar nicht erst importiert - siehe main.ts.
let invoke: Invoke = tauriInvoke as Invoke;
let srcFor: (storageId: string, bucket: string, key: string) => string = (s, b, k) =>
  convertFileSrc(JSON.stringify({ s, b, k }), "preview");

export function installBackend(next: { invoke: Invoke; previewSrc: typeof srcFor }) {
  invoke = next.invoke;
  srcFor = next.previewSrc;
}

export interface Storage {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  path_style: boolean;
}

export interface StorageInput {
  id?: string;
  name: string;
  endpoint: string;
  region: string;
  path_style: boolean;
  access_key?: string;
  secret_key?: string;
}

export interface S3Object {
  key: string;
  name: string;
  size: number;
  last_modified: string | null;
}

export interface Hit {
  bucket: string;
  key: string;
  name: string;
  size: number;
  last_modified: string | null;
}

export interface SearchResult {
  hits: Hit[];
  scanned: number;
  truncated: boolean;
  cancelled: boolean;
  skipped: string[];
}

export interface SearchProgress {
  bucket: string;
  scanned: number;
  hits: number;
}

export interface Preview {
  kind: "image" | "pdf" | "text" | "unsupported";
  content_type: string | null;
  size: number;
  last_modified: string | null;
  etag: string | null;
  truncated: boolean;
  text: string | null;
}

/// URL fuer das preview://-Protokoll. convertFileSrc kennt den
/// Plattformunterschied (Windows nutzt http://preview.localhost).
export function previewSrc(storageId: string, bucket: string, key: string): string {
  return srcFor(storageId, bucket, key);
}

export interface Listing {
  prefix: string;
  folders: string[];
  files: S3Object[];
}

export const api = {
  listStorages: () => invoke<{ storages: Storage[]; active_id: string | null }>("list_storages"),
  saveStorage: (input: StorageInput) => invoke<Storage>("save_storage", { input }),
  deleteStorage: (id: string) => invoke<void>("delete_storage", { id }),
  setActiveStorage: (id: string) => invoke<void>("set_active_storage", { id }),
  testConnection: (input: StorageInput) => invoke<string[]>("test_connection", { input }),
  listBuckets: (storageId: string) => invoke<string[]>("list_buckets", { storageId }),
  listObjects: (storageId: string, bucket: string, prefix: string) =>
    invoke<Listing>("list_objects", { storageId, bucket, prefix }),
  createBucket: (storageId: string, name: string) =>
    invoke<void>("create_bucket", { storageId, name }),
  searchObjects: (storageId: string, buckets: string[], query: string, limit: number) =>
    invoke<SearchResult>("search_objects", { storageId, buckets, query, limit }),
  cancelSearch: () => invoke<void>("cancel_search"),
  uploadFile: (storageId: string, bucket: string, key: string, path: string) =>
    invoke<void>("upload_file", { storageId, bucket, key, path }),
  previewObject: (storageId: string, bucket: string, key: string) =>
    invoke<Preview>("preview_object", { storageId, bucket, key }),
  deleteObject: (storageId: string, bucket: string, key: string) =>
    invoke<void>("delete_object", { storageId, bucket, key }),
};

export function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}
