// PURE. The words around a teammate's shared thread, and finding one by name.
import type { AgentEvent, LinkCommentWaiting, ThreadCard } from '../types';
import { askIsOpen, askOf, handBackReadBy, isHandBack, type AskRow } from '../../../shared/thread-asks.mts';
import { filesInLines, placeWords, threadFiles, versionForPath, type FileNote, type ThreadLine } from '../../../shared/artifact-marks.mts';

/**
 * The owner's thread as you read it: what you wrote to their agent is yours and
 * says so, both your comment before their copy passes it on and the line it
 * writes once it has (`from` you on an answer), which outlives the ask.
 */
export function shownOnTheirThread(events: readonly AgentEvent[], { me, helping, owner = '' }: { me: string | null; helping: boolean | ((at: number) => boolean); owner?: string }): AgentEvent[] {
  const helped = typeof helping === 'function' ? helping : () => helping;
  return events.map((e) => {
    if (e.kind || !me) return e;
    // The owner's copy wrote "You asked" for its owner; here the reader is the helper.
    if (isHandBack(e.text)) return { ...e, text: handBackReadBy(e.text ?? '', e.fromId === me ? 'helper' : 'other', owner) };
    if (e.fromId === me && !isHandBack(e.text)) {
      const { from: _from, fromId: _fromId, ...rest } = e;
      return { ...rest, who: 'you' as const, by: me, says: 'to-agent' as const };
    }
    return e.says === 'comment' && e.by === me && helped(e.at) ? { ...e, says: 'to-agent' as const } : e;
  });
}

/**
 * Whether a help ask on you covered words you wrote on this thread at `at`, so
 * the owner's copy passes them to its agent (`helpAskCovering` on that side).
 */
export function helpedWhen(rows: readonly AskRow[], me: string | null, owner: string, thread: string, at: number): boolean {
  return rows.some((r) => {
    const a = askOf(r);
    if (!a || a.kind !== 'help' || a.owner !== owner || a.thread !== thread || !me || r.assignee !== me) return false;
    if (at < (r.wrote?.ask?.ts ?? r.createdAt ?? 0)) return false;
    if (r.status !== 'done' && r.wrote?.status?.by === me) return false;
    return askIsOpen(r) || at <= (r.wrote?.verdict?.ts ?? r.wrote?.status?.ts ?? r.updatedAt ?? 0);
  });
}

/**
 * What a key in the box under a teammate's thread presses. A review's Enter is
 * a new line, and Ctrl or ⌘ Enter sends its words as changes, the one verdict
 * that needs them.
 */
export function keyInTheBox(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; isComposing?: boolean }, { reviewing, words }: { reviewing: boolean; words: string }): 'send' | 'changes' | null {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return null;
  if (!reviewing) return 'send';
  return (e.ctrlKey || e.metaKey) && words.trim() ? 'changes' : null;
}

/**
 * What folds behind "Show earlier messages" and what is drawn under the newest
 * answer: anything said after it, so a reply you just sent is never folded.
 * `answer` is the event lifted out, or null when the answer is the row's result.
 */
export function aroundTheAnswer<E extends { at: number }>(events: readonly E[], answer: E | null, answerAt: number | null): { before: E[]; after: E[] } {
  const rest = events.filter((e) => e !== answer);
  if (answerAt == null) return { before: rest, after: [] };
  return { before: rest.filter((e) => e.at <= answerAt), after: rest.filter((e) => e.at > answerAt) };
}

/**
 * Whether words you handed back are still on their way to the owner's thread,
 * so the page draws them itself: until a line said since holds them. The line
 * is stamped by the owner's computer, whose clock may run a little behind.
 */
const CLOCKS_DIFFER_MS = 2 * 60_000;
export function stillOnItsWay(events: readonly AgentEvent[], sent: { at: number; text: string } | null): boolean {
  if (!sent) return false;
  return !events.some((e) => !e.kind && e.at >= sent.at - CLOCKS_DIFFER_MS && String((e as { text?: string }).text ?? '').includes(sent.text));
}

/**
 * The notes you left on a teammate's files while their review was on you, held
 * for your reply: said under each file's name, in the order you wrote them.
 */
export function notesWithYourReply(notes: readonly FileNote[], names: readonly { id: string; name: string }[], me: string | null, since: number): { text: string; ids: string[] } {
  const held = notes.filter((n) => n.by === me && n.wait && !n.sent && !n.resolved && !n.toAgent && n.ts >= since && !(n.mentions ?? []).some((m) => m !== me));
  const byFile = new Map<string, FileNote[]>();
  for (const n of held) byFile.set(n.file, [...(byFile.get(n.file) ?? []), n]);
  const nameOf = new Map(names.map((v) => [v.id, v.name]));
  const parts = [...byFile].map(([file, these]) => [`Notes on ${nameOf.get(file) ?? 'a file'}:`, ...these.map((n) => `- ${placeWords(n)}: ${n.text}`)].join('\n'));
  return { text: parts.join('\n\n'), ids: [...byFile.values()].flat().map((n) => n.id) };
}

/**
 * Where an ask on you goes among the owner's messages: after the message `after`
 * (an index into `events`), above them all, or at the foot under the outcome.
 */
