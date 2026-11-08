// The seed for a thread of your own that carries on a teammate's shared one:
// what was said, quoted under who said it, and the files their copy sent.
import fs from 'node:fs';
import path from 'node:path';
import { isContinuedNote } from '../../shared/thread-continued.mts';
import type { SharedPatch, SharedThreadView } from './thread-share.mts';

// Enough for the agent to pick up the thread without one old thread filling its prompt.
export const CONTINUE_MESSAGES = 20;
export const CONTINUE_MESSAGE_CHARS = 2_000;

const FILE_LINK = /(!?)\[([^\]\n]*)\]\(attachments\/([\w.-]+)\)/g;
const shownName = (name: string) => name.replace(/^[0-9a-f]{12}-/, '');
const quoted = (text: string) => text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');

export interface ContinueFile { name: string; srcPath: string }

export interface ContinueBrief { title: string; body: string; files: ContinueFile[] }

/** `work` is what this copy holds of the thread (thread-share.mts `read`). */
export function briefToContinue({ work, title, ownerName, nameOf }: {
  work: Pick<SharedThreadView, 'lines' | 'earlier'> & { dir: string };
  title?: string | null;
  ownerName: string;
  nameOf: (id: string | undefined) => string | null;
}): ContinueBrief {
  const files = new Map<string, ContinueFile>();
  const unlinked = (text: string) => text.replace(FILE_LINK, (_: string, bang: string, label: string, name: string) => {
    const srcPath = path.join(work.dir, 'attachments', name);
    const shown = shownName(name);
    if (fs.existsSync(srcPath) && !files.has(name)) {
      const taken = [...files.values()].some((f) => f.name === shown);
      files.set(name, { name: taken ? name : shown, srcPath });
    }
    return bang || !label || label === shown ? shown : `${label} (${shown})`;
  });

  const said: { who: string; text: string }[] = [];
  const lines = [...(work.lines ?? [])].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  for (const l of lines) {
    const p: SharedPatch = l.patch ?? {};
    if (p.comment) {
      if (!isContinuedNote(p.comment.text) && p.comment.text) said.push({ who: `${nameOf(l.by) ?? 'Someone'} commented`, text: p.comment.text });
      continue;
    }
    const text = (['body', 'answer', 'result', 'note'] as const).map((f) => p[f]).filter(Boolean).join('\n\n');
    if (!text) continue;
    said.push({ who: l.source === 'founder' ? (nameOf(l.by) ?? ownerName) : `${ownerName}'s agent`, text });
  }
  const kept = said.slice(-CONTINUE_MESSAGES);
  const earlier = (work.earlier ?? 0) + said.length - kept.length;
  const quotes = kept.map(({ who, text }) => {
    const clean = unlinked(text).trim();
    const cut = clean.length > CONTINUE_MESSAGE_CHARS ? `${clean.slice(0, CONTINUE_MESSAGE_CHARS)}…` : clean;
    // Plain, because a person's words are drawn as typed, never as markdown.
    return quoted(`${who}: ${cut}`);
  });

  const named = title || `${ownerName}'s thread`;
  const body = [
    // A short first line on its own is what the composer names a thread by.
    named,
    `I'm carrying on ${ownerName}'s thread. Here is what was said there.`,
    ...(earlier ? [`(${earlier} earlier message${earlier === 1 ? ' is' : 's are'} not quoted.)`] : []),
    ...quotes,
    ...(files.size ? [`The files from that thread are attached.`] : []),
  ].join('\n\n');
  return { title: named, body, files: [...files.values()] };
}
