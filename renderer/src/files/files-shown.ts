// PURE. What the Files place shows of the list main/files-place.mjs hands it.
import type { FileFolder, FileKind, PlacedFile } from '../types';
import { PLAIN_AGENT } from '../../../shared/agent-voice.mjs';

export const KIND_ORDER: FileKind[] = ['markdown', 'image', 'film', 'deck', 'pdf', 'page', 'code'];
export const KIND_PLURAL: Record<FileKind, string> = { markdown: 'Documents', image: 'Pictures', film: 'Films', deck: 'Decks', pdf: 'PDFs', page: 'Pages', code: 'Code' };
export const KIND_ONE: Record<FileKind, string> = { markdown: 'Document', image: 'Picture', film: 'Film', deck: 'Deck', pdf: 'PDF', page: 'Page', code: 'Code' };

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

const partsOf = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const startsAPart = (parts: string[], w: string) => parts.some((p) => p.startsWith(w));

/**
 * What the box leaves. Each word starts a part of the name, the project or the
 * folder; the files named for a word come before, and instead of, the files
 * that only sit in a project or folder of that word.
 */
export function filesShown(files: PlacedFile[], { query = '', kind = null, project = null, folders = [] }: { query?: string; kind?: FileKind | null; project?: string | null; folders?: FileFolder[] } = {}) {
  const words = partsOf(query);
  const page = project ? fold(project) : null;
  const named: PlacedFile[] = [];
  const placed: PlacedFile[] = [];
  for (const f of files) {
    if (page && fold(f.project ?? '') !== page) continue;
    if (kind && f.kind !== kind) continue;
    const own = partsOf(`${f.name} ${shownName(f)}`);
    const all = [...own, ...partsOf(`${f.project ?? ''} ${folders.find((x) => x.id === f.folder)?.name ?? ''}`)];
    if (!words.every((w) => startsAPart(all, w))) continue;
    (!words.length || words.some((w) => startsAPart(own, w)) ? named : placed).push(f);
  }
  return named.length ? named : placed;
}

export const kindsIn = (files: PlacedFile[]) => KIND_ORDER.filter((k) => files.some((f) => f.kind === k));

/** Who made the newest version: a person, an agent by its name, or whose agent it is. */
export function changedBy(f: Pick<PlacedFile, 'by' | 'agent'>, { me, nameOf }: { me: string | null; nameOf: (id: string) => string }) {
  const mine = !f.by || f.by === me;
  if (typeof f.agent !== 'string') return mine ? 'You' : nameOf(f.by!);
  if (f.agent && f.agent !== PLAIN_AGENT) return f.agent;
  return mine ? 'Your agent' : `${nameOf(f.by!)}'s agent`;
}

type DocBlock = { kind: 'h1' | 'h2' | 'p' | 'li'; text: string };

/** The top of a markdown file as a tile draws it. Tables and code are left out. */
export function docBlocks(text: string, most = 8): DocBlock[] {
  const plain = (s: string) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|`|~~)/g, '').replace(/^[*_]|[*_]$/g, '').trim();
  const out: DocBlock[] = [];
  let fenced = false;
  let gap = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```')) { fenced = !fenced; continue; }
    if (!line) { gap = true; continue; }
    if (fenced || line.startsWith('|') || /^[-*_]{3,}$/.test(line)) continue;
    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (head) out.push({ kind: head[1].length === 1 && !out.length ? 'h1' : 'h2', text: plain(head[2]) });
    else if (item) out.push({ kind: 'li', text: plain(item[1]) });
    else if (last?.kind === 'p' && !gap) last.text = `${last.text} ${plain(line.replace(/^>\s*/, ''))}`;
    else out.push({ kind: 'p', text: plain(line.replace(/^>\s*/, '')) });
    gap = false;
    if (out.length >= most) break;
  }
  return out.filter((b) => b.text);
}

export const versionWord =(f: Pick<PlacedFile, 'versions'>) => (f.versions > 1 ? `v${f.versions}` : null);

// A page shot (page-2026-10-31T17-42-40-037Z.png) or a check sheet, by its name.
const SCRATCH_NAME = /^page-\d{4}-\d{2}-\d{2}T[\d-]+Z?\.\w+$|(?:^|[-_ ])checks?\.\w+$|(?:^|[-_ ])contact[-_ ]?sheet\.\w+$/i;

