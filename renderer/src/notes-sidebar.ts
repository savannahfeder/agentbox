import { noteGoesTo } from '../../shared/artifact-marks.mjs';
import { DOCUMENT_HEIGHT_SCRIPT } from '../../shared/frame-document-height.mts';
import { SELECTED_WORDS_SCRIPT } from '../../shared/frame-selected-words.mts';
import type { FileNote } from './types';
import { isLocalPreview } from './artifact-layout';
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

/** Every file the pane draws itself. A website, a local app and a code change are not files to note. */
export function takesNotesSidebar(src: string | null | undefined): boolean {
  const path = String(src ?? '');
  if (!path || isLocalPreview(path)) return false;
  const kind = docKind(path);
  return kind ? kind !== 'website' && kind !== 'code' : isPlainText(path);
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

/** The open notes on one document, split into those Send would tell the agent and the rest. */
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
