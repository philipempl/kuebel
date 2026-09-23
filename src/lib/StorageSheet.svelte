<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { api, type Storage } from "./api";
  import { t } from "./i18n";

  export let storage: Storage | null = null;
  const dispatch = createEventDispatcher<{ saved: Storage; deleted: void; cancel: void }>();

  let name = storage?.name ?? "";
  let endpoint = storage?.endpoint ?? "";
  let region = storage?.region ?? "";
  let pathStyle = storage?.path_style ?? true;
  let accessKey = "";
  let secretKey = "";
  let busy = false;
  let message = "";
  let messageOk = false;

  $: valid = name.trim() && endpoint.trim() && (storage || (accessKey && secretKey));

  function input() {
    return {
      id: storage?.id,
      name, endpoint, region,
      path_style: pathStyle,
      access_key: accessKey || undefined,
      secret_key: secretKey || undefined,
    };
  }

  async function test() {
    busy = true; message = "";
    try {
      const buckets = await api.testConnection(input());
      messageOk = true;
      message = buckets.length === 1
        ? $t("connected", { n: buckets.length })
        : $t("connected_many", { n: buckets.length });
    } catch (e) {
      messageOk = false;
      message = String(e);
    } finally { busy = false; }
  }

  async function save() {
    busy = true; message = "";
    try {
      const saved = await api.saveStorage(input());
      dispatch("saved", saved);
    } catch (e) {
      messageOk = false;
      message = String(e);
    } finally { busy = false; }
  }

  async function remove() {
    if (!storage) return;
    const ok = await ask($t("remove_q", { name: storage.name }),
      { title: $t("remove_title"), kind: "warning", okLabel: $t("remove"), cancelLabel: $t("cancel") });
    if (!ok) return;
    await api.deleteStorage(storage.id);
    dispatch("deleted");
  }
</script>

<div class="backdrop" role="presentation" on:click|self={() => dispatch("cancel")}>
  <div class="sheet" role="dialog" aria-labelledby="sheet-title">
    <div class="head">
      <div id="sheet-title" class="title">{storage ? $t("sheet_edit") : $t("sheet_add")}</div>
      <div class="sub">{$t("sheet_sub")}</div>
    </div>

    <div class="fields">
      <div class="field">
        <label for="f-name">{$t("f_name")}</label>
        <input id="f-name" type="text" bind:value={name} placeholder="Hetzner Falkenstein" />
      </div>
      <div class="field">
        <label for="f-endpoint">{$t("f_endpoint")}</label>
        <input id="f-endpoint" type="text" class="mono" bind:value={endpoint} placeholder="https://fsn1.your-objectstorage.com" />
      </div>
      <div class="two">
        <div class="field">
          <label for="f-region">{$t("f_region")}</label>
          <input id="f-region" type="text" class="mono" bind:value={region} placeholder="fsn1" />
        </div>
        <div class="field">
          <label for="f-style">{$t("f_addressing")}</label>
          <div class="segmented" id="f-style">
            <button type="button" class:on={pathStyle} on:click={() => (pathStyle = true)}>Path-Style</button>
            <button type="button" class:on={!pathStyle} on:click={() => (pathStyle = false)}>Virtual-Host</button>
          </div>
        </div>
      </div>
      <div class="field">
        <label for="f-access">{$t("f_access")}</label>
        <input id="f-access" type="text" class="mono" bind:value={accessKey} placeholder={storage ? $t("keep_unchanged") : "AKIA…"} autocomplete="off" />
      </div>
      <div class="field">
        <label for="f-secret">{$t("f_secret")}</label>
        <input id="f-secret" type="password" class="mono" bind:value={secretKey} placeholder={storage ? $t("keep_unchanged") : "••••••••••••"} autocomplete="off" />
      </div>
    </div>

    {#if message}
      <div class="message" class:ok={messageOk}>{message}</div>
    {/if}

    <div class="foot">
      <div class="left">
        <button type="button" class="secondary" disabled={busy || !valid} on:click={test}>{$t("test_connection")}</button>
        {#if storage}
          <button type="button" class="ghost" disabled={busy} on:click={remove}>{$t("remove")}</button>
        {/if}
      </div>
      <div class="right">
        <button type="button" class="ghost" disabled={busy} on:click={() => dispatch("cancel")}>{$t("cancel")}</button>
        <button type="button" class="primary" disabled={busy || !valid} on:click={save}>{$t("save")}</button>
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop { position: absolute; inset: 0; background: var(--overlay); display: flex; align-items: center; justify-content: center; z-index: 30; }
  .sheet { width: 420px; padding: 28px 28px 24px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: 0 24px 64px var(--shadow); display: flex; flex-direction: column; gap: 20px; }
  .head { display: flex; flex-direction: column; gap: 4px; }
  .title { font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
  .sub { font-size: 12px; color: var(--text-secondary); }
  .fields { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  label { font-size: 11px; font-weight: 500; letter-spacing: 0.6px; text-transform: uppercase; color: var(--text-secondary); }
  input { height: 36px; padding: 0 12px; border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--input); color: var(--text); user-select: text; }
  input:focus { border-color: var(--accent); }
  input.mono { font-family: var(--mono); font-size: 12px; }
  .segmented { display: flex; height: 36px; border: 1px solid var(--hairline); border-radius: var(--radius); padding: 3px; gap: 3px; background: var(--sidebar); }
  .segmented button { flex: 1; border-radius: 5px; font-size: 12px; color: var(--text-secondary); }
  .segmented button.on { background: var(--surface); color: var(--text); font-weight: 500; box-shadow: 0 1px 2px var(--shadow); }
  .message { font-size: 12px; color: var(--text); padding: 8px 12px; border-radius: var(--radius); background: var(--sidebar); word-break: break-word; }
  .message.ok { background: color-mix(in srgb, var(--success) 18%, transparent); }
  .foot { display: flex; justify-content: space-between; align-items: center; padding-top: 4px; }
  .left, .right { display: flex; gap: 8px; }
  .foot button { height: 32px; padding: 0 12px; border-radius: var(--radius); }
  .foot button:disabled { opacity: 0.4; cursor: default; }
  .secondary { border: 1px solid var(--hairline); background: var(--surface); }
  .ghost { color: var(--text-secondary); }
  .primary { background: var(--accent); color: var(--accent-text); font-weight: 500; padding: 0 16px !important; }
</style>
