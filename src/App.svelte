<script lang="ts">
  import { onMount } from "svelte";
  import { open, ask } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { listen } from "@tauri-apps/api/event";
  // Freigestelltes Zeichen aus assets/ - dieselbe Quelle wie die Landing Page.
  // "light"/"dark" meint den Grund, auf dem es liegt.
  import markOnLight from "../assets/kuebel-mark-light.svg";
  import markOnDark from "../assets/kuebel-mark-dark.svg";
  import { t, lang, fmt, LANGS, type Lang } from "./lib/i18n";
  import { api, previewSrc, basename, type Storage, type Listing, type Hit, type SearchProgress, type Preview } from "./lib/api";
  import StorageSheet from "./lib/StorageSheet.svelte";
  import Icon from "./lib/Icon.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { loadThemes, applyTheme, pickInitial, themeName, type Theme } from "./lib/theme";

  let themes: Theme[] = [];
  let theme: Theme | null = null;
  let userThemesDir = "";

  function selectTheme(t: Theme) {
    theme = t;
    applyTheme(t);
  }

  function closePopovers() { showPicker = false; showSettings = false; }

  function onThemeChange(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    const next = themes.find((x) => x.id === id);
    if (next) selectTheme(next);
  }

  function onLangChange(e: Event) {
    lang.set((e.currentTarget as HTMLSelectElement).value as Lang);
  }

  let storages: Storage[] = [];
  let activeId: string | null = null;
  let buckets: string[] = [];
  let bucket: string | null = null;
  let prefix = "";
  let listing: Listing = { prefix: "", folders: [], files: [] };
  let selected: string | null = null;
  let selectedBucket: string | null = null;
  let history: string[] = [];
  let future: string[] = [];
  let busy = false;
  let pending = 0;
  let navSeq = 0;
  let error = "";
  let dragging = false;

  let showPicker = false;
  let sheet: { open: boolean; storage: Storage | null } = { open: false, storage: null };

  // Bucket anlegen
  let creatingBucket = false;
  let newBucket = "";

  // Bucket-Filter in der Sidebar
  let bucketQuery = "";
  let bucketSearchOpen = false;
  // Lange Bucket-Listen werden gekappt, sonst schiebt die Sidebar alles andere weg.
  const BUCKET_LIMIT = 10;
  let bucketsExpanded = false;

  let showSettings = false;

  // Sidebar-Breite: lange Bucket-Namen passen sonst nicht rein.
  const SIDEBAR_MIN = 200, SIDEBAR_MAX = 520;
  let sidebarWidth = Number(localStorage.getItem("sidebar-width")) || 232;

  function setSidebarWidth(px: number) {
    sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, px));
    localStorage.setItem("sidebar-width", String(sidebarWidth));
  }

  function onResizerKeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === "ArrowLeft") { e.preventDefault(); setSidebarWidth(sidebarWidth - step); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setSidebarWidth(sidebarWidth + step); }
    else if (e.key === "Home") { e.preventDefault(); setSidebarWidth(232); }
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX, startWidth = sidebarWidth;
    const move = (ev: MouseEvent) => {
      sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + ev.clientX - startX));
    };
    const up = () => {
      setSidebarWidth(sidebarWidth);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // Suche: query filtert sofort den aktuellen Ordner. searchMode zeigt stattdessen
  // die Treffer eines expliziten Scans ueber alle Buckets.
  let query = "";
  let searchMode = false;
  let searching = false;
  let hits: Hit[] = [];
  let progress: SearchProgress = { bucket: "", scanned: 0, hits: 0 };
  let searchInfo = { truncated: false, cancelled: false, skipped: [] as string[] };

  const PAGE_SIZE = 100;
  const SEARCH_LIMIT = 1000;
  let page = 0;

  // Suchleiste in der Toolbar: eingeklappt nur ein Icon.
  let searchOpen = false;

  function openSearch() { searchOpen = true; }

  /// Klappt die Suchleiste zu, sobald der Fokus sie verlaesst. Laeuft eine
  /// Suche oder steht etwas im Feld, bleibt sie offen - eine gefilterte Liste
  /// ohne sichtbares Suchfeld waere nicht nachvollziehbar.
  /// Gleiches Verhalten fuer den Bucket-Filter in der Seitenleiste. Wandert der
  /// Fokus auf den Lupen-Knopf selbst, bleibt das Zuklappen ihm ueberlassen -
  /// sonst wuerde sein Umschalten das Feld sofort wieder oeffnen.
  function onBucketFilterFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as HTMLElement | null;
    if (next?.closest(".bucket-search-toggle")) return;
    const box = e.currentTarget as HTMLElement;
    if (next && box.contains(next)) return;
    if (bucketQuery.trim()) return;
    bucketSearchOpen = false;
  }

  function onSearchFocusOut(e: FocusEvent) {
    if (!searchOpen) return;
    const slot = e.currentTarget as HTMLElement;
    const next = e.relatedTarget as Node | null;
    if (next && slot.contains(next)) return;
    if (query.trim() || searchMode || searching) return;
    searchOpen = false;
  }

  function closeSearch() {
    searchOpen = false;
    clearSearch();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openSearch();
    } else if (e.key === "Escape" && searchOpen) {
      closeSearch();
    }
  }

  // Vorschau der angeklickten Datei
  let preview: Preview | null = null;
  let previewKey: string | null = null;
  let previewBucket: string | null = null;
  let previewLoading = false;
  let previewError = "";
  let previewSeq = 0;

  type Row = {
    kind: "folder" | "file";
    key: string;
    name: string;
    bucket: string | null;
    size: number;
    modified: string | null;
  };

  $: active = storages.find((s) => s.id === activeId) ?? null;
  $: crumbs = prefix.split("/").filter(Boolean);

  $: allRows = searchMode
    ? hits.map((h): Row => ({
        kind: "file", key: h.key, name: h.name, bucket: h.bucket,
        size: h.size, modified: h.last_modified,
      }))
    : [
        ...listing.folders.map((f): Row => ({
          kind: "folder", key: f, name: basename(f.slice(0, -1)),
          bucket, size: 0, modified: null,
        })),
        ...listing.files.map((f): Row => ({
          kind: "file", key: f.key, name: f.name, bucket,
          size: f.size, modified: f.last_modified,
        })),
      ];

  // Im Suchmodus hat das Backend schon gefiltert, sonst filtern wir lokal.
  $: needle = query.trim().toLowerCase();
  $: rows = !searchMode && needle
    ? allRows.filter((r) => r.name.toLowerCase().includes(needle))
    : allRows;

  $: pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  $: if (page > pageCount - 1) page = pageCount - 1;
  $: pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  $: totalSize = rows.reduce((a, r) => a + r.size, 0);

  $: matchedBuckets = bucketQuery.trim()
    ? buckets.filter((b) => b.toLowerCase().includes(bucketQuery.trim().toLowerCase()))
    : buckets;
  $: bucketOverflow = Math.max(0, matchedBuckets.length - BUCKET_LIMIT);
  $: sortedThemes = [...themes].sort((a, b) =>
    themeName(a, $lang).localeCompare(themeName(b, $lang), $lang));
  $: visibleBuckets =
    bucketsExpanded || bucketOverflow === 0 ? matchedBuckets : matchedBuckets.slice(0, BUCKET_LIMIT);
  $: newBucketError = ($t, validateBucketName(newBucket));
  $: previewUrl =
    activeId && previewBucket && previewKey ? previewSrc(activeId, previewBucket, previewKey) : "";

  function validateBucketName(n: string): string {
    const v = n.trim();
    if (!v) return "";
    if (v.length < 3 || v.length > 63) return $t("bucket_err_length");
    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(v)) return $t("bucket_err_chars");
    if (v.includes("..")) return $t("bucket_err_dots");
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return $t("bucket_err_ip");
    if (buckets.includes(v)) return $t("bucket_err_exists");
    return "";
  }

  function focusNode(el: HTMLElement) { el.focus(); }

  onMount(async () => {
    themes = await loadThemes();
    const initial = pickInitial(themes);
    if (initial) { theme = initial; applyTheme(initial); }
    invoke<string>("user_themes_dir").then((d) => (userThemesDir = d)).catch(() => {});
    await listen<SearchProgress>("search-progress", (e) => (progress = e.payload));
    await loadStorages();
    const webview = getCurrentWebview();
    await webview.onDragDropEvent(async (e) => {
      if (e.payload.type === "enter" || e.payload.type === "over") dragging = true;
      else if (e.payload.type === "leave") dragging = false;
      else if (e.payload.type === "drop") {
        dragging = false;
        await uploadPaths(e.payload.paths);
      }
    });
  });

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    pending++; busy = true; error = "";
    try { return await fn(); }
    catch (e) { error = String(e); }
    finally { pending--; busy = pending > 0; }
  }

  async function loadStorages() {
    const res = await run(() => api.listStorages());
    if (!res) return;
    storages = res.storages;
    activeId = res.active_id;
    if (activeId) await loadBuckets();
    else if (storages.length === 0) sheet = { open: true, storage: null };
  }

  async function loadBuckets() {
    if (!activeId) return;
    buckets = (await run(() => api.listBuckets(activeId!))) ?? [];
    bucket = buckets[0] ?? null;
    history = []; future = [];
    await navigate("", false);
  }

  async function navigate(newPrefix: string, pushHistory = true) {
    if (!activeId || !bucket) { listing = { prefix: "", folders: [], files: [] }; return; }
    if (pushHistory && newPrefix !== prefix) { history = [...history, prefix]; future = []; }
    prefix = newPrefix;
    selected = null;
    selectedBucket = bucket;
    clearPreview();
    page = 0;
    // Nur die zuletzt gestartete Navigation darf das Listing setzen - sonst
    // ueberschreibt eine langsamere aeltere Antwort den neuen Ordner.
    const seq = ++navSeq;
    const storageId = activeId, b = bucket, target = newPrefix;
    const res = await run(() => api.listObjects(storageId, b, target));
    if (seq !== navSeq) return;
    if (res) listing = res;
  }

  function back() { const p = history.pop(); if (p !== undefined) { future = [prefix, ...future]; history = history; navigate(p, false); } }
  function forward() { const p = future.shift(); if (p !== undefined) { history = [...history, prefix]; future = future; navigate(p, false); } }

  async function selectBucket(b: string) {
    if (searchMode) clearSearch();
    bucket = b; history = []; future = [];
    await navigate("", false);
  }

  async function selectStorage(id: string) {
    showPicker = false;
    await run(() => api.setActiveStorage(id));
    activeId = id;
    await loadBuckets();
  }

  async function createBucket() {
    const name = newBucket.trim();
    if (!activeId || !name || newBucketError) return;
    await run(() => api.createBucket(activeId!, name));
    if (error) return;
    creatingBucket = false;
    newBucket = "";
    buckets = (await run(() => api.listBuckets(activeId!))) ?? buckets;
    await selectBucket(name);
  }

  async function searchAllBuckets() {
    const q = query.trim();
    if (!activeId || !q || buckets.length === 0) return;
    searching = true;
    searchMode = true;
    hits = [];
    page = 0;
    selected = null;
    clearPreview();
    progress = { bucket: "", scanned: 0, hits: 0 };
    searchInfo = { truncated: false, cancelled: false, skipped: [] };
    const res = await run(() => api.searchObjects(activeId!, buckets, q, SEARCH_LIMIT));
    searching = false;
    if (res) {
      hits = res.hits;
      searchInfo = { truncated: res.truncated, cancelled: res.cancelled, skipped: res.skipped };
    }
  }

  function stopSearch() { api.cancelSearch().catch(() => {}); }

  /// Zurueck zur Ordneransicht, Suchfeld bleibt unveraendert.
  function exitSearchMode() {
    if (searching) stopSearch();
    clearPreview();
    searchMode = false;
    hits = [];
    searchInfo = { truncated: false, cancelled: false, skipped: [] };
    page = 0;
    selected = null;
    selectedBucket = bucket;
  }

  function clearSearch() {
    exitSearchMode();
    query = "";
  }

  function selectRow(r: Row) {
    selected = r.key;
    selectedBucket = r.bucket;
    loadPreview(r);
  }

  function clearPreview() {
    previewSeq++;
    preview = null;
    previewKey = null;
    previewBucket = null;
    previewLoading = false;
    previewError = "";
  }

  async function loadPreview(r: Row) {
    if (r.kind === "folder" || !activeId || !r.bucket) { clearPreview(); return; }
    // Wie bei navigate: nur die zuletzt angeforderte Vorschau darf anzeigen.
    const seq = ++previewSeq;
    previewKey = r.key;
    previewBucket = r.bucket;
    preview = null;
    previewError = "";
    previewLoading = true;
    try {
      const res = await api.previewObject(activeId, r.bucket, r.key);
      if (seq !== previewSeq) return;
      preview = res;
    } catch (e) {
      if (seq !== previewSeq) return;
      previewError = String(e);
    } finally {
      if (seq === previewSeq) previewLoading = false;
    }
  }

  async function openRow(r: Row) {
    if (r.kind === "folder") { await navigate(r.key); return; }
    if (!searchMode) return;
    // Treffer aus der globalen Suche: zum Ordner des Objekts springen.
    const folder = r.key.includes("/") ? r.key.slice(0, r.key.lastIndexOf("/") + 1) : "";
    const targetBucket = r.bucket;
    const targetKey = r.key;
    clearSearch();
    if (targetBucket && targetBucket !== bucket) { bucket = targetBucket; history = []; future = []; }
    await navigate(folder, false);
    selected = targetKey;
    selectedBucket = targetBucket;
  }

  async function pickAndUpload() {
    const files = await open({ multiple: true });
    if (!files) return;
    await uploadPaths(Array.isArray(files) ? files : [files]);
  }

  async function uploadPaths(paths: string[]) {
    if (!activeId || !bucket) return;
    for (const p of paths) {
      await run(() => api.uploadFile(activeId!, bucket!, prefix + basename(p), p));
    }
    await navigate(prefix, false);
  }

  async function deleteSelected() {
    const target = selectedBucket ?? bucket;
    if (!selected || !activeId || !target) return;
    const isFolder = selected.endsWith("/");
    const ok = await ask(
      isFolder
        ? $t("del_folder_q", { name: basename(selected.slice(0, -1)) })
        : $t("del_file_q", { name: basename(selected) }),
      { title: $t("del_title"), kind: "warning", okLabel: $t("delete"), cancelLabel: $t("cancel") }
    );
    if (!ok) return;
    await run(() => api.deleteObject(activeId!, target, selected!));
    clearPreview();
    if (searchMode) { hits = hits.filter((h) => !(h.bucket === target && h.key === selected)); selected = null; }
    else await navigate(prefix, false);
  }

  async function onSheetSaved(e: CustomEvent<Storage>) {
    sheet = { open: false, storage: null };
    await loadStorages();
    if (!activeId) await selectStorage(e.detail.id);
    else if (activeId === e.detail.id) await loadBuckets();
  }

  async function onSheetDeleted() {
    sheet = { open: false, storage: null };
    activeId = null; buckets = []; bucket = null;
    await loadStorages();
  }
