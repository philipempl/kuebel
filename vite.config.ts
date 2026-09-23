import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  // public/ ist die Landing Page, nicht das Asset-Verzeichnis der App - sonst
  // wuerde deren index.html beim Build die der App ueberschreiben.
  publicDir: false,
  server: { port: 1420, strictPort: true },
  build: { target: "safari14" },
});