/** A picture an agent took to check its own work, that nobody is reviewing. */
export const isScratch = (f: PlacedFile) => f.kind === 'image' && typeof f.agent === 'string' && SCRATCH_NAME.test(f.name)
  && f.versions <= 1 && f.open === 0 && f.approvedBy.length === 0 && (!f.folder || !!f.folderFollows);

/** The folders a Move menu's search leaves. */
export function foldersMatching<T extends { name: string }>(folders: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return folders.filter((f) => words.every((w) => fold(f.name).includes(w)));
}

/** What a tile or the big view says of a file with no bytes here. */
export const missingWords = (who: string | null) => (who ? `On ${who}'s computer.` : 'Not on this computer yet.');

// A name no person chose: a page shot's timestamp, a Mac screenshot's, a hash.
const MACHINE_NAME = /^page-\d{4}-\d{2}-\d{2}T[\d-]+Z?(?:[-_ ]v\d+)?\.\w+$|^screen ?shot[ -]\d{4}-\d{2}-\d{2}\b.*\.\w+$|^(?:[0-9a-f]{12,}|\d{10,})\.\w+$/i;

/** What a tile calls a file. The viewer keeps the real name. */
export function shownName(f: Pick<PlacedFile, 'name' | 'sentIn'>) {
  if (!MACHINE_NAME.test(f.name)) return f.name;
  return f.sentIn.find((s) => s.kind !== 'chat' && s.title)?.title ?? f.name;
}

export const needsReview = (f: Pick<PlacedFile, 'open' | 'approvedBy'>) => f.open > 0 && f.approvedBy.length === 0;

export type FileSort = 'recent' | 'name';
export function sortFiles<T extends Pick<PlacedFile, 'name' | 'sentIn' | 'at'>>(files: T[], by: FileSort): T[] {
  return [...files].sort(by === 'name'
    ? (a, b) => shownName(a).localeCompare(shownName(b), undefined, { sensitivity: 'base', numeric: true })
    : (a, b) => b.at - a.at);
}

type Place = { project: string | null; folder: string | null };

/** The folders a place shows. All files shows projects instead. */
export function foldersInPlace(folders: FileFolder[], { project, folder }: Place) {
  if (!project) return [];
  return folders.filter((f) => fold(f.project) === fold(project) && (f.parent ?? null) === folder);
}

/** A project's top holds the files in no folder it can read; All files holds every file. */
export function filesInPlace<T extends Pick<PlacedFile, 'project' | 'folder'>>(files: T[], folders: FileFolder[], { project, folder }: Place): T[] {
  if (!project) return files;
  const known = new Set(folders.map((f) => f.id));
  return files.filter((f) => {
    if (fold(f.project ?? '') !== fold(project)) return false;
    const at = f.folder && known.has(f.folder) ? f.folder : null;
    return at === folder;
  });
}

/** Everything a search looks through from here: this place and what is inside it. */
export function filesBelow<T extends Pick<PlacedFile, 'project' | 'folder'>>(files: T[], folders: FileFolder[], { project, folder }: Place): T[] {
  if (!folder) return project ? files.filter((f) => fold(f.project ?? '') === fold(project)) : files;
  const inside = new Set([folder, ...folders.filter((f) => f.parent === folder).map((f) => f.id)]);
  return files.filter((f) => !!f.folder && inside.has(f.folder));
}

export function crumbsTo(folders: FileFolder[], { project, folder }: Place) {
  const crumbs: { name: string; project: string | null; folder: string | null }[] = [{ name: 'All files', project: null, folder: null }];
  if (!project) return crumbs;
  crumbs.push({ name: project, project, folder: null });
  const here = folders.find((f) => f.id === folder);
  const above = here?.parent ? folders.find((f) => f.id === here.parent) : null;
  if (above) crumbs.push({ name: above.name, project, folder: above.id });
  if (here) crumbs.push({ name: here.name, project, folder: here.id });
  return crumbs;
}

export function apartScratch(files: PlacedFile[]) {
  return { files: files.filter((f) => !isScratch(f)), scratch: files.filter(isScratch) };
}

export const scratchLine = (n: number) => (n === 1 ? '1 check picture an agent took' : `${n} check pictures agents took`);
