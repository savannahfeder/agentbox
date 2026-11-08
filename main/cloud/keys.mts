// KEYS SAVED FOR CLOUD RUNS, AS THE MAC KNOWS THEM: BY NAME, NEVER BY VALUE.
//
// A key is pasted once, put in the cloud bucket as its own object
// (`logins/keys/<id>.json`, `{ name, value }`), and every cloud run carries a
// link to each one (main/cloud/run.mts `keys`). The Mac keeps only
// ~/.agentbox/cloud-keys.json: each name, its object and when it was saved.
// Nothing here reads a key back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { keyNameRefused, keyObjectKey, KEY_VALUE_MAX, keyLabel } from '../../shared/cloud-keys.mts';

export { keyLabel };

/** The bucket the keys go to: anything that can put and delete an object by name. */
export interface KeyStorage {
  put(key: string, body: string): Promise<unknown>;
  del?(key: string): Promise<unknown>;
}

export interface SavedKey {
  name: string;
  savedAt: number | null;
  label: string | null;
}

interface KeyNote {
  keys: Record<string, { id: string; savedAt?: number; label?: string | null }>;
  /** Objects of replaced or removed keys the cloud has not deleted yet. */
  retired: { id: string; at: number }[];
}

export const cloudKeysPath = (home: string = os.homedir()): string => path.join(home, '.agentbox', 'cloud-keys.json');

function readNote(home: string): KeyNote {
  try {
    const n = JSON.parse(fs.readFileSync(cloudKeysPath(home), 'utf8'));
    return { keys: n?.keys && typeof n.keys === 'object' ? n.keys : {}, retired: Array.isArray(n?.retired) ? n.retired : [] };
  } catch {
    return { keys: {}, retired: [] };
  }
}

function writeNote(note: KeyNote, home: string): void {
  const file = cloudKeysPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(note, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** The saved keys, by name: [{ name, savedAt }]. */
export function cloudKeyNames({ home = os.homedir() }: { home?: string } = {}): SavedKey[] {
  return Object.entries(readNote(home).keys)
    .filter(([name, k]) => !keyNameRefused(name) && typeof k?.id === 'string')
    .map(([name, k]) => ({ name, savedAt: k.savedAt ?? null, label: typeof k.label === 'string' && k.label ? k.label : null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What a cloud run carries: each key's name and object. */
export function keysCarried({ home = os.homedir() }: { home?: string } = {}): { name: string; key: string }[] {
  const { keys } = readNote(home);
  return cloudKeyNames({ home }).map(({ name }) => ({ name, key: keyObjectKey(keys[name].id) }));
}

// A replaced or removed key is deleted at once: a run that was handed its
// link a moment before only goes without it. One the cloud would not delete
// is tried again at the next save or removal.
async function sweep(note: KeyNote, storage: KeyStorage): Promise<void> {
  const keep: KeyNote['retired'] = [];
  for (const r of note.retired) {
    // A bucket with no `del` throws here too, and its retired keys wait in the note.
    try { await storage.del!(keyObjectKey(r.id)); } catch { keep.push(r); }
  }
  note.retired = keep;
}

/** Keeps `value` in the cloud under `name`, in place of any key of that name. */
export async function saveCloudKey(
  name: string,
  value: unknown,
  { storage, home = os.homedir(), now = Date.now(), label = null }: { storage: KeyStorage; home?: string; now?: number; label?: string | null } = {} as { storage: KeyStorage },
): Promise<{ name: string; savedAt: number }> {
  const refused = keyNameRefused(name);
  if (refused) throw new Error(refused);
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw new Error('Paste the key first.');
  if (v.length > KEY_VALUE_MAX) throw new Error('That is longer than any key; check what was pasted.');
  const id = crypto.randomUUID();
  await storage.put(keyObjectKey(id), JSON.stringify({ name, value: v }));
  const note = readNote(home);
  const was = note.keys[name];
  if (was?.id) note.retired.push({ id: was.id, at: now });
  note.keys[name] = { id, savedAt: now, label: keyLabel(label) ?? was?.label ?? null };
  await sweep(note, storage);
  writeNote(note, home);
  return { name, savedAt: now };
}

/** Takes the key out of the cloud and out of every later run. */
export async function removeCloudKey(
  name: string,
  { storage, home = os.homedir(), now = Date.now() }: { storage: KeyStorage; home?: string; now?: number } = {} as { storage: KeyStorage },
): Promise<boolean> {
  const note = readNote(home);
  const was = note.keys[name];
  if (!was) return false;
  delete note.keys[name];
  note.retired.push({ id: was.id, at: now });
  await sweep(note, storage);
  writeNote(note, home);
  return true;
}
