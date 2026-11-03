import { noteGoesTo } from '../../shared/artifact-marks.mjs';
import type { FileNote } from './types';

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

/** A thread's markdown document is the one kind the sidebar sits beside. */
export const takesNotesSidebar = (src: string | null | undefined) => /\.(md|markdown)$/i.test(String(src ?? '').split(/[?#]/)[0]);

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