</script>

<svelte:window on:click={closePopovers} on:keydown={onWindowKeydown} />

<div class="window" class:dragging>
  <aside class="sidebar" data-tauri-drag-region style="width:{sidebarWidth}px">
    <div class="traffic" data-tauri-drag-region></div>

    <div class="brand" data-tauri-drag-region>
      <img class="brand-mark" src={theme?.appearance === "light" ? markOnLight : markOnDark}
        width="19" height="20" alt="" aria-hidden="true" />
      <div class="brand-name">kuebel</div>
    </div>

    <div class="section section-row">
      <span>{$t("buckets")}</span>
      <div class="section-actions">
        <button class="add-bucket bucket-search-toggle" aria-label={$t("bucket_search")} disabled={buckets.length === 0}
          on:click|stopPropagation={() => {
            bucketSearchOpen = !bucketSearchOpen;
            if (!bucketSearchOpen) bucketQuery = "";
          }}>
          <Icon name="search" size={12} color="var(--text-secondary)" />
        </button>
        <button class="add-bucket" aria-label={$t("bucket_new")} disabled={!active}
          on:click|stopPropagation={() => { creatingBucket = !creatingBucket; newBucket = ""; }}>
          <Icon name="plus" size={13} color="var(--text-secondary)" />
        </button>
      </div>
    </div>
    {#if bucketSearchOpen}
      <div class="bucket-filter" on:focusout={onBucketFilterFocusOut}>
        <input use:focusNode bind:value={bucketQuery} spellcheck="false" placeholder={$t("bucket_filter")}
          on:keydown={(e) => { if (e.key === "Escape") { bucketSearchOpen = false; bucketQuery = ""; } }} />
      </div>
    {/if}
    <nav class="buckets">
      {#each visibleBuckets as b}
        <button class="bucket" class:active={b === bucket} title={b} on:click={() => selectBucket(b)}>
          <Icon name="bucket" color={b === bucket ? "var(--text)" : "var(--text-secondary)"} />
          <span>{b}</span>
        </button>
      {/each}
      {#if bucketOverflow > 0}
        <button class="bucket-more" on:click={() => (bucketsExpanded = !bucketsExpanded)}>
          {bucketsExpanded ? $t("bucket_less") : $t("bucket_more", { n: bucketOverflow })}
        </button>
      {/if}
      {#if bucketQuery.trim() && matchedBuckets.length === 0}
        <div class="empty">{$t("bucket_none_matching")}</div>
      {/if}
      {#if creatingBucket}
        <form class="new-bucket" on:submit|preventDefault={createBucket}>
          <input use:focusNode bind:value={newBucket} placeholder={$t("bucket_name_placeholder")} spellcheck="false"
            on:keydown={(e) => { if (e.key === "Escape") { creatingBucket = false; newBucket = ""; } }} />
          {#if newBucketError}<div class="field-error">{newBucketError}</div>{/if}
        </form>
      {/if}
      {#if buckets.length === 0 && active && !creatingBucket && !bucketQuery.trim()}
        <div class="empty">{$t("bucket_none")}</div>
      {/if}
    </nav>

    <div class="spacer"></div>

    <div class="storage-block">
      <div class="section">{$t("storage")}</div>
      <button class="switcher" on:click|stopPropagation={() => (showPicker = !showPicker)}>
        <i class="dot" class:ok={!!active && !error}></i>
        <div class="switcher-text">
          <div class="switcher-name">{active?.name ?? $t("storage_none")}</div>
          <div class="switcher-endpoint">{active?.endpoint.replace(/^https?:\/\//, "") ?? $t("storage_add_hint")}</div>
        </div>
        <Icon name="updown" size={12} color="var(--text-secondary)" />
      </button>

      {#if showPicker}
        <div class="popover" role="presentation" on:click|stopPropagation>
          {#each storages as s}
            <div class="popover-row" class:active={s.id === activeId}>
              <button class="popover-main" on:click={() => selectStorage(s.id)}>
                <i class="dot" class:ok={s.id === activeId}></i>
                <div class="switcher-text">
                  <div class="switcher-name">{s.name}</div>
                  <div class="switcher-endpoint">{s.endpoint.replace(/^https?:\/\//, "")}</div>
                </div>
                {#if s.id === activeId}<Icon name="check" size={14} />{/if}
              </button>
              <button class="popover-edit" aria-label={$t("edit")} on:click={() => { showPicker = false; sheet = { open: true, storage: s }; }}>
                <Icon name="edit" size={13} color="var(--text-secondary)" />
              </button>
            </div>
          {/each}
          {#if storages.length > 0}<div class="popover-sep"></div>{/if}
          <button class="popover-add" on:click={() => { showPicker = false; sheet = { open: true, storage: null }; }}>
            <Icon name="plus" size={14} />
            <span>{$t("storage_add")}</span>
          </button>
        </div>
      {/if}
    </div>

    <div class="settings-block">
      <button class="settings-trigger" aria-label={$t("settings_open")}
        on:click|stopPropagation={() => { showPicker = false; showSettings = !showSettings; }}>
        <Icon name="theme" size={14} color="var(--text-secondary)" />
        <span>{$t("settings")}</span>
        <Icon name="updown" size={12} color="var(--text-secondary)" />
      </button>

      {#if showSettings}
        <div class="popover settings-popover" role="presentation" on:click|stopPropagation>
          <div class="setting">
            <span class="setting-label">{$t("theme")}</span>
            <select class="setting-select" value={theme?.id ?? ""} on:change={onThemeChange}>
              {#each sortedThemes as x}<option value={x.id}>{themeName(x, $lang)}</option>{/each}
            </select>
          </div>

          <div class="setting">
            <span class="setting-label">{$t("language")}</span>
            <select class="setting-select" value={$lang} on:change={onLangChange}>
              {#each LANGS as l}<option value={l.id}>{l.label}</option>{/each}
            </select>
          </div>

          {#if userThemesDir}
            <div class="popover-sep"></div>
            <div class="theme-dir" title={userThemesDir}>{userThemesDir}</div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Ein fokussierbarer separator ist laut ARIA ein Splitter-Widget; Svelte
         kennt die Ausnahme nicht und meldet ihn faelschlich als nicht-interaktiv. -->
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="resizer" role="separator" tabindex="0" aria-orientation="vertical"
      aria-label={$t("sidebar_resize")}
      aria-valuenow={sidebarWidth} aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX}
      title={$t("sidebar_resize_hint")}
      on:mousedown={startResize} on:keydown={onResizerKeydown}></div>
  </aside>

  <main class="main">
    <header class="toolbar" data-tauri-drag-region>
      <div class="nav">
        <button aria-label={$t("nav_back")} disabled={history.length === 0} on:click={back}><Icon name="left" size={14} /></button>
        <button aria-label={$t("nav_forward")} disabled={future.length === 0} on:click={forward}><Icon name="right" size={14} /></button>
      </div>
      <nav class="crumbs" data-tauri-drag-region>
        {#if bucket}
          <button class="crumb" class:last={crumbs.length === 0} on:click={() => navigate("")}>{bucket}</button>
          {#each crumbs as c, i}
            <span class="sep">/</span>
            <button class="crumb" class:last={i === crumbs.length - 1}
              on:click={() => navigate(crumbs.slice(0, i + 1).join("/") + "/")}>{c}</button>
          {/each}
        {/if}
      </nav>
      <div class="search-slot" on:focusout={onSearchFocusOut}>
        {#if searchOpen}
          <div class="search">
            <Icon name="search" size={13} color="var(--text-muted)" />
            <input use:focusNode bind:value={query} spellcheck="false"
              placeholder={searchMode ? $t("search_hits") : $t("search_folder")}
              on:input={() => { if (searchMode) exitSearchMode(); page = 0; }}
              on:keydown={(e) => { if (e.key === "Enter") searchAllBuckets(); }} />
            {#if query || searchMode}
              <button class="clear" aria-label={$t("search_reset")} on:click={clearSearch}>
                <Icon name="close" size={11} color="var(--text-muted)" />
              </button>
            {/if}
          </div>
          {#if searching}
            <button class="ghost" on:click={stopSearch}>{$t("cancel")}</button>
          {:else}
            <button class="ghost" title={$t("search_all_title")}
              disabled={!query.trim() || buckets.length === 0} on:click={searchAllBuckets}>
              {$t("search_all")}
            </button>
          {/if}
        {:else}
          <button class="icon-btn" aria-label="{$t('search')} (⌘F)" title="{$t('search')} (⌘F)" on:click={openSearch}>
            <Icon name="search" size={15} />
          </button>
        {/if}
      </div>

      <div class="actions">
        <button class="icon-btn" aria-label={$t("delete")} disabled={!selected} on:click={deleteSelected}><Icon name="trash" size={15} /></button>
        <button class="primary" disabled={!bucket || busy} on:click={pickAndUpload}>
          <Icon name="upload" size={14} color="var(--accent-text)" />
          <span>{$t("upload")}</span>
        </button>
      </div>
    </header>


    <div class="body">
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            {#if searchMode}<th class="c-bucket">{$t("col_bucket")}</th>{/if}
            <th>{$t("col_name")}</th>
            <th class="c-date">{$t("col_modified")}</th>
            <th class="c-size r">{$t("col_size")}</th>
          </tr>
        </thead>
        <tbody>
          {#each pageRows as r (r.bucket + "|" + r.key)}
            <tr class:selected={selected === r.key && selectedBucket === r.bucket}
              tabindex="0"
              on:click={() => selectRow(r)}
              on:dblclick={() => openRow(r)}
              on:keydown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); selectRow(r); openRow(r); }
              }}>
              {#if searchMode}<td class="c-bucket gray">{r.bucket}</td>{/if}
              <td>
                <div class="name">
                  <Icon name={r.kind === "folder" ? "folder" : "file"} />
                  <span class={r.kind === "folder" ? "folder-name" : "mono"}
                    title={searchMode ? r.key : r.name}>{searchMode ? r.key : r.name}</span>
                </div>
              </td>
              <td class="c-date {r.kind === 'folder' ? 'muted' : 'gray'}">
                {r.kind === "folder" ? "–" : $fmt.date(r.modified)}
              </td>
              <td class="c-size r {r.kind === 'folder' ? 'muted' : 'mono'}">
                {r.kind === "folder" ? "–" : $fmt.size(r.size)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !busy && pageRows.length === 0}
        <div class="empty-state">
          {#if searchMode}{$t("empty_hits")}
          {:else if needle}{$t("empty_filter")}
          {:else if bucket}{$t("empty_folder")}
          {/if}
        </div>
      {/if}
    </div>

    {#if previewKey}
      <aside class="preview">
        <div class="preview-head">
          <div class="preview-name mono" title={previewKey}>{basename(previewKey)}</div>
          <button class="clear" aria-label={$t("preview_close")} on:click={clearPreview}>
            <Icon name="close" size={11} color="var(--text-muted)" />
          </button>
        </div>

        <div class="preview-body">
          {#if previewLoading}
            <div class="preview-note">{$t("loading")}</div>
          {:else if previewError}
            <div class="preview-note error">{previewError}</div>
          {:else if preview}
            {#if preview.kind === "image"}
              <img class="preview-img" src={previewUrl} alt={basename(previewKey)} />
            {:else if preview.kind === "pdf"}
              <iframe class="preview-pdf" src={previewUrl} title={basename(previewKey)}></iframe>
            {:else if preview.kind === "text"}
              <pre class="preview-text">{preview.text}</pre>
              {#if preview.truncated}
                <div class="preview-note">{$t("preview_truncated")}</div>
              {/if}
            {:else}
              <div class="preview-note">{$t("preview_unsupported")}</div>
            {/if}
          {/if}
        </div>

        {#if preview}
          <dl class="preview-meta">
            <dt>{$t("meta_size")}</dt><dd class="mono">{$fmt.size(preview.size)}</dd>
            <dt>{$t("meta_type")}</dt><dd class="mono">{preview.content_type ?? $t("unknown")}</dd>
            <dt>{$t("meta_modified")}</dt><dd>{$fmt.date(preview.last_modified)}</dd>
            {#if preview.etag}<dt>{$t("meta_etag")}</dt><dd class="mono etag" title={preview.etag}>{preview.etag}</dd>{/if}
            <dt>{$t("meta_path")}</dt><dd class="mono etag" title={previewKey}>{previewKey}</dd>
          </dl>
        {/if}
      </aside>
    {/if}
    </div>

    <footer class="status">
      <div class="status-text">
        {#if error}<span class="error">{error}</span>
        {:else if searching}
          {$t("searching", {
            where: progress.bucket ? $t("searching_in", { bucket: progress.bucket }) : "",
            scanned: $fmt.number(progress.scanned),
            hits: progress.hits,
          })}
        {:else if busy}{$t("loading")}
        {:else if searchMode}
          {$t("hits_summary", { hits: hits.length, buckets: buckets.length })}{searchInfo.truncated ? $t("hits_truncated", { limit: SEARCH_LIMIT }) : ""}{searchInfo.cancelled ? $t("hits_cancelled") : ""}{searchInfo.skipped.length ? $t("hits_skipped", { n: searchInfo.skipped.length }) : ""}
        {:else}{rows.length === 1 ? $t("objects_one") : $t("objects_many", { n: $fmt.number(rows.length) })}{selected ? $t("one_selected") : ""}{/if}
      </div>
      {#if pageCount > 1}
        <div class="pager">
          <button aria-label={$t("page_prev")} disabled={page === 0} on:click={() => page--}>
            <Icon name="left" size={11} color="var(--text-secondary)" />
          </button>
          <span>{$t("page_of", { page: page + 1, total: pageCount })}</span>
          <button aria-label={$t("page_next")} disabled={page >= pageCount - 1} on:click={() => page++}>
            <Icon name="right" size={11} color="var(--text-secondary)" />
          </button>
        </div>
      {/if}
      <div class="mono">{$fmt.size(totalSize)}</div>
    </footer>
  </main>

  {#if dragging}
    <div class="drop-overlay"><div class="drop-box">{$t("drop_here")}</div></div>
  {/if}

  {#if sheet.open}
    <StorageSheet storage={sheet.storage}
      on:saved={onSheetSaved} on:deleted={onSheetDeleted}
      on:cancel={() => (sheet = { open: false, storage: null })} />
  {/if}
</div>

<style>
  .window { display: flex; height: 100vh; position: relative; }

  .sidebar { flex-shrink: 0; position: relative; display: flex; flex-direction: column; background: var(--sidebar); border-right: 1px solid var(--hairline); }
  .traffic { height: 52px; }
  .brand { padding: 0 20px 20px; display: flex; align-items: center; gap: 9px; min-width: 0; }
  .brand-mark { display: block; flex-shrink: 0; height: 20px; width: auto; }
  .brand-name { font-size: 15px; font-weight: 600; letter-spacing: -0.2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .section { padding: 0 20px 6px; font-size: 11px; font-weight: 500; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text-secondary); }
  .section-row { display: flex; align-items: center; justify-content: space-between; padding-right: 14px; }
  .section-actions { display: flex; align-items: center; gap: 2px; }
  .bucket-filter { padding: 0 10px 6px; }
  .bucket-filter input { width: 100%; height: 28px; padding: 0 10px; border: 1px solid var(--accent); background: var(--surface); border-radius: var(--radius); font-size: 12px; color: var(--text); }
  .resizer { position: absolute; top: 0; right: -3px; width: 6px; height: 100%; padding: 0; border: none; background: transparent; cursor: col-resize; z-index: 5; }
  .resizer:hover { background: var(--accent); opacity: 0.25; }
  .resizer:focus-visible { background: var(--accent); opacity: 0.5; outline: none; }
  .add-bucket { width: 20px; height: 20px; border-radius: 5px; display: flex; align-items: center; justify-content: center; }
  .add-bucket:hover:not(:disabled) { background: var(--hover); }
  .add-bucket:disabled { opacity: 0.3; cursor: default; }
  .new-bucket { padding: 4px 0 2px; display: flex; flex-direction: column; gap: 4px; }
  .new-bucket input { height: 30px; padding: 0 10px; border: 1px solid var(--accent); background: var(--surface); border-radius: var(--radius); font-family: var(--mono); font-size: 12px; color: var(--text); width: 100%; }
  .field-error { padding: 0 10px; font-size: 11px; color: var(--danger); }
  .buckets { display: flex; flex-direction: column; padding: 0 10px; overflow-y: auto; }
  .bucket { display: flex; align-items: center; gap: 9px; height: 28px; flex-shrink: 0; padding: 0 10px; border-radius: var(--radius); text-align: left; transition: background 120ms; }
  .bucket-more { height: 26px; padding: 0 10px; margin-top: 2px; border-radius: var(--radius); text-align: left; font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
  .bucket-more:hover { background: var(--hover); color: var(--text); }
  .bucket:hover { background: var(--hover); }
  .bucket.active { background: var(--surface); font-weight: 500; box-shadow: 0 1px 2px var(--shadow); }
  .bucket span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { padding: 6px 10px; color: var(--text-muted); }
  .spacer { flex: 1; }

  .storage-block { position: relative; padding: 12px 10px; border-top: 1px solid var(--hairline); }
  .settings-block { position: relative; padding: 8px 10px; border-top: 1px solid var(--hairline); }
  .settings-trigger { display: flex; align-items: center; gap: 9px; width: 100%; height: 30px; padding: 0 10px; border-radius: var(--radius); text-align: left; font-size: 12px; color: var(--text-secondary); }
  .settings-trigger span { flex: 1; }
  .settings-trigger:hover { background: var(--hover); color: var(--text); }
  .settings-popover { padding: 8px 6px 6px; }
  .setting { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 8px 8px; }
  .setting-label { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
  .setting-select { flex: 1; min-width: 0; max-width: 150px; height: 26px; padding: 0 6px; border: 1px solid var(--hairline); background: var(--input); color: var(--text); border-radius: var(--radius); font-family: inherit; font-size: 12px; }
  .storage-block .section { padding: 0 10px 8px; }
  .switcher, .popover-main { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px; border-radius: var(--radius); text-align: left; width: 100%; }
  .switcher { border: 1px solid var(--hairline); background: var(--surface); }
  .switcher-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .switcher-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .switcher-endpoint { font-family: var(--mono); font-size: 10px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { width: 6px; height: 6px; border-radius: 3px; background: var(--text-muted); flex-shrink: 0; }
  .dot.ok { background: var(--success); }

  .popover { position: absolute; left: 10px; bottom: calc(100% - 4px); width: 264px; padding: 6px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; box-shadow: 0 12px 32px var(--shadow); display: flex; flex-direction: column; gap: 2px; z-index: 10; }
  .popover-row { display: flex; align-items: center; border-radius: var(--radius); }
  .popover-row:hover { background: var(--hover); }
  .popover-row.active { background: var(--selection); }
  .popover-row.active .switcher-name { font-weight: 500; }
  .popover-edit { width: 32px; height: 44px; display: flex; align-items: center; justify-content: center; opacity: 0; }
  .popover-row:hover .popover-edit { opacity: 1; }
  .popover-sep { height: 1px; background: var(--hairline); margin: 4px 6px; }
  .popover-add { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: var(--radius); font-weight: 500; }
  .popover-add:hover { background: var(--hover); }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .toolbar { height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid var(--hairline); }
  .nav { display: flex; gap: 4px; }
  .nav button { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
  .nav button:disabled { opacity: 0.3; cursor: default; }
  .nav button:not(:disabled):hover { background: var(--hover); }
  .crumbs { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
  .crumb { color: var(--text-secondary); white-space: nowrap; }
  .crumb:hover { color: var(--text); }
  .crumb.last { color: var(--text); font-weight: 600; }
  .sep { color: var(--text-muted); }
  .actions { display: flex; gap: 8px; align-items: center; }
  .icon-btn { width: 32px; height: 32px; border: 1px solid var(--hairline); background: var(--surface); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; }
  .icon-btn:disabled { opacity: 0.35; cursor: default; }
  .primary { height: 32px; padding: 0 14px; background: var(--accent); color: var(--accent-text); border-radius: var(--radius); display: flex; align-items: center; gap: 8px; font-weight: 500; }
  .primary:disabled { opacity: 0.4; cursor: default; }

  .search-slot { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .search { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; width: 240px; flex-shrink: 0; border: 1px solid var(--accent); background: var(--surface); border-radius: var(--radius); }
  .search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--text); font-size: 12px; }
  .search input::placeholder { color: var(--text-muted); }
  .clear { width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .clear:hover { background: var(--hover); }
  .ghost { height: 32px; padding: 0 12px; border: 1px solid var(--hairline); background: var(--surface); border-radius: var(--radius); font-size: 12px; color: var(--text); flex-shrink: 0; }
  .ghost:hover:not(:disabled) { background: var(--hover); }
  .ghost:disabled { opacity: 0.4; cursor: default; }

  .body { flex: 1; min-height: 0; display: flex; }
  .table-wrap { flex: 1; min-width: 0; overflow-y: auto; }

  .preview { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--hairline); background: var(--sidebar); }
  .preview-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--hairline); }
  .preview-name { flex: 1; min-width: 0; font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview-body { flex: 1; min-height: 0; overflow: auto; padding: 12px; display: flex; flex-direction: column; }
  .preview-pdf { width: 100%; height: 100%; min-height: 420px; border: none; border-radius: var(--radius); background: var(--surface); }
  .preview-img { max-width: 100%; height: auto; display: block; border-radius: var(--radius); background: var(--surface); }
  .preview-text { margin: 0; font-family: var(--mono); font-size: 11px; line-height: 1.5; color: var(--text); white-space: pre-wrap; word-break: break-word; }
  .preview-note { padding: 8px 0; font-size: 11px; color: var(--text-secondary); }
  .preview-meta { margin: 0; padding: 10px 12px; border-top: 1px solid var(--hairline); display: grid; grid-template-columns: 62px minmax(0, 1fr); gap: 4px 10px; font-size: 11px; }
  .preview-meta dt { color: var(--text-secondary); }
  .preview-meta dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview-meta .mono { font-size: 10px; }
  .etag { direction: rtl; text-align: left; }
  .table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .table th { position: sticky; top: 0; z-index: 1; background: var(--background); padding: 10px 10px 8px; text-align: left; font-size: 11px; font-weight: 500; letter-spacing: 0.6px; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--hairline); }
  .table th:first-child { padding-left: 20px; }
  .table th:last-child { padding-right: 20px; }
  .table td { padding: 0 10px; height: 36px; vertical-align: middle; overflow: hidden; }
  .table td:first-child { padding-left: 20px; }
  .table td:last-child { padding-right: 20px; }
  .c-bucket { width: 160px; }
  .c-date { width: 150px; }
  .c-size { width: 110px; }
  .table tbody tr { cursor: default; outline: none; transition: background 120ms; }
  .table tbody tr:hover { background: var(--hover); }
  .table tbody tr.selected { background: var(--selection); }
  .table tbody tr:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
  .name { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .folder-name { font-weight: 500; }
  .mono { font-family: var(--mono); font-size: 12px; }
  .gray { color: var(--text-secondary); }
  .muted { color: var(--text-muted); }
  .r { text-align: right; }
  .empty-state { padding: 60px 0; text-align: center; color: var(--text-muted); }

  .status { height: 36px; display: flex; align-items: center; gap: 16px; padding: 0 20px; border-top: 1px solid var(--hairline); font-size: 11px; color: var(--text-secondary); }
  .status-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pager { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .pager button { width: 22px; height: 22px; border-radius: 5px; display: flex; align-items: center; justify-content: center; }
  .pager button:hover:not(:disabled) { background: var(--hover); }
  .pager button:disabled { opacity: 0.3; cursor: default; }
  .status .mono { font-size: 11px; }
  .error { color: var(--danger); }

  .theme-dir { padding: 4px 10px 6px; font-family: var(--mono); font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: text; }

  .drop-overlay { position: absolute; inset: 0; background: color-mix(in srgb, var(--background) 85%, transparent); display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 20; }
  .drop-box { padding: 24px 40px; border: 1px dashed var(--text); border-radius: 12px; font-size: 15px; font-weight: 500; }
</style>
