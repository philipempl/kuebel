import { derived, writable } from "svelte/store";

export type Lang = "de" | "en";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
];

const STORAGE_KEY = "bucketctl-lang";

const de: Record<string, string> = {
  // Sidebar
  buckets: "Buckets",
  bucket_new: "Bucket anlegen",
  bucket_search: "Buckets durchsuchen",
  bucket_filter: "Bucket filtern …",
  bucket_none_matching: "Kein Bucket passt.",
  bucket_none: "Keine Buckets",
  bucket_more: "+ {n} weitere",
  bucket_less: "Weniger anzeigen",
  settings_open: "Einstellungen öffnen",
  bucket_name_placeholder: "bucket-name",
  storage: "Storage",
  storage_none: "Kein Storage",
  storage_add_hint: "Hinzufügen …",
  storage_add: "Storage hinzufügen",
  edit: "Bearbeiten",
  settings: "Einstellungen",
  theme: "Erscheinungsbild",
  language: "Sprache",
  sidebar_resize: "Seitenleiste breiter oder schmaler ziehen",
  sidebar_resize_hint: "Ziehen, oder mit den Pfeiltasten verstellen",

  // Bucket-Namen
  bucket_err_length: "3–63 Zeichen",
  bucket_err_chars: "Nur a–z, 0–9, Punkt, Bindestrich",
  bucket_err_dots: "Keine doppelten Punkte",
  bucket_err_ip: "Darf keine IP-Adresse sein",
  bucket_err_exists: "Bucket existiert schon",

  // Toolbar
  nav_back: "Zurück",
  nav_forward: "Vor",
  search: "Suchen",
  search_folder: "Im Ordner filtern …",
  search_hits: "Treffer aus allen Buckets",
  search_reset: "Suche zurücksetzen",
  search_all: "Alle Buckets",
  search_all_title: "In allen Buckets suchen",
  cancel: "Abbrechen",
  delete: "Löschen",
  upload: "Hochladen",

  // Tabelle
  col_bucket: "Bucket",
  col_name: "Name",
  col_modified: "Geändert",
  col_size: "Größe",
  empty_hits: "Keine Treffer.",
  empty_filter: "Nichts gefunden in diesem Ordner.",
  empty_folder: "Leer. Dateien hierher ziehen.",

  // Statusleiste
  loading: "Lädt …",
  searching: "Sucht{where} · {scanned} Objekte geprüft · {hits} Treffer",
  searching_in: " in {bucket}",
  hits_summary: "{hits} Treffer in {buckets} Buckets",
  hits_truncated: " (bei {limit} abgebrochen)",
  hits_cancelled: " (abgebrochen)",
  hits_skipped: " · {n} übersprungen",
  objects_one: "1 Objekt",
  objects_many: "{n} Objekte",
  one_selected: ", 1 ausgewählt",
  page_of: "Seite {page} von {total}",
  page_prev: "Vorherige Seite",
  page_next: "Nächste Seite",
  drop_here: "Ablegen zum Hochladen",

  // Vorschau
  preview_close: "Vorschau schließen",
  preview_truncated: "Nur die ersten 1 MB werden angezeigt.",
  preview_unsupported: "Keine Vorschau für diesen Dateityp.",
  meta_size: "Größe",
  meta_type: "Typ",
  meta_modified: "Geändert",
  meta_etag: "ETag",
  meta_path: "Pfad",
  unknown: "unbekannt",

  // Löschen
  del_folder_q: "Ordner „{name}“ und alle Inhalte löschen?",
  del_file_q: "„{name}“ löschen?",
  del_title: "Löschen",

  // Storage-Dialog
  sheet_edit: "Storage bearbeiten",
  sheet_add: "Storage hinzufügen",
  sheet_sub: "S3 oder S3-kompatibel. Zugangsdaten liegen im Klartext in storages.json.",
  f_name: "Name",
  f_endpoint: "Endpoint",
  f_region: "Region",
  f_addressing: "Adressierung",
  f_access: "Access Key",
  f_secret: "Secret Key",
  keep_unchanged: "unverändert lassen",
  test_connection: "Verbindung testen",
  connected: "Verbunden, {n} Bucket gefunden.",
  connected_many: "Verbunden, {n} Buckets gefunden.",
  save: "Speichern",
  remove: "Entfernen",
  remove_q: "Storage „{name}“ entfernen? Die gespeicherten Zugangsdaten werden gelöscht.",
  remove_title: "Storage entfernen",

  // Datum
  today: "Heute",
  yesterday: "Gestern",
};

