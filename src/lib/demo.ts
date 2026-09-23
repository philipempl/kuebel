// Beispieldaten fuer Screenshots und zum Entwickeln ohne echten S3-Zugang.
//
// Wird ausschliesslich von main.ts geladen, und nur wenn import.meta.env.DEV
// und VITE_DEMO gesetzt sind. Im Produktionsbau ist DEV statisch false, der
// dynamische Import faellt damit aus dem Bundle - `npm run build` enthaelt
// nichts hiervon.
//
// Starten:  npm run demo:de   bzw.   npm run demo:en

import demoStorages from "../../scripts/demo-storages.json";
import { installBackend, type Hit, type Listing, type Preview, type S3Object, type Storage } from "./api";

type Lang = "de" | "en";

interface Space {
  storage: Storage;
  buckets: string[];
  /** bucket -> vollstaendige Objektliste, Ordner ergeben sich aus den Schluesseln */
  objects: Record<string, Array<[key: string, size: number, daysAgo: number]>>;
  /** Inhalt der Textdateien, Schluessel wie in objects */
  texts: Record<string, string>;
}

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

// Dieselbe Quelle wie scripts/create-demo-storages.mjs.
const STORAGE_DE = demoStorages.storages.find((s) => s.id === "demo-de") as Storage;
const STORAGE_EN = demoStorages.storages.find((s) => s.id === "demo-en") as Storage;

// Mehr als zehn, damit der Schalter "+ N weitere" in der Seitenleiste zu sehen ist.
const BUCKETS_DE = [
  "rechnungen-2026", "kundendaten", "backups-taeglich", "website-assets",
  "protokolle", "vertraege", "medien-archiv", "exporte", "lieferscheine",
  "personal", "schulungen", "angebote", "inventur", "zertifikate",
];

const BUCKETS_EN = [
  "invoices-2026", "customer-data", "backups-daily", "website-assets",
  "audit-logs", "contracts", "media-archive", "exports", "delivery-notes",
  "personnel", "training", "quotes", "inventory", "certificates",
];

const OBJECTS_DE: Space["objects"] = {
  "website-assets": [
    ["bilder/startseite-hero.png", 842_118, 2],
    ["bilder/team-muenchen.jpg", 1_284_902, 9],
    ["bilder/logo-quadrat.png", 18_440, 34],
    ["bilder/icon-app.svg", 6_204, 34],
    ["dokumente/preisliste-2026.pdf", 248_881, 5],
    ["dokumente/agb.pdf", 96_210, 120],
    ["styles/theme.css", 18_402, 1],
    ["daten/regionen.json", 4_190, 12],
    ["README.md", 2_048, 40],
  ],
  "rechnungen-2026": [
    ["januar/RE-2026-0001.pdf", 122_338, 61],
    ["januar/RE-2026-0002.pdf", 118_902, 60],
    ["januar/RE-2026-0003.pdf", 127_440, 58],
    ["februar/RE-2026-0044.pdf", 131_004, 30],
    ["februar/RE-2026-0045.pdf", 119_880, 29],
    ["maerz/RE-2026-0090.pdf", 124_552, 12],
    ["uebersicht.csv", 8_912, 3],
  ],
  "kundendaten": [
    ["stammdaten/kunden.csv", 412_880, 4],
    ["stammdaten/ansprechpartner.csv", 88_204, 4],
    ["export/2026-09-01.json", 1_204_338, 21],
    ["export/2026-08-01.json", 1_188_002, 52],
    ["hinweise.md", 1_802, 21],
  ],
  "backups-taeglich": [
    ["2026-09-22/datenbank.sql.gz", 184_220_918, 1],
    ["2026-09-21/datenbank.sql.gz", 183_004_112, 2],
    ["2026-09-20/datenbank.sql.gz", 182_880_004, 3],
    ["pruefsummen.txt", 3_120, 1],
  ],
  "protokolle": [
    ["2026-09-20.log", 1_902_338, 3],
    ["2026-09-21.log", 2_118_004, 2],
    ["2026-09-22.log", 884_120, 1],
    ["archiv/2026-08.tar.gz", 48_221_904, 25],
    ["archiv/2026-07.tar.gz", 51_009_882, 56],
  ],
  "vertraege": [
    ["rahmenvertraege/lieferant-nord.pdf", 318_004, 88],
    ["rahmenvertraege/lieferant-sued.pdf", 296_118, 140],
    ["miete/buero-muenchen.pdf", 204_880, 310],
    ["unterschrieben.csv", 5_402, 14],
  ],
  "medien-archiv": [
    ["messe-2026/stand-aufbau.jpg", 3_882_004, 45],
    ["messe-2026/vortrag.jpg", 4_112_880, 45],
    ["produkt/detail-01.png", 1_442_118, 70],
    ["produkt/detail-02.png", 1_508_002, 70],
  ],
  "exporte": [
    ["buchhaltung/2026-q2.csv", 2_884_112, 84],
    ["buchhaltung/2026-q1.csv", 2_770_008, 175],
    ["lager/bestand.json", 604_880, 6],
  ],
  "lieferscheine": [
    ["2026-09/LS-4471.pdf", 88_204, 5],
    ["2026-09/LS-4472.pdf", 91_118, 4],
    ["2026-08/LS-4390.pdf", 87_440, 38],
  ],
  "personal": [
    ["einarbeitung/checkliste.md", 4_208, 30],
    ["einarbeitung/it-ausstattung.pdf", 142_002, 30],
    ["urlaubsplan-2026.csv", 12_880, 9],
  ],
  "schulungen": [
    ["datenschutz/folien.pdf", 1_882_004, 60],
    ["datenschutz/teilnehmer.csv", 6_440, 60],
    ["sicherheit/folien.pdf", 2_004_118, 150],
  ],
  "angebote": [
    ["2026/AN-0221.pdf", 132_880, 11],
    ["2026/AN-0222.pdf", 128_004, 8],
    ["vorlage.md", 3_112, 200],
  ],
  "inventur": [
    ["2026/zaehlliste.csv", 442_118, 2],
    ["2026/abweichungen.csv", 18_880, 2],
    ["2025/zaehlliste.csv", 428_004, 367],
  ],
  "zertifikate": [
    ["iso-9001.pdf", 884_112, 220],
    ["iso-27001.pdf", 912_008, 220],
    ["gueltigkeit.json", 1_408, 220],
  ],
};

