// What a reference in a message is and the short name it goes by, for the
// quiet mention that draws it (components/Mention.tsx). She chose the mention
// over chips, cards and coloured tags on 2026-10-11 (w-a3a7d1a1ec): the icon
// says what kind of thing it is, the name says which, and the full path waits
// in the hover title rather than sitting orange in the sentence.
import { sourceReference } from './source-reference.mjs';
import { isMediaPath } from './artifact-paths';

export type MentionKind = 'thread' | 'folder' | 'page' | 'doc' | 'image' | 'code' | 'media' | 'link' | 'file';

const ADDRESS = /^(?:[a-z][a-z0-9+.-]*:)/i;

export function mentionKind(target: string): MentionKind {
  const value = (target ?? '').trim();
  if (!value) return 'file';
  if (ADDRESS.test(value) && !/^file:/i.test(value)) return 'link';
  if (/\/$/.test(value)) return 'folder';
  const bare = value.replace(/[?#].*$/, '');
  if (/\.html?$/i.test(bare)) return 'page';
  if (/\.(md|markdown|txt|pdf|docx?|rtf)$/i.test(bare)) return 'doc';
  if (/\.(png|jpe?g|gif|webp|svg|heic)$/i.test(bare)) return 'image';
  if (isMediaPath(value)) return 'media';
  if (sourceReference(value)) return 'code';
  return 'file';
}

export function mentionName(target: string): string {
  const value = (target ?? '').trim();
  if (/^mailto:/i.test(value)) return value.slice('mailto:'.length);
  if (ADDRESS.test(value) && !/^file:/i.test(value)) return value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
  const parts = value.replace(/^file:\/\//i, '').replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || value;
}

// What a mention shows in place of what the worker wrote. A path or an address
// written out, in full or in part, is shortened to the name it goes by; words
// the worker chose ("the page") come back null and stay theirs. A file name
// with a space in it counts as written out when the words end with it.
export function mentionLabel(target: string, text: string | null | undefined): string | null {
  const name = mentionName(target);
  const words = text?.trim();
  if (!words || words === target) return name;
  if (mentionKind(target) === 'link') {
    return !/\s/.test(words) && /[/.:]/.test(words) ? name : null;
  }
  if (words.endsWith(name)) return name;
  return !/\s/.test(words) && /[/.]/.test(words) ? mentionName(words) : null;
}

// A design folder named after a thread goes by that thread: its own thread's
// folder is "Designs for this thread", another thread's carries that thread's
// title, and anything else keeps its own name.
export function folderTitle(folder: string, { thread, name }: { thread?: string; name?: (id: string) => string | null }): string {
  const parts = folder.replace(/\/+$/, '').split('/');
  const last = parts[parts.length - 1] ?? folder;
  if (parts[parts.length - 2] !== 'designs' || !/^w-[a-f0-9]{10}$/i.test(last)) return last;
  if (last === thread) return 'Designs for this thread';
  const title = name?.(last);
  return title ? `Designs for ${title}` : last;
}
