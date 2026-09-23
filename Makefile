# kuebel
#
# make            Uebersicht
# make dev        App mit Hot-Reload
# make demo-de    App mit deutschen Beispieldaten (fuer Screenshots)
# make demo-en    dito auf Englisch
.DEFAULT_GOAL := help
.PHONY: help dev demo-de demo-en demo-import demo-remove build site icons check clean

help:  ## Diese Uebersicht
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

dev:  ## App starten, mit Hot-Reload
	npm run tauri dev

demo-de:  ## App mit deutschen Beispieldaten starten
	VITE_DEMO=de npm run tauri dev

demo-en:  ## App mit englischen Beispieldaten starten
	VITE_DEMO=en npm run tauri dev

demo-import:  ## Beispiel-Storages in die storages.json der App eintragen
	node scripts/create-demo-storages.mjs

demo-remove:  ## Beispiel-Storages wieder entfernen
	node scripts/create-demo-storages.mjs --remove

# The update packages must be signed, otherwise tauri build fails. The key
# lives outside the repo; in CI it comes from the secrets.
SIGNING_KEY ?= $(HOME)/.tauri/kuebel.key

build:  ## Fertige App bauen (src-tauri/target/release/bundle/)
	TAURI_SIGNING_PRIVATE_KEY="$$(cat $(SIGNING_KEY))" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri build

site:  ## Landing Page vorbereiten (assets/ -> public/)
	npm run build:site

icons:  ## Plattform-Icons aus assets/icon-dark.svg neu erzeugen
	rsvg-convert -w 1024 -h 1024 -o /tmp/kuebel-icon.png assets/icon-dark.svg
	npm run tauri icon /tmp/kuebel-icon.png

check:  ## Das pruefen, was auch die CI prueft
	npm run build
	cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

clean:  ## Build-Ergebnisse entfernen
	rm -rf dist src-tauri/target public/fonts public/kuebel-mark-*.svg public/favicon.svg
