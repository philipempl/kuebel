// Traegt die Beispiel-Storages in die storages.json der App ein, damit sie im
// Umschalter auftauchen. Vorhandene Eintraege bleiben unangetastet; vor jeder
// Aenderung wird eine Sicherung angelegt.
//
// Aufruf:  make demo-import        (oder: node scripts/create-demo-storages.mjs)
// Zuruecknehmen: make demo-remove
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const IDENTIFIER = "de.complioty.storage";

function appDataDir() {
  const home = homedir();
  switch (platform()) {
    case "darwin": return join(home, "Library", "Application Support", IDENTIFIER);
    case "win32":  return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), IDENTIFIER);
    default:       return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), IDENTIFIER);
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const demo = JSON.parse(await readFile(join(root, "scripts/demo-storages.json"), "utf8")).storages;
const file = join(appDataDir(), "storages.json");
const remove = process.argv.includes("--remove");

await mkdir(dirname(file), { recursive: true });

let store = { storages: [], active_id: null, credentials: {} };
if (existsSync(file)) {
  await copyFile(file, `${file}.backup`);
  try {
    store = { ...store, ...JSON.parse(await readFile(file, "utf8")) };
  } catch {
    console.warn("storages.json war nicht lesbar, wird neu angelegt. Sicherung liegt daneben.");
  }
}

const demoIds = new Set(demo.map((s) => s.id));

if (remove) {
  store.storages = (store.storages ?? []).filter((s) => !demoIds.has(s.id));
  for (const id of demoIds) delete store.credentials?.[id];
  if (demoIds.has(store.active_id)) store.active_id = store.storages[0]?.id ?? null;
  console.log(`Beispiel-Storages entfernt. Verbleibend: ${store.storages.length}`);
} else {
  const existing = new Set((store.storages ?? []).map((s) => s.id));
  const added = demo.filter((s) => !existing.has(s.id));
  store.storages = [...(store.storages ?? []), ...added];
  store.credentials ??= {};
  for (const s of demo) {
    // Erfundene Schluessel. Sie reichen, damit der Eintrag vollstaendig ist -
    // echte Buckets liefert nur `make demo-de` / `make demo-en`.
    store.credentials[s.id] ??= { access_key: "DEMOACCESSKEY0000000", secret_key: "demo-secret-key-not-real" };
  }
  store.active_id ??= store.storages[0]?.id ?? null;
  console.log(added.length ? `${added.length} Beispiel-Storage(s) eingetragen.` : "Beispiel-Storages waren schon vorhanden.");
}

await writeFile(file, JSON.stringify(store, null, 2) + "\n");
console.log(`Geschrieben: ${file}`);
if (existsSync(`${file}.backup`)) console.log(`Sicherung:   ${file}.backup`);
