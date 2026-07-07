import { hashState } from './sim/sim';
import type { LoggedAction, SimState } from './sim/sim';

/** Local save/load (M1). The save file is the same shape the server saves
 *  will use (GDD §12): a full snapshot plus the session's action log, with a
 *  state hash so corruption is detected instead of loaded. Lives outside
 *  src/sim/ — the sim never touches browser APIs or wall-clock time; the
 *  timestamps here are UI metadata only. */

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  savedAtIso: string; // wall clock, display only — never fed into the sim
  stateHash: number;
  state: SimState;
  actionLog: LoggedAction[];
}

export function encodeSave(state: SimState, actionLog: LoggedAction[], savedAtIso: string): string {
  const file: SaveFile = {
    version: SAVE_VERSION,
    savedAtIso,
    stateHash: hashState(state),
    state,
    actionLog,
  };
  return JSON.stringify(file);
}

/** Parse and verify a save. Returns null (never throws) on anything wrong:
 *  bad JSON, version mismatch, or a state that doesn't match its hash. */
export function decodeSave(json: string): SaveFile | null {
  let file: SaveFile;
  try {
    file = JSON.parse(json) as SaveFile;
  } catch {
    return null;
  }
  if (!file || file.version !== SAVE_VERSION) return null;
  if (typeof file.state?.tick !== 'number' || !Array.isArray(file.state.agents)) return null;
  if (hashState(file.state) !== file.stateHash) return null; // corrupted or tampered
  return file;
}

// ---------- IndexedDB glue (browser only) ----------

const DB_NAME = 'cloudscraper';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocal(slot: string, state: SimState, actionLog: LoggedAction[]): Promise<void> {
  const json = encodeSave(state, actionLog, new Date().toISOString());
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(json, slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadLocal(slot: string): Promise<SaveFile | null> {
  const db = await openDb();
  const json = await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(slot);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return json ? decodeSave(json) : null;
}

/** Newest valid save across the given slots (manual save vs autosave). */
export async function loadNewest(slots: string[]): Promise<SaveFile | null> {
  let best: SaveFile | null = null;
  for (const slot of slots) {
    const f = await loadLocal(slot);
    if (f && (!best || f.savedAtIso > best.savedAtIso)) best = f;
  }
  return best;
}
