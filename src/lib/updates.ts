import { writable, get } from "svelte/store";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// Updates via the Tauri updater plugin. The feed is latest.json in the newest
// GitHub release (see plugins.updater in tauri.conf.json); the packages are
// signed with the key from TAURI_SIGNING_PRIVATE_KEY.
//
// Same flow as the scanner: check silently every 6 hours. If something new is
// there, a notice appears at the bottom right. Download and install happen only
// after one click, the restart after a second.

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 10_000;

export type UpdateStatus = "idle" | "available" | "downloading" | "ready" | "error";

export interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  percent: number;
  message: string | null;
}

export type CheckResult =
  | { status: "current" }
  | { status: "available"; version: string }
  | { status: "error"; message: string };

const IDLE: UpdateState = { status: "idle", version: null, percent: 0, message: null };

export const updateState = writable<UpdateState>(IDLE);

let pending: Update | null = null;
// The version dismissed with "Later". The silent cycle does not report it
// again, only the next one.
let dismissedVersion: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const busy = () => {
  const s = get(updateState).status;
  return s === "downloading" || s === "ready";
};

async function fetchUpdate(): Promise<Update | null> {
  const update = await check();
  if (update) {
    await pending?.close().catch(() => {});
    pending = update;
  }
  return update;
}

async function silentCheck() {
  if (busy()) return;
  try {
    const update = await fetchUpdate();
    if (!update || update.version === dismissedVersion) return;
    updateState.set({ ...IDLE, status: "available", version: update.version });
  } catch {
    // No network, a proxy, no release yet: none of that belongs in the UI.
  }
}

/** Manual check from the settings. Unlike the cycle, it also reports "up to date". */
export async function checkNow(): Promise<CheckResult> {
  const s = get(updateState);
  if (busy()) return { status: "available", version: s.version ?? "" };
  try {
    const update = await fetchUpdate();
    if (!update) return { status: "current" };
    // Whoever checks by hand wants the dismissed notice back.
    dismissedVersion = null;
    updateState.set({ ...IDLE, status: "available", version: update.version });
    return { status: "available", version: update.version };
  } catch (e) {
    return { status: "error", message: String(e) };
  }
}

export async function install() {
  if (!pending || busy()) return;
  const version = pending.version;
  let total = 0;
  let done = 0;
  updateState.set({ ...IDLE, status: "downloading", version });
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      else if (event.event === "Progress") {
        done += event.data.chunkLength;
        const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
        updateState.update((s) => ({ ...s, percent }));
      }
    });
    // On Windows the installer quits the app itself; only macOS and Linux
    // get here.
    updateState.set({ ...IDLE, status: "ready", version, percent: 100 });
  } catch (e) {
    updateState.set({ ...IDLE, status: "error", version, message: String(e) });
  }
}

export async function restart() {
  await relaunch();
}

export function dismiss() {
  dismissedVersion = get(updateState).version;
  updateState.set(IDLE);
}

export function startUpdateChecks() {
  if (timer) return;
  setTimeout(silentCheck, FIRST_CHECK_DELAY_MS);
  timer = setInterval(silentCheck, CHECK_INTERVAL_MS);
}
