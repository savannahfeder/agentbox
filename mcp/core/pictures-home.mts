// A picture an agent saved in a temporary folder, copied into its thread's
// folder so the message names a file a person can open, and so it reaches
// Files and the team with the thread.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIELDS = ['result', 'note', 'answer', 'body'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function temporaryRoots() {
  const roots = new Set(['/tmp/', '/private/tmp/', '/var/folders/', '/private/var/folders/']);
  const tmp = os.tmpdir().replace(/\/+$/, '');
  if (tmp) roots.add(`${tmp}/`);
  return [...roots];
}

function picturePaths() {
  const roots = temporaryRoots().map(escape).join('|');
  return new RegExp(String.raw`(?<![\w./:@~-])(?:${roots})[\w./-]*\.(?:png|jpe?g|gif|webp)\b`, 'gi');
}

function sameBytes(a: string, b: string) {
  try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; }
}

// The copy's name inside designs/<id>/: its own name, unless a different
// picture already has it.
function copyIn(dir: string, id: string, from: string) {
  const folder = path.join(dir, 'designs', id);
  const ext = path.extname(from);
  const stem = path.basename(from, ext);
  fs.mkdirSync(folder, { recursive: true });
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`;
    const to = path.join(folder, name);
    if (fs.existsSync(to) && !sameBytes(to, from)) continue;
    if (!fs.existsSync(to)) fs.copyFileSync(from, to);
    return `designs/${id}/${name}`;
  }
  return null;
}

/** The patch with every temporary picture it names copied home and renamed in its words. */
export function bringPicturesHome<P extends Record<string, unknown>>(dir: string | null | undefined, id: string | null | undefined, patch: P): P {
  if (!dir || !id || !patch) return patch;
  let out = patch;
  const done = new Map<string, string>();
  for (const field of FIELDS) {
    const words = patch[field];
    if (typeof words !== 'string' || !words) continue;
    const next = words.replace(picturePaths(), (full) => {
      if (done.has(full)) return done.get(full)!;
      let home: string | null = null;
      try { if (fs.statSync(full).isFile()) home = copyIn(dir, id, full); } catch { /* not there: left as written */ }
      done.set(full, home ?? full);
      return home ?? full;
    });
    if (next !== words) out = { ...out, [field]: next };
  }
  return out;
}
