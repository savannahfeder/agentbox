// PURE. Files' home: what the team kept, folder by folder, and apart from it
// what threads made that nobody filed. Kept means in a folder, nothing else.
import type { FileFolder, PlacedFile } from '../types';
import { localDate } from '../local-dates';
import { apartScratch, docBlocks, KIND_ONE, shownName, sortFiles } from './files-shown';

/** What a dragged tile carries, for whatever it lands on in Files. */
export const FILE_DRAG = 'application/x-agentbox-file';

const dayOf = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** Today, Yesterday, or the day: what a tile says of when its file last changed. */
export function whenWords(at: number, now: number): string {
  const days = Math.round((dayOf(now) - dayOf(at)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return localDate(at, { month: 'short', day: 'numeric' });
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const partsOf = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export interface HomeSection { folder: FileFolder; files: PlacedFile[] }
export interface Home { kept: HomeSection[]; empty: FileFolder[]; loose: PlacedFile[] }

/** Two rows of four before Show all. */
export const SHOWN_AT_FIRST = 8;

export const isPinned = (f: Pick<FileFolder, 'name'>) => fold(f.name.trim()) === 'pinned';

export function homeOf(files: PlacedFile[], folders: FileFolder[], project: string): Home {
  const here = folders.filter((f) => fold(f.project) === fold(project));
  const known = new Map(here.map((f) => [f.id, f]));
  const topOf = (id: string) => { const f = known.get(id); return f?.parent && known.has(f.parent) ? f.parent : id; };
  const byTop = new Map<string, PlacedFile[]>();
  const loose: PlacedFile[] = [];
  for (const f of apartScratch(files.filter((x) => fold(x.project ?? '') === fold(project))).files) {
    if (f.folder && known.has(f.folder)) {
      const top = topOf(f.folder);
      byTop.set(top, [...(byTop.get(top) ?? []), f]);
    } else loose.push(f);
  }
  const tops = here.filter((f) => !f.parent || !known.has(f.parent));
  const kept = tops.filter((f) => byTop.has(f.id))
    .map((folder) => ({ folder, files: sortFiles(byTop.get(folder.id)!, 'recent') }))
    .sort((a, b) => Number(isPinned(b.folder)) - Number(isPinned(a.folder)) || b.files[0].at - a.files[0].at);
  const empty = tops.filter((f) => !byTop.has(f.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { kept, empty, loose: sortFiles(loose, 'recent') };
}

/** A pinned document that changed this week: the one thing on the page in the accent. */
export const pinChangedLately = (folder: Pick<FileFolder, 'name'>, f: Pick<PlacedFile, 'at'>, now: number) =>
  isPinned(folder) && now - f.at < 7 * 86_400_000;

/** What a document's tile says under its name: the first thing written after its title. */
export function firstLine(text: string): string | null {
  return docBlocks(text, 6).find((b) => b.kind === 'p' || b.kind === 'li')?.text ?? null;
}

/** What any other file's tile says: the thread it came from. */
export function tileLine(f: Pick<PlacedFile, 'kind' | 'sentIn'>): string {
  return f.sentIn.find((s) => s.kind !== 'chat' && s.title)?.title ?? (f.kind ? KIND_ONE[f.kind] : 'File');
}

export type Glyph = 'page' | 'table' | 'image' | 'film' | 'window' | 'slides' | 'code'
  | 'tag' | 'compass' | 'people' | 'phone' | 'cloud' | 'binoculars' | 'chart' | 'palette' | 'chat' | 'box' | 'book' | 'shield';

// A word that starts a part of the name picks the drawing; anything else is drawn by its kind.
const BY_WORD: [RegExp, Glyph][] = [
  [/^(pric|billing|invoice|seat)/, 'tag'],
  [/^(position|pitch|messag)/, 'compass'],
  [/^(customer|people|user|interview|persona|feedback)/, 'people'],
  [/^(call|meeting|minutes)/, 'phone'],
  [/^(cloud|server|deploy)/, 'cloud'],
  [/^(competit|rival)/, 'binoculars'],
  [/^(launch|result|metric|install|analytic)/, 'chart'],
  [/^(brand|look|logo)/, 'palette'],
  [/^(repl|post|tweet|outreach|email)/, 'chat'],
  [/^(release|ship)/, 'box'],
  [/^(guide|playbook|checklist|script|how)/, 'book'],
  [/^(security|privacy|audit)/, 'shield'],
];
const BY_KIND: Record<string, Glyph> = { markdown: 'page', table: 'table', image: 'image', film: 'film', page: 'window', pdf: 'page', deck: 'slides', code: 'code' };

export function glyphFor(f: Pick<PlacedFile, 'name' | 'title' | 'kind' | 'sentIn'>): Glyph {
  const parts = partsOf(shownName(f).replace(/\.[^.]+$/, ''));
  for (const [word, glyph] of BY_WORD) if (parts.some((p) => word.test(p))) return glyph;
  return BY_KIND[f.kind ?? ''] ?? 'page';
}