const OBJECTS_EN: Space["objects"] = {
  "website-assets": [
    ["images/homepage-hero.png", 842_118, 2],
    ["images/team-munich.jpg", 1_284_902, 9],
    ["images/logo-square.png", 18_440, 34],
    ["images/app-icon.svg", 6_204, 34],
    ["documents/price-list-2026.pdf", 248_881, 5],
    ["documents/terms.pdf", 96_210, 120],
    ["styles/theme.css", 18_402, 1],
    ["data/regions.json", 4_190, 12],
    ["README.md", 2_048, 40],
  ],
  "invoices-2026": [
    ["january/INV-2026-0001.pdf", 122_338, 61],
    ["january/INV-2026-0002.pdf", 118_902, 60],
    ["january/INV-2026-0003.pdf", 127_440, 58],
    ["february/INV-2026-0044.pdf", 131_004, 30],
    ["february/INV-2026-0045.pdf", 119_880, 29],
    ["march/INV-2026-0090.pdf", 124_552, 12],
    ["summary.csv", 8_912, 3],
  ],
  "customer-data": [
    ["master/customers.csv", 412_880, 4],
    ["master/contacts.csv", 88_204, 4],
    ["export/2026-09-01.json", 1_204_338, 21],
    ["export/2026-08-01.json", 1_188_002, 52],
    ["notes.md", 1_802, 21],
  ],
  "backups-daily": [
    ["2026-09-22/database.sql.gz", 184_220_918, 1],
    ["2026-09-21/database.sql.gz", 183_004_112, 2],
    ["2026-09-20/database.sql.gz", 182_880_004, 3],
    ["checksums.txt", 3_120, 1],
  ],
  "audit-logs": [
    ["2026-09-20.log", 1_902_338, 3],
    ["2026-09-21.log", 2_118_004, 2],
    ["2026-09-22.log", 884_120, 1],
    ["archive/2026-08.tar.gz", 48_221_904, 25],
    ["archive/2026-07.tar.gz", 51_009_882, 56],
  ],
  "contracts": [
    ["framework/supplier-north.pdf", 318_004, 88],
    ["framework/supplier-south.pdf", 296_118, 140],
    ["lease/office-munich.pdf", 204_880, 310],
    ["signed.csv", 5_402, 14],
  ],
  "media-archive": [
    ["expo-2026/booth-setup.jpg", 3_882_004, 45],
    ["expo-2026/keynote.jpg", 4_112_880, 45],
    ["product/detail-01.png", 1_442_118, 70],
    ["product/detail-02.png", 1_508_002, 70],
  ],
  "exports": [
    ["accounting/2026-q2.csv", 2_884_112, 84],
    ["accounting/2026-q1.csv", 2_770_008, 175],
    ["warehouse/stock.json", 604_880, 6],
  ],
  "delivery-notes": [
    ["2026-09/DN-4471.pdf", 88_204, 5],
    ["2026-09/DN-4472.pdf", 91_118, 4],
    ["2026-08/DN-4390.pdf", 87_440, 38],
  ],
  "personnel": [
    ["onboarding/checklist.md", 4_208, 30],
    ["onboarding/it-equipment.pdf", 142_002, 30],
    ["leave-plan-2026.csv", 12_880, 9],
  ],
  "training": [
    ["privacy/slides.pdf", 1_882_004, 60],
    ["privacy/attendees.csv", 6_440, 60],
    ["security/slides.pdf", 2_004_118, 150],
  ],
  "quotes": [
    ["2026/Q-0221.pdf", 132_880, 11],
    ["2026/Q-0222.pdf", 128_004, 8],
    ["template.md", 3_112, 200],
  ],
  "inventory": [
    ["2026/count-sheet.csv", 442_118, 2],
    ["2026/discrepancies.csv", 18_880, 2],
    ["2025/count-sheet.csv", 428_004, 367],
  ],
  "certificates": [
    ["iso-9001.pdf", 884_112, 220],
    ["iso-27001.pdf", 912_008, 220],
    ["validity.json", 1_408, 220],
  ],
};

