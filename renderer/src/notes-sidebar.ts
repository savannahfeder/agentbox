import { noteGoesTo, notedFilesInLines, threadFiles, versionForPath, type FileVersion, type NamedFile, type ThreadLine } from '../../shared/artifact-marks.mts';
import { DOCUMENT_HEIGHT_SCRIPT } from '../../shared/frame-document-height.mts';
import { SELECTED_WORDS_SCRIPT } from '../../shared/frame-selected-words.mts';
import type { FileElsewhere, FileNote } from './types';
import { docKind, isPlainText } from './doc-pane';
import { isTablePath } from './table-file';

/** Stored when someone closes the notes sidebar; every window reads the same key. */
export const NOTES_CLOSED_KEY = 'agentbox.notesSidebar.closed';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined;

export function notesSidebarOpen(storage: Storage): boolean {
  try { return storage?.getItem(NOTES_CLOSED_KEY) !== '1'; } catch { return true; }
}

export function rememberNotesSidebar(storage: Storage, open: boolean): void {
  try {
    if (open) storage?.removeItem(NOTES_CLOSED_KEY);
    else storage?.setItem(NOTES_CLOSED_KEY, '1');
  } catch { /* no storage: it opens next time */ }
}

/** A thread's file the pane draws as words, a table or a page. Pictures, PDFs and films have the big viewer's pins instead; a website and a change are not the thread's files. */
export function takesNotesSidebar(src: string | null | undefined): boolean {
  if (!src) return false;
  const kind = docKind(src);
  return kind === 'markdown' || kind === 'html' || (kind === null && isPlainText(src));
}

/** Words can be selected where the text is the page's own; a page also takes a pin. */
export function notesCanPoint(src: string): { words: boolean; spots: boolean } {
  const kind = docKind(src);
  if (kind === 'html') return { words: true, spots: true };
  if (kind === 'markdown' || (!kind && isPlainText(src) && !isTablePath(src))) return { words: true, spots: false };
  return { words: false, spots: false };
}

/** The page drawn whole so a pin stays on its spot, and asked to say which words are selected. */
export function pageForNotes(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('agentbox-height', '1');
    u.searchParams.set('agentbox-notes', '1');
    return u.href;
  } catch { return url; }
}

/** The same asks for a page drawn from its text, where nothing outside the frame can run a script in it. */
export function pageTextForNotes(html: string): string {
  // `<\/script>` inside a script's own text would end it early.
  const run = `${DOCUMENT_HEIGHT_SCRIPT};\n${SELECTED_WORDS_SCRIPT};`.replace(/<\/script/gi, '<\\/script');
  return `${html}\n<script>${run}</script>`;
}

type MarkLine = { ts: number; patch?: { artifact?: { do?: string; on?: unknown } } | null };

/** When each note was first sent, from the line that sent it. */
export function sentTimes(lines: readonly MarkLine[]): Map<string, number> {
  const at = new Map<string, number>();
  for (const l of lines) {
    const a = l.patch?.artifact;
    if (a?.do !== 'sent' && a?.do !== 'toagent') continue;
    for (const id of Array.isArray(a.on) ? a.on : [a.on]) if (typeof id === 'string' && !at.has(id)) at.set(id, l.ts);
  }
  return at;
}

/** The open notes on one document, split into those Send would tell the agent and the rest. */
/**
 * The file a document is on the thread's file line: its version, every version's
 * id (notes on any of them are its notes) and the copies Files may know more about.
 * A document no message named is a line of its own.
 */
export function fileFamilyFor(lines: readonly ThreadLine[], src: string): { version: FileVersion | null; fileIds: string[]; files: NamedFile[]; copies: { path: string; file: string }[] } {
  const asked = src.replace(/^\.\//, '');
  const said = notedFilesInLines(lines);
  const named = versionForPath(threadFiles(said), asked);
  const all = named ? said : [...said, { path: asked, by: null, at: 0 }];
  const families = threadFiles(all);
  const version = named ?? versionForPath(families, asked);
  const family = version ? families.find((f) => f.versions.some((x) => x.id === version.id)) : null;
  const versions = family?.versions ?? [];
  return { version, fileIds: versions.map((x) => x.id), files: all, copies: versions.map((v) => ({ path: v.path, file: v.id })) };
}

/** How many notes a file has, counting every copy's once: what the mark beside the chat says. */
export function notesBesideCount(own: readonly FileNote[], fileIds: readonly string[], elsewhere: readonly FileElsewhere[]): number {
  const ids = new Set(own.filter((n) => fileIds.includes(n.file)).map((n) => n.id));
  for (const e of elsewhere) for (const n of e.notes) ids.add(n.id);
  return ids.size;
}

export function sidebarNotes(notes: readonly FileNote[], fileIds: readonly string[], people: ReadonlyArray<{ id: string; name?: string | null }> = []) {
  const here = notes.filter((n) => fileIds.includes(n.file) && !n.resolved).sort((a, b) => a.ts - b.ts);
  const toAgent = (n: FileNote) => noteGoesTo(n, people).to === 'agent';
  return {
    waiting: here.filter((n) => !n.sent && toAgent(n)),
    said: here.filter((n) => n.sent || !toAgent(n)),
  };
}

const FILE_LINK = /(?<!!)\[([^\]]+)\]\((attachments\/[^)\s]+)\)/g;

/** Files attached to a note ride in its text as links; this lifts them out to draw as chips. */
export function noteAttachments(text: string): { words: string; files: { name: string; src: string }[] } {
  const files: { name: string; src: string }[] = [];
  const words = text.replace(FILE_LINK, (_m, name: string, src: string) => { files.push({ name, src }); return ''; });
  return files.length ? { words: words.replace(/[ \t]{2,}/g, ' ').trim(), files } : { words: text, files };
}
