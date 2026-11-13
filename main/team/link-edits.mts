// EDITS MADE ON A SHARED LINK'S PAGE, WRITTEN INTO THE OWNER'S FILES AS THE NEXT VERSION
// (my_links_changed_on_web and file_link_brought_home in
// 20261112120000_a_link_says_who_can_open_it_and_what_they_can_do.sql).
import crypto from 'node:crypto';
import fsDefault from 'node:fs';
import path from 'node:path';
import { baseName, numberInName } from '../../shared/artifact-marks.mts';
import { threadOfSource, type LinkThread } from './link-comments.mts';

export interface LinkEdit { token: string; source: string; name: string; rev: number; hash: string; version: number; byName: string }
/** Where a link's file is on this computer; `wrote`: the copy this computer last wrote for it. */
export interface LinkPlace { path: string; wrote?: { path: string; hash: string; version: number } | null }
export interface LinkEditsBackend {
  linksChangedOnWeb?(): Promise<LinkEdit[]>;
  fileLinkView?(token: string): Promise<{ stopped: boolean; file: { kind: string; body: string; rev?: number } | null }>;
  fileLinkBroughtHome?(token: string, rev: number, version: number): Promise<unknown>;
}
type EditsFs = Pick<typeof fsDefault, 'readdirSync' | 'readFileSync' | 'writeFileSync' | 'renameSync'>;

/** The hash a link carries of a document's words (main/file-link.mts fileForLink). */
export const linkHash = (text: string): string => crypto.createHash('sha256').update(text).digest('hex').slice(0, 40);

const TEXT_KINDS = new Set(['markdown', 'page']);

function newestOfFamily(file: string, fs: EditsFs): { path: string; n: number } {
  const dir = path.dirname(file);
  const family = baseName(path.basename(file)).toLowerCase();
  let best = { path: file, n: numberInName(path.basename(file)) ?? 1 };
  for (const name of fs.readdirSync(dir)) {
    const n = numberInName(name);
    if (n == null || baseName(name).toLowerCase() !== family) continue;
    if (n > best.n) best = { path: path.join(dir, name), n };
  }
  return best;
}

function nameWithVersion(file: string, n: number): string {
  const base = baseName(path.basename(file));
  const ext = path.extname(base);
  return `${base.slice(0, base.length - ext.length)}-v${n}${ext}`;
}

const hashOf = (file: string, fs: EditsFs): string | null => {
  try { return linkHash(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

function writeWhole(file: string, text: string, fs: EditsFs) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Answers how many files it wrote. A link it cannot place stays marked, to be tried on the next look. */
export async function bringLinkEditsHome({ backend, placeOf, setPlace, note, fs = fsDefault, log = () => {} }: {
  backend: LinkEditsBackend | null | undefined;
  placeOf: (source: string) => LinkPlace | null;
  setPlace: (source: string, place: LinkPlace) => void;
  note: (thread: LinkThread, text: string) => unknown;
  fs?: EditsFs;
  log?: (line: string) => void;
}): Promise<number> {
  if (!backend?.linksChangedOnWeb || !backend.fileLinkView || !backend.fileLinkBroughtHome) return 0;
  const edits = await backend.linksChangedOnWeb();
  let wrote = 0;
  for (const edit of edits) {
    const place = placeOf(edit.source);
    if (!place) { log(`link edits: this computer does not know where ${edit.name} is; its edit stays on the web`); continue; }
    const { file } = await backend.fileLinkView(edit.token);
    if (!file || !TEXT_KINDS.has(file.kind)) continue;
    const rev = file.rev ?? edit.rev;
    const words = linkHash(file.body);
    let newest;
    try { newest = newestOfFamily(place.path, fs); } catch (err) { log(`link edits: ${(err as Error).message}`); continue; }
    const newestHash = hashOf(newest.path, fs);
    if (newestHash === words) {
      await backend.fileLinkBroughtHome(edit.token, rev, newest.n);
      continue;
    }
    // One run of saves on the page is one version here, unless the owner has changed that copy since.
    const mine = place.wrote;
    const again = !!mine && mine.path === newest.path && newestHash === mine.hash;
    const n = again ? newest.n : newest.n + 1;
    const target = again ? newest.path : path.join(path.dirname(newest.path), nameWithVersion(place.path, n));
    try { writeWhole(target, file.body, fs); } catch (err) { log(`link edits: ${(err as Error).message}`); continue; }
    setPlace(edit.source, { ...place, wrote: { path: target, hash: words, version: n } });
    wrote += 1;
    await backend.fileLinkBroughtHome(edit.token, rev, n);
    const thread = threadOfSource(edit.source);
    if (!again && thread) {
      try { note(thread, `${edit.byName} edited ${baseName(path.basename(place.path))} on its page. The edit is ${path.basename(target)}.`); } catch (err) { log(`link edits: ${(err as Error).message}`); }
    }
  }
  return wrote;
}
