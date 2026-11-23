// PURE. Files' home: what the team kept, folder by folder, and apart from it
// what threads made that nobody filed. Kept means in a folder, nothing else.
import type { FileFolder, PlacedFile } from '../types';
import { localDate } from '../local-dates';
import { apartScratch, docBlocks, filesBelow, KIND_ONE, shownName, sortFiles } from './files-shown';

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

/** Two rows of four before a section's own page. */
export const SHOWN_AT_FIRST = 8;

/** The page of a project's files in no folder, where a folder's page would be. */
export const NOT_IN_A_FOLDER = 'not-in-a-folder';

export interface Crumb { name: string; project: string | null; folder: string | null }

/** The places above this one, nearest last. */
export function crumbsFor(folders: FileFolder[], project: string | null, folder: string | null): Crumb[] {
  if (!project) return [];
  const top: Crumb = { name: 'All files', project: null, folder: null };
  if (!folder) return [top];
  const here = folders.find((f) => f.id === folder);
  const above = here?.parent ? folders.find((f) => f.id === here.parent) : null;
  return [top, { name: project, project, folder: null }, ...(above ? [{ name: above.name, project, folder: above.id }] : [])];
}

/** A folder's page: everything in it and in the folders inside it, newest first. */
export function folderFiles(files: PlacedFile[], folders: FileFolder[], project: string, folder: string): PlacedFile[] {
  return sortFiles(apartScratch(filesBelow(files, folders, { project, folder })).files, 'recent');
}

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

export interface DocTop { title: string | null; line: string | null }

export function docTop(text: string): DocTop {
  const head = docBlocks(text, 1)[0];
  return { title: head?.kind === 'h1' ? head.text : null, line: firstLine(text) };
}

/** A name a person gave it, a document's own title, or its file name written out. */
export function tileName(f: Pick<PlacedFile, 'name' | 'title' | 'kind' | 'sentIn'>, docTitle: string | null): string {
  if (f.title) return f.title;
  if (f.kind !== 'markdown') return shownName(f);
  if (docTitle) return docTitle;
  const words = f.name.replace(/\.[^.]+$/, '').replace(/-v\d+$/, '').replace(/(?<!\d)[-_]|[-_](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : f.name;
}

/** What any other file's tile says: the thread it came from. */
export function tileLine(f: Pick<PlacedFile, 'kind' | 'sentIn'>): string {
  return f.sentIn.find((s) => s.kind !== 'chat' && s.title)?.title ?? (f.kind ? KIND_ONE[f.kind] : 'File');
}

export const GLYPH_NAMES = ['page', 'table', 'image', 'film', 'window', 'slides', 'code', 'tag', 'compass', 'people', 'phone', 'cloud',
  'binoculars', 'chart', 'palette', 'chat', 'box', 'book', 'shield', 'chip', 'layers', 'mobile'] as const;
export type Glyph = typeof GLYPH_NAMES[number];
const isGlyph = (s: string | null | undefined): s is Glyph => !!s && (GLYPH_NAMES as readonly string[]).includes(s);

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
  [/^(engine|harness|model)/, 'chip'],
  [/^(mobile|ios|iphone|android)$|^phone$/, 'mobile'],
  [/^(team|teammate|version)$/, 'layers'],
];
const BY_KIND: Record<string, Glyph> = { markdown: 'page', table: 'table', image: 'image', film: 'film', page: 'window', pdf: 'page', deck: 'slides', code: 'code' };

const byWord = (name: string): Glyph | null => {
  const parts = partsOf(name.replace(/\.[^.]+$/, ''));
  return BY_WORD.find(([word]) => parts.some((p) => word.test(p)))?.[1] ?? null;
};

/** The icon a person picked, then a word in its name or its document's title, then its folder's name, then its kind. */
export function glyphFor(f: Pick<PlacedFile, 'name' | 'title' | 'kind' | 'sentIn' | 'icon'>, folder: string | null = null, docTitle: string | null = null): Glyph {
  if (isGlyph(f.icon)) return f.icon;
  return byWord(shownName(f)) ?? (docTitle ? byWord(docTitle) : null) ?? (folder && !isPinned({ name: folder }) ? byWord(folder) : null) ?? BY_KIND[f.kind ?? ''] ?? 'page';
}

/** A picture on this computer shows itself, unless a person picked it an icon. */
export const markOf = (f: Pick<PlacedFile, 'kind' | 'opened' | 'icon'>): 'picture' | 'icon' => (f.kind === 'image' && f.opened && !isGlyph(f.icon) ? 'picture' : 'icon');
