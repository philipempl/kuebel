// Kopiert die Markendateien und Schriften aus assets/ nach public/, damit die
// Landing Page sie ausliefern kann. assets/ bleibt die einzige Quelle; die
// Kopien in public/ sind Build-Ergebnis und stehen in .gitignore.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "kuebel-mark-light.svg",
  "kuebel-mark-dark.svg",
  "favicon.svg",
  "screenshots/kuebel-de.png",
  "screenshots/kuebel-en.png",
  "fonts/IBMPlexSans-Regular.woff2",
  "fonts/IBMPlexSans-Medium.woff2",
  "fonts/IBMPlexSans-SemiBold.woff2",
  "fonts/IBMPlexMono-Regular.woff2",
];

for (const dir of ["public/fonts", "public/screenshots"]) {
  await mkdir(join(root, dir), { recursive: true });
}
for (const f of files) {
  await cp(join(root, "assets", f), join(root, "public", f));
}
console.log(`${files.length} Dateien nach public/ kopiert`);
