# Themes

Ein Theme legt drei Dinge fest: **seinen Namen, die Schriften und die Farben.** Mehr nicht. Die App heißt in jedem Theme kuebel — der Name der Anwendung gehört nicht zum Theme.

Jede `.yml`-Datei in diesem Ordner wird beim Build eingebunden und erscheint unter **Einstellungen** in der Seitenleiste. Zusätzlich lädt die App beim Start alle `.yml`-Dateien aus dem Nutzerordner, dessen Pfad in den Einstellungen steht — dafür muss nichts neu gebaut werden. Ein Nutzer-Theme mit derselben `id` ersetzt ein eingebautes. Änderungen greifen beim nächsten Start der App.

## Eigenes Theme

Minimal reicht `extends` plus die Werte, die abweichen:

```yaml
id: mein_theme
name: Mein Theme
extends: dark
colors:
  accent: "#FF9F0A"
```

Der Name darf auch je Sprache stehen — so machen es die eingebauten Themes:

```yaml
name:
  de: Dunkel
  en: Dark
```

Fehlt die aktuelle Sprache, greift `en`, dann `de`, zuletzt die `id`.

## Alle Schlüssel

| Schlüssel | Bedeutung |
|---|---|
| `id` | Eindeutiger Name, Pflicht |
| `name` | Anzeigename. Entweder ein Text, der in jeder Sprache gilt, oder einer je Sprache: `de:` und `en:` |
| `appearance` | `light` oder `dark`, steuert auch die Fensterleiste |
| `default` | `true` macht es zum Standard beim ersten Start |
| `extends` | `id` eines anderen Themes als Basis |
| `fonts.sans`, `fonts.mono` | CSS-Font-Stacks |
| `radius` | Eckenradius für Buttons und Zeilen in px |

Schriften müssen aus dem Bundle oder vom System kommen. Die Content Security Policy lässt kein Nachladen über das Netz zu, `fonts.url` wird deshalb nicht mehr ausgewertet.

Farben (`colors`): `background`, `sidebar`, `surface`, `input`, `text`, `text_secondary`, `text_muted`, `hairline`, `accent`, `accent_text`, `selection`, `hover`, `success`, `danger`, `overlay`, `shadow`. Fehlende Werte kommen aus `extends` oder, ohne `extends`, aus dem eingebauten Hell- bzw. Dunkel-Fallback passend zu `appearance`.