const TEXT_DE: Record<string, string> = {
  "README.md": `# Website-Assets

Bilder, Dokumente und Styles der oeffentlichen Seite.

- bilder/     Fotos und Grafiken, immer als PNG oder JPG
- dokumente/  PDFs zum Herunterladen
- styles/     Stylesheets, werden beim Build eingebunden

Nichts hier ist vertraulich. Der Bucket ist oeffentlich lesbar.
`,
  "daten/regionen.json": `{
  "regionen": [
    { "id": "fsn1", "stadt": "Falkenstein", "land": "DE" },
    { "id": "nbg1", "stadt": "Nuernberg",   "land": "DE" },
    { "id": "hel1", "stadt": "Helsinki",    "land": "FI" }
  ],
  "standard": "fsn1"
}
`,
  "styles/theme.css": `:root {
  --graphit: #1C1C1E;
  --ivory:   #F5F5F7;
  --blau:    #007AFF;
  --lila:    #AA40FF;
}
`,
};

const TEXT_EN: Record<string, string> = {
  "README.md": `# Website assets

Images, documents and styles for the public site.

- images/     Photos and graphics, always PNG or JPG
- documents/  PDFs for download
- styles/     Stylesheets, pulled in at build time

Nothing here is confidential. The bucket is publicly readable.
`,
  "data/regions.json": `{
  "regions": [
    { "id": "eu-central-1", "city": "Frankfurt", "country": "DE" },
    { "id": "eu-west-1",    "city": "Dublin",    "country": "IE" },
    { "id": "us-east-1",    "city": "Ashburn",   "country": "US" }
  ],
  "default": "eu-central-1"
}
`,
  "styles/theme.css": `:root {
  --graphite: #1C1C1E;
  --ivory:    #F5F5F7;
  --blue:     #007AFF;
  --purple:   #AA40FF;
}
`,
};