export function whereTheAskGoes(events: readonly { at: number }[], outcome: { at: number } | null, askAt: number | null): { after: number } | 'top' | 'foot' {
  if (askAt == null) return 'foot';
  const later = events.findIndex((e) => e.at > askAt);
  if (later === -1) return outcome && outcome.at > askAt ? (events.length ? { after: events.length - 1 } : 'top') : 'foot';
  return later === 0 ? 'top' : { after: later - 1 };
}

/** Whom the box under a teammate's thread writes to. */
export type BoxTarget = 'comment' | 'review' | 'agent';

export const boxTarget = (kind: 'help' | 'review' | null | undefined): BoxTarget => (kind === 'review' ? 'review' : kind === 'help' ? 'agent' : 'comment');

/** One draft per target, so words never change whom they go to on their own. */
export const draftAtFor = (personId: string, threadId: string, target: BoxTarget) => ({ product: `teammate:${personId}`, id: target === 'comment' ? threadId : `${threadId}:${target}` });

/** Whether this task is the ask the open teammate's thread page carries, so L and E on the page act on it. */
export const isTheAskOn = (item: { ask?: { owner: string; thread: string } | null }, card: { personId: string; threadId: string } | null): boolean =>
  !!card && !!item.ask && item.ask.owner === card.personId && item.ask.thread === card.threadId;

export const askEndedWords =(owner: string, handedToYou: boolean) => (handedToYou ? `${owner} handed this thread to you.` : `${owner} took the ask back.`);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const earlierWords = (n: number, owner: string) => `${plural(n, 'earlier message')} ${n === 1 ? 'stays' : 'stay'} on ${owner}'s computer.`;

export const notSharedWords = (owner: string) => `${owner}'s app has not shared these messages yet.`;

/** The people's words for a waiting comment on a row: "Maya commented: …". */
export function commentLine(comments: { by: string; text: string }[] | undefined, nameOf: (id: string) => string): string | null {
  if (!comments?.length) return null;
  const last = comments[comments.length - 1];
  const others = new Set(comments.map((c) => c.by)).size - 1;
  return `${nameOf(last.by)}${others > 0 ? ` and ${plural(others, 'other')}` : ''} commented: ${last.text}`;
}

const clock = (s: number) => { const w = Math.floor(s); return `${Math.floor(w / 60)}:${String(w % 60).padStart(2, '0')}`; };

/** Comments on a thread's shared links, as one line on its row however many there are. */
export function linkCommentLine(comments: readonly LinkCommentWaiting[] | undefined): string | null {
  if (!comments?.length) return null;
  const last = comments[comments.length - 1];
  const at = last.place?.kind === 'time' ? ` at ${clock(last.place.s)}` : '';
  if (comments.length === 1) return `${last.name} commented on ${last.file}${at}: ${last.text}`;
  const files = new Set(comments.map((c) => c.file));
  const people = [...new Set(comments.map((c) => c.name))].sort();
  const who = people.length > 2 ? `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}` : people.join(' and ');
  return `${comments.length} comments on ${files.size === 1 ? last.file : plural(files.size, 'file')} from ${who}: ${last.text}`;
}

/** Teammates' threads whose title holds every word typed, for Ctrl+K. */
export function teammateThreadsFound(cards: ThreadCard[], me: string | null | undefined, query: string): ThreadCard[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return cards.filter((c) => {
    if (c.personId === me || !c.visible || !c.title) return false;
    const title = c.title.toLowerCase();
    return words.every((w) => title.includes(w));
  });
}

/**
 * Whether the conversation's end was in view before the box under it grew by
 * `by` px. The scroll is already that much shorter when this is asked, so the
 * end counts as in view if it was within 8px of the old bottom.
 */
export function endWasInView(scroll: { scrollHeight: number; scrollTop: number; clientHeight: number }, by: number): boolean {
  return by > 0 && scroll.scrollHeight - scroll.scrollTop - (scroll.clientHeight + by) < 8;
}

/** Under the "Waiting on Dev" at the top of a teammate's thread: what that means, in one line. */
export function standingLine(state: ThreadCard['state'], owner: string, waits: string | null): string | null {
  if (state === 'running') return `${owner}'s agent is working on it.`;
  if (state === 'waiting') return waits ? 'It starts again when that is done.' : `The agent stopped. ${owner} looks at it next.`;
  return null;
}

/**
 * The files beside a teammate's thread: each file once, at its newest version,
 * with the notes on any of its versions. The same families the file view
 * pages through (shared/artifact-marks.mts), so a note counted here is one it shows.
 */
export function filesOnThread(lines: readonly ThreadLine[], notes: { file: string }[]): { src: string; name: string; notes: number }[] {
  return threadFiles(filesInLines(lines)).map((family) => {
    const newest = family.versions[family.versions.length - 1];
    const ids = new Set(family.versions.map((v) => v.id));
    return { src: newest.path, name: newest.name, notes: notes.filter((n) => ids.has(n.file)).length };
  });
}

/** How many notes are on this file, any version of it: what the pane beside the chat says. */
export function notesOnFile(lines: readonly ThreadLine[], notes: readonly { file: string }[], src: string): number {
  const families = threadFiles(filesInLines(lines));
  const version = versionForPath(families, src);
  const family = version ? families.find((f) => f.versions.some((v) => v.id === version.id)) : null;
  const ids = new Set((family?.versions ?? []).map((v) => v.id));
  return notes.filter((n) => ids.has(n.file)).length;
}
