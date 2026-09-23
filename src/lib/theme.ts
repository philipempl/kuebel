import YAML from "yaml";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type Appearance = "light" | "dark";

export interface Theme {
  id: string;
  /** Entweder ein fester Text oder je Sprache einer: `{ de: "Hell", en: "Light" }`. */
  name: string | Record<string, string>;
  appearance: Appearance;
  default?: boolean;
  fonts: { sans: string; mono: string };
  colors: Record<string, string>;
  radius: number;
  source: "bundled" | "user";
}

type RawTheme = Partial<Omit<Theme, "fonts" | "colors">> & {
  extends?: string;
  fonts?: Partial<Theme["fonts"]>;
  colors?: Record<string, string>;
};

const STORAGE_KEY = "theme";
const SYSTEM_SANS = '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const SYSTEM_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// Sicherheitsnetz: fehlende Werte werden hieraus ergänzt.
const FALLBACK: Record<Appearance, Omit<Theme, "id" | "name" | "source">> = {
  light: {
    appearance: "light",
    fonts: { sans: SYSTEM_SANS, mono: SYSTEM_MONO },
    colors: {
      background: "#FFFFFF", sidebar: "#F5F5F7", surface: "#FFFFFF", input: "#FFFFFF",
      text: "#1C1C1E", text_secondary: "#6B6B70", text_muted: "#A8A8AD", hairline: "#E4E4E7",
      accent: "#007AFF", accent_text: "#F5F5F7", selection: "rgba(0,122,255,0.14)", hover: "rgba(28,28,30,0.05)",
      success: "#34C759", danger: "#FF3B30", overlay: "rgba(0,0,0,0.2)", shadow: "rgba(0,0,0,0.12)",
    },
    radius: 7,
  },
  dark: {
    appearance: "dark",
    fonts: { sans: SYSTEM_SANS, mono: SYSTEM_MONO },
    colors: {
      background: "#1C1C1E", sidebar: "#252528", surface: "#2E2E31", input: "#1C1C1E",
      text: "#F5F5F7", text_secondary: "#9A9AA0", text_muted: "#616168", hairline: "#3A3A3E",
      accent: "#007AFF", accent_text: "#F5F5F7", selection: "rgba(0,122,255,0.22)", hover: "rgba(245,245,247,0.06)",
      success: "#30D158", danger: "#FF453A", overlay: "rgba(0,0,0,0.45)", shadow: "rgba(0,0,0,0.45)",
    },
    radius: 7,
  },
};

const bundled = import.meta.glob("/themes/*.{yml,yaml}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function parse(content: string, file: string): RawTheme | null {
  try {
    const data = YAML.parse(content) as RawTheme;
    if (!data || typeof data !== "object" || !data.id) {
      console.warn(`Theme ${file}: "id" fehlt, übersprungen`);
      return null;
    }
    return data;
  } catch (e) {
    console.warn(`Theme ${file} ungültig:`, e);
    return null;
  }
}

function merge(base: Omit<Theme, "id" | "name" | "source">, raw: RawTheme): Omit<Theme, "id" | "name" | "source"> {
  return {
    appearance: raw.appearance ?? base.appearance,
    default: raw.default,
    fonts: { ...base.fonts, ...(raw.fonts ?? {}) },
    colors: { ...base.colors, ...(raw.colors ?? {}) },
    radius: raw.radius ?? base.radius,
  };
}

export async function loadThemes(): Promise<Theme[]> {
  const raws = new Map<string, { raw: RawTheme; source: Theme["source"] }>();

  for (const [file, content] of Object.entries(bundled)) {
    const raw = parse(content, file);
    if (raw) raws.set(raw.id!, { raw, source: "bundled" });
  }

  try {
    const user = await invoke<{ file: string; content: string }[]>("list_user_themes");
    for (const { file, content } of user) {
      const raw = parse(content, file);
      if (raw) raws.set(raw.id!, { raw, source: "user" });
    }
  } catch (e) {
    console.warn("Nutzer-Themes nicht geladen:", e);
  }

  const resolved = new Map<string, Theme>();
  const resolve = (id: string, seen: Set<string>): Theme | null => {
    if (resolved.has(id)) return resolved.get(id)!;
    const entry = raws.get(id);
    if (!entry || seen.has(id)) return null;
    seen.add(id);
    const { raw, source } = entry;
    const parent = raw.extends ? resolve(raw.extends, seen) : null;
    const base = parent ?? FALLBACK[raw.appearance ?? "light"];
    const theme: Theme = { id, name: raw.name ?? id, source, ...merge(base, raw) };
    theme.default = raw.default ?? false;
    resolved.set(id, theme);
    return theme;
  };

  for (const id of raws.keys()) resolve(id, new Set());
  return [...resolved.values()];
}

/// Loest den Theme-Namen fuer die aktuelle Sprache auf. Ein Theme darf seinen
/// Namen auch schlicht als Text angeben - dann gilt er in jeder Sprache.
export function themeName(theme: Theme, lang: string): string {
  const n = theme.name;
  if (typeof n === "string") return n;
  return n[lang] ?? n.en ?? n.de ?? Object.values(n)[0] ?? theme.id;
}

export function pickInitial(themes: Theme[]): Theme | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  return (
    themes.find((t) => t.id === saved) ??
    themes.find((t) => t.default) ??
    themes.find((t) => t.appearance === (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) ??
    themes[0] ??
    null
  );
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key.replace(/_/g, "-")}`, value);
  }
  root.style.setProperty("--sans", theme.fonts.sans);
  root.style.setProperty("--mono", theme.fonts.mono);
  root.style.setProperty("--radius", `${theme.radius}px`);
  root.style.colorScheme = theme.appearance;
  root.dataset.appearance = theme.appearance;

  localStorage.setItem(STORAGE_KEY, theme.id);
  getCurrentWindow().setTheme(theme.appearance).catch(() => {});
}