/** Platzhalterbild als data-URL, damit die Vorschau auch ohne S3 etwas zeigt. */
function placeholder(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
  <rect width="640" height="420" fill="#1C1C1E"/>
  <g transform="translate(232 150) scale(1.4)">
    <path d="M110 30 L70 60 Q64 65 64 70 Q64 75 70 80 L110 110" fill="none" stroke="#F5F5F7" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" transform="translate(-28 -21.5)"/>
    <rect x="2" y="4.5" width="20" height="40" rx="6" fill="#007AFF"/>
    <rect x="2" y="52.5" width="20" height="40" rx="6" fill="#AA40FF"/>
  </g>
  <text x="320" y="390" fill="#616168" font-family="IBM Plex Mono, monospace" font-size="15" text-anchor="middle">${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Jeder Storage ist ein eigener Sprachraum: deutsche Bucket- und Dateinamen im
// deutschen, englische im englischen. Nichts vermischt sich, auch nicht beim
// Umschalten im laufenden Demo.
const SPACES: Record<string, Space> = {
  [STORAGE_DE.id]: { storage: STORAGE_DE, buckets: BUCKETS_DE, objects: OBJECTS_DE, texts: TEXT_DE },
  [STORAGE_EN.id]: { storage: STORAGE_EN, buckets: BUCKETS_EN, objects: OBJECTS_EN, texts: TEXT_EN },
};

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const PDF = /\.pdf$/i;

function basename(key: string): string {
  return key.replace(/\/$/, "").split("/").pop() ?? key;
}

/** Baut aus der flachen Objektliste die Ansicht eines Prefixes. */
function listing(entries: Space["objects"][string], prefix: string): Listing {
  const folders = new Set<string>();
  const files: S3Object[] = [];

  for (const [key, size, daysAgo] of entries) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash >= 0) {
      folders.add(prefix + rest.slice(0, slash + 1));
    } else {
      files.push({ key, name: rest, size, last_modified: iso(daysAgo) });
    }
  }
  return { prefix, folders: [...folders].sort(), files };
}

export function installDemo(lang: Lang) {
  const order = lang === "de" ? [STORAGE_DE.id, STORAGE_EN.id] : [STORAGE_EN.id, STORAGE_DE.id];
  let active = order[0];

  const spaceOf = (id?: unknown) => SPACES[(id as string) ?? active] ?? SPACES[active];

  const invoke = async <T,>(cmd: string, args: Record<string, unknown> = {}): Promise<T> => {
    // Eine Spur Latenz, damit Ladezustaende im Screenshot ueberhaupt auftreten.
    await new Promise((r) => setTimeout(r, 90));
    const space = spaceOf(args.storageId);
    const bucket = args.bucket as string;
    const key = args.key as string;

    switch (cmd) {
      case "list_storages":
        return { storages: order.map((id) => SPACES[id].storage), active_id: active } as T;
      case "set_active_storage":
        active = args.id as string;
        return undefined as T;
      case "list_buckets":
        return space.buckets as T;
      case "list_objects":
        return listing(space.objects[bucket] ?? [], (args.prefix as string) ?? "") as T;
      case "preview_object": {
        const entry = (space.objects[bucket] ?? []).find(([k]) => k === key);
        const base: Preview = {
          kind: "unsupported",
          content_type: null,
          size: entry?.[1] ?? 0,
          last_modified: iso(entry?.[2] ?? 1),
          etag: "d41d8cd98f00b204e9800998ecf8427e",
          truncated: false,
          text: null,
        };
        if (IMAGE.test(key)) return { ...base, kind: "image", content_type: "image/png" } as T;
        if (PDF.test(key)) return { ...base, kind: "pdf", content_type: "application/pdf" } as T;
        const body = space.texts[key] ?? space.texts[basename(key)];
        if (body) return { ...base, kind: "text", content_type: "text/plain", text: body } as T;
        return base as T;
      }
      case "search_objects": {
        const q = String(args.query ?? "").toLowerCase();
        const hits: Hit[] = [];
        let scanned = 0;
        for (const [b, entries] of Object.entries(space.objects)) {
          for (const [k, size, daysAgo] of entries) {
            scanned++;
            if (!k.toLowerCase().includes(q)) continue;
            hits.push({ bucket: b, key: k, name: basename(k), size, last_modified: iso(daysAgo) });
          }
        }
        return { hits, scanned, truncated: false, cancelled: false, skipped: [] } as T;
      }
      case "test_connection":
        return space.buckets as T;
      case "user_themes_dir":
        return "~/Library/Application Support/de.complioty.storage/themes" as T;
      case "list_user_themes":
        return [] as T;
      default:
        // save_storage, delete_storage, create_bucket, upload_file,
        // delete_object, cancel_search: im Demo folgenlos.
        return undefined as T;
    }
  };

  installBackend({ invoke, previewSrc: (_s, _b, key) => placeholder(basename(key)) });
  console.info(`[kuebel] Demo-Daten aktiv (${lang}). Nur in der Entwicklung.`);
}
