// The pictures, films and sound in a folder, found by looking in it rather
// than by what threads name, so the cloud keeper can take the old ones too
// (main/files-cloud.mts).
import fs from 'node:fs';
import path from 'node:path';

const KINDS: ReadonlyArray<readonly [string, RegExp]> = [
  ['image', /\.(png|jpe?g|gif|webp|tiff?|heic)$/i],
  ['film', /\.(mp4|mov|m4v|webm|mkv)$/i],
  ['sound', /\.(wav|mp3|m4a|aiff?|flac|ogg)$/i],
];
export const looseKind = (name: string): string | null => KINDS.find(([, re]) => re.test(name))?.[0] ?? null;

export interface LooseFile {
  path: string;
  size: number;
  /** Its last write. */
  at: number;
  kind: string;
  /** The thread whose `designs/<id>/` folder holds it. */
  thread: string | null;
}

/** Every picture, film and sound file under `dir`. Hidden folders, node_modules and a code checkout are left alone. */
export async function looseFilesIn(dir: string, { skip = [] }: { skip?: string[] } = {}): Promise<LooseFile[]> {
  const root = path.resolve(dir);
  const skipped = new Set(skip.map((s) => path.resolve(s)));
  const out: LooseFile[] = [];
  const threadOf = (file: string): string | null => {
    const parts = path.relative(root, file).split(path.sep);
    return parts[0] === 'designs' && parts.length > 2 ? parts[1] : null;
  };
  async function walk(at: string): Promise<void> {
    if (skipped.has(at)) return;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(at, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.name === '.git')) return;
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(at, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      const kind = e.isFile() ? looseKind(e.name) : null;
      if (!kind) continue;
      const st = await fs.promises.stat(p).catch(() => null);
      if (st) out.push({ path: p, size: st.size, at: st.mtimeMs, kind, thread: threadOf(p) });
    }
  }
  await walk(root);
  return out;
}
