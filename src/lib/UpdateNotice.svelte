<script lang="ts">
  import { t } from "./i18n";
  import { updateState, install, restart, dismiss } from "./updates";
</script>

{#if $updateState.status !== "idle"}
  <div class="notice" role="status" aria-live="polite">
    {#if $updateState.status === "available"}
      <div class="title">{$t("update_available")}</div>
      <div class="text">{$t("update_version", { v: $updateState.version ?? "" })}</div>
      <div class="buttons">
        <button class="ghost" on:click={dismiss}>{$t("update_later")}</button>
        <button class="primary" on:click={install}>{$t("update_install")}</button>
      </div>
    {:else if $updateState.status === "downloading"}
      <div class="title">{$t("update_available")}</div>
      <div class="text">{$t("update_downloading", { p: $updateState.percent })}</div>
      <div class="bar"><div style="width: {$updateState.percent}%"></div></div>
    {:else if $updateState.status === "ready"}
      <div class="title">{$t("update_available")}</div>
      <div class="text">{$t("update_ready")}</div>
      <div class="buttons">
        <button class="primary" on:click={restart}>{$t("update_restart")}</button>
      </div>
    {:else if $updateState.status === "error"}
      <div class="title error">{$t("update_failed")}</div>
      <div class="text message" title={$updateState.message}>{$updateState.message}</div>
      <div class="buttons">
        <button class="ghost" on:click={dismiss}>{$t("update_later")}</button>
        <button class="primary" on:click={install}>{$t("update_retry")}</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .notice { position: fixed; right: 20px; bottom: 52px; width: 280px; padding: 14px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; box-shadow: 0 12px 32px var(--shadow); display: flex; flex-direction: column; gap: 4px; z-index: 30; }
  .title { font-size: 13px; font-weight: 600; }
  .title.error { color: var(--danger); }
  .text { font-size: 12px; color: var(--text-secondary); }
  .message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .ghost { height: 28px; padding: 0 12px; border: 1px solid var(--hairline); background: var(--surface); border-radius: var(--radius); font-size: 12px; color: var(--text); }
  .ghost:hover { background: var(--hover); }
  .primary { height: 28px; padding: 0 12px; background: var(--accent); color: var(--accent-text); border-radius: var(--radius); font-size: 12px; font-weight: 500; }
  .bar { height: 4px; margin-top: 8px; border-radius: 2px; background: var(--hairline); overflow: hidden; }
  .bar div { height: 100%; background: var(--accent); transition: width 150ms; }
</style>
