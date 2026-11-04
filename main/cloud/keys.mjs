// KEYS SAVED FOR CLOUD RUNS, AS THE MAC KNOWS THEM: BY NAME, NEVER BY VALUE.
//
// A key is pasted once, put in the cloud bucket as its own object
// (`logins/keys/<id>.json`, `{ name, value }`), and every cloud run carries a
// link to each one (main/cloud/run.mjs `keys`). The Mac keeps only
// ~/.agentbox/cloud-keys.json: each name, its object and when it was saved.
// Nothing here reads a key back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { keyNameRefused, keyObjectKey, KEY_VALUE_MAX, keyLabel } from '../../shared/cloud-keys.mjs';

export { keyLabel };

export const cloudKeysPath = (home = os.homedir()) => path.join(home, '.agentbox', 'cloud-keys.json');

function readNote(home) {
  try {
    const n = JSON.parse(fs.readFileSync(cloudKeysPath(home), 'utf8'));
    return { keys: n?.keys && typeof n.keys === 'object' ? n.keys : {}, retired: Array.isArray(n?.retired) ? n.retired : [] };
  } catch {
    return { keys: {}, retired: [] };
  }
}

function writeNote(note, home) {
  const file = cloudKeysPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(note, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** The saved keys, by name: [{ name, savedAt }]. */
export function cloudKeyNames({ home = os.homedir() } = {}) {
  return Object.entries(readNote(home).keys)
    .filter(([name, k]) => !keyNameRefused(name) && typeof k?.id === 'string')
    .map(([name, k]) => ({ name, savedAt: k.savedAt ?? null, label: typeof k.label === 'string' && k.label ? k.label : null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What a cloud run carries: each key's name and object. */
export function keysCarried({ home = os.homedir() } = {}) {
  const { keys } = readNote(home);
  return cloudKeyNames({ home }).map(({ name }) => ({ name, key: keyObjectKey(keys[name].id) }));
}

// A replaced or removed key is deleted at once: a run that was handed its
// link a moment before only goes without it. One the cloud would not delete
// is tried again at the next save or removal.
async function sweep(note, storage) {
  const keep = [];
  for (const r of note.retired) {
    try { await storage.del(keyObjectKey(r.id)); } catch { keep.push(r); }
  }
  note.retired = keep;
}

/** Keeps `value` in the cloud under `name`, in place of any key of that name. */
export async function saveCloudKey(name, value, { storage, home = os.homedir(), now = Date.now(), label = null } = {}) {
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
export async function removeCloudKey(name, { storage, home = os.homedir(), now = Date.now() } = {}) {
  const note = readNote(home);
  const was = note.keys[name];
  if (!was) return false;
  delete note.keys[name];
  note.retired.push({ id: was.id, at: now });
  await sweep(note, storage);
  writeNote(note, home);
  return true;
}