const en: Record<string, string> = {
  buckets: "Buckets",
  bucket_new: "Create bucket",
  bucket_search: "Search buckets",
  bucket_filter: "Filter buckets …",
  bucket_none_matching: "No bucket matches.",
  bucket_none: "No buckets",
  bucket_more: "+ {n} more",
  bucket_less: "Show fewer",
  settings_open: "Open settings",
  bucket_name_placeholder: "bucket-name",
  storage: "Storage",
  storage_none: "No storage",
  storage_add_hint: "Add …",
  storage_add: "Add storage",
  edit: "Edit",
  settings: "Settings",
  theme: "Appearance",
  language: "Language",
  sidebar_resize: "Resize sidebar",
  sidebar_resize_hint: "Drag, or use the arrow keys",

  bucket_err_length: "3–63 characters",
  bucket_err_chars: "Only a–z, 0–9, dot, hyphen",
  bucket_err_dots: "No consecutive dots",
  bucket_err_ip: "Must not be an IP address",
  bucket_err_exists: "Bucket already exists",

  nav_back: "Back",
  nav_forward: "Forward",
  search: "Search",
  search_folder: "Filter this folder …",
  search_hits: "Matches across all buckets",
  search_reset: "Clear search",
  search_all: "All buckets",
  search_all_title: "Search across all buckets",
  cancel: "Cancel",
  delete: "Delete",
  upload: "Upload",

  col_bucket: "Bucket",
  col_name: "Name",
  col_modified: "Modified",
  col_size: "Size",
  empty_hits: "No matches.",
  empty_filter: "Nothing found in this folder.",
  empty_folder: "Empty. Drop files here.",

  loading: "Loading …",
  searching: "Searching{where} · {scanned} objects scanned · {hits} matches",
  searching_in: " in {bucket}",
  hits_summary: "{hits} matches across {buckets} buckets",
  hits_truncated: " (stopped at {limit})",
  hits_cancelled: " (cancelled)",
  hits_skipped: " · {n} skipped",
  objects_one: "1 object",
  objects_many: "{n} objects",
  one_selected: ", 1 selected",
  page_of: "Page {page} of {total}",
  page_prev: "Previous page",
  page_next: "Next page",
  drop_here: "Drop to upload",

  preview_close: "Close preview",
  preview_truncated: "Showing the first 1 MB only.",
  preview_unsupported: "No preview for this file type.",
  meta_size: "Size",
  meta_type: "Type",
  meta_modified: "Modified",
  meta_etag: "ETag",
  meta_path: "Path",
  unknown: "unknown",

  del_folder_q: "Delete folder “{name}” and everything in it?",
  del_file_q: "Delete “{name}”?",
  del_title: "Delete",

  sheet_edit: "Edit storage",
  sheet_add: "Add storage",
  sheet_sub: "S3 or S3-compatible. Credentials are stored in plain text in storages.json.",
  f_name: "Name",
  f_endpoint: "Endpoint",
  f_region: "Region",
  f_addressing: "Addressing",
  f_access: "Access key",
  f_secret: "Secret key",
  keep_unchanged: "leave unchanged",
  test_connection: "Test connection",
  connected: "Connected, found {n} bucket.",
  connected_many: "Connected, found {n} buckets.",
  save: "Save",
  remove: "Remove",
  remove_q: "Remove storage “{name}”? The stored credentials will be deleted.",
  remove_title: "Remove storage",

  today: "Today",
  yesterday: "Yesterday",
};

const dicts: Record<Lang, Record<string, string>> = { de, en };

/// Englisch ist die Vorgabe, unabhaengig von der Systemsprache. Nur eine
/// zuvor getroffene Wahl geht vor.
function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "de" || saved === "en") return saved;
  } catch {
    /* Storage gesperrt - dann bleibt es bei der Vorgabe. */
  }
  return "en";
}

export const lang = writable<Lang>(initial());

lang.subscribe((l) => {
  document.documentElement.lang = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* Wahl gilt dann nur fuer diese Sitzung. */
  }
});

/// Locale fuer Zahlen- und Datumsformatierung.
export const locale = derived(lang, ($l) => ($l === "de" ? "de-DE" : "en-GB"));

/// `$t("key", { name: "x" })` - fehlt ein Schluessel, faellt es auf Deutsch
/// und zuletzt auf den Schluessel selbst zurueck, damit nie eine leere
/// Beschriftung erscheint.
export const t = derived(
  lang,
  ($l) =>
    (key: string, vars?: Record<string, string | number>): string => {
      let s = dicts[$l][key] ?? de[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    },
);

/// Zahlen- und Datumsformate haengen an der Sprache, darum stehen sie hier
/// und nicht in api.ts: `$fmt.size(n)`, `$fmt.date(iso)`.
export const fmt = derived([locale, t], ([$locale, $t]) => ({
  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let v = bytes / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toLocaleString($locale, { maximumFractionDigits: 1 })} ${units[i]}`;
  },
  number(n: number): string {
    return n.toLocaleString($locale);
  },
  date(iso: string | null): string {
    if (!iso) return "–";
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString($locale, { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return `${$t("today")}, ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `${$t("yesterday")}, ${time}`;
    return d.toLocaleDateString($locale);
  },
}));
