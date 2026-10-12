import { BaseDirectory, exists, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { migrateLegacyStorage, sanitizeState, serializeState, type DeskState } from "./state";

/**
 * Persistence backend. In the packaged app the state lives in one JSON file under
 * the per-user app data directory (survives WebView cache clears, no quota).
 * Outside Tauri (plain `vite` in a browser) it falls back to localStorage.
 */
const DIR = "signal-desk";
const FILE = `${DIR}/state.json`;
const TMP = `${DIR}/state.json.tmp`;
const SNAPSHOT_DIR = `${DIR}/snapshots`;
const LOCAL_KEY = "signal-desk:state:v1";
const fsOptions = { baseDir: BaseDirectory.AppLocalData };
export const SNAPSHOTS_TO_KEEP = 7;

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

/** Names of the snapshots that would be deleted to keep only the newest `keep`; pure for testing. */
export function snapshotsToPrune(names: string[], keep = SNAPSHOTS_TO_KEEP): string[] {
  const dated = names.filter((name) => /^state-\d{4}-\d{2}-\d{2}(-migration)?\.json$/.test(name)).sort();
  // Migration snapshots are kept as long as they are not the oldest dated ones beyond the limit.
  return dated.slice(0, Math.max(0, dated.length - keep));
}

/**
 * Keep a dated copy of the state: one per day on first save, plus a tagged
 * copy right after a migration. Old copies are pruned to SNAPSHOTS_TO_KEEP.
 * Snapshot failures are logged, never surfaced; they must not block normal use.
 */
export async function writeSnapshot(state: DeskState, today: string, tag?: string): Promise<boolean> {
  if (!inTauri) return false;
  const name = `state-${today}${tag ? `-${tag}` : ""}.json`;
  const path = `${SNAPSHOT_DIR}/${name}`;
  try {
    await mkdir(SNAPSHOT_DIR, { ...fsOptions, recursive: true });
    if (await exists(path, fsOptions)) return false;
    await writeTextFile(path, serializeState(state), fsOptions);
    const entries = await readDir(SNAPSHOT_DIR, fsOptions);
    for (const stale of snapshotsToPrune(entries.filter((entry) => entry.isFile).map((entry) => entry.name))) {
      await remove(`${SNAPSHOT_DIR}/${stale}`, fsOptions);
    }
    return true;
  } catch (error) {
    console.warn("[signal-desk] snapshot failed", error);
    return false;
  }
}
