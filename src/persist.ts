import { BaseDirectory, exists, mkdir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { migrateLegacyStorage, sanitizeState, serializeState, type DeskState } from "./state";

/**
 * Persistence backend. In the packaged app the state lives in one JSON file under
 * the per-user app data directory (survives WebView cache clears, no quota).
 * Outside Tauri (plain `vite` in a browser) it falls back to localStorage.
 */
const DIR = "signal-desk";
const FILE = `${DIR}/state.json`;
const TMP = `${DIR}/state.json.tmp`;
const LOCAL_KEY = "signal-desk:state:v1";
const fsOptions = { baseDir: BaseDirectory.AppLocalData };

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type LoadResult = { state: DeskState; migrated: boolean; location: "file" | "localStorage" };

async function readFileState(): Promise<DeskState | null> {
  if (!(await exists(FILE, fsOptions))) return null;
  return sanitizeState(JSON.parse(await readTextFile(FILE, fsOptions)));
}

async function writeFileState(raw: string): Promise<void> {
  await mkdir(DIR, { ...fsOptions, recursive: true });
  // Write to a temp file first so a crash mid-write never leaves a truncated state.json.
  await writeTextFile(TMP, raw, fsOptions);
  await rename(TMP, FILE, { oldPathBaseDir: BaseDirectory.AppLocalData, newPathBaseDir: BaseDirectory.AppLocalData });
}

export async function loadState(): Promise<LoadResult> {
  if (inTauri) {
    const fromFile = await readFileState();
    if (fromFile) return { state: fromFile, migrated: false, location: "file" };
    const legacy = migrateLegacyStorage(localStorage);
    return { state: legacy ?? sanitizeState(null), migrated: Boolean(legacy), location: "file" };
  }
  let raw: string | null = null;
  try { raw = localStorage.getItem(LOCAL_KEY); } catch { raw = null; }
  if (raw) return { state: sanitizeState(JSON.parse(raw)), migrated: false, location: "localStorage" };
  const legacy = migrateLegacyStorage(localStorage);
  return { state: legacy ?? sanitizeState(null), migrated: Boolean(legacy), location: "localStorage" };
}

/** Write immediately and reject on failure. Used for restores, where partial success must not look like success. */
export async function flushState(state: DeskState): Promise<void> {
  const raw = serializeState(state);
  if (inTauri) await writeFileState(raw);
  else localStorage.setItem(LOCAL_KEY, raw);
}

let pending: DeskState | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

/** Debounced save; consecutive edits collapse into one write and writes never overlap. */
export function saveState(state: DeskState, onError: (error: unknown) => void, delayMs = 300): void {
  pending = state;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const snapshot = pending;
    pending = null;
    if (!snapshot) return;
    chain = chain.then(() => flushState(snapshot)).catch(onError);
  }, delayMs);
}
