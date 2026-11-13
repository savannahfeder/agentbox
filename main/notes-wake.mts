import { answeredNotes, approvalId, notedFilesInLines, noteGoesTo, notesForTheAgent, repliesForTheAgent, stillWaiting, threadFiles, unsentReplies, type FileMarks, type FileNote, type FileVersion, type Mark, type NotePerson } from '../shared/artifact-marks.mts';
import { heldByAPerson, type TeamRow } from '../shared/team-rules.mts';
import { readItemHistory } from './store/work-items.mts';
import { submitReply, type ReplyItem, type ReplySupervisor } from './live-replies.mts';

type NoteMark = { do: 'sent' | 'resolve'; on?: unknown; in?: unknown };

interface NotesItem extends TeamRow {
  id: string;
  product: string;
  artifacts?: (Pick<FileMarks, 'notes'> & Partial<Pick<FileMarks, 'approvals'>>) | null;
}

interface NotesStore {
  listProducts(): { slug: string; team?: { direct?: unknown } | null }[];
  listItems(now?: number): NotesItem[];
  productDir(product: string): string;
  fileMark(product: string, id: string, mark: NoteMark): unknown;
}

interface NoteReplyStore extends Omit<NotesStore, 'listItems'> {
  readItem(product: string, id: string): NotesItem | null;
  answerItem(product: string, id: string, input: { answer: string; fromNotes: string[] }): ReplyItem | null | undefined;
}

type NoteReadStore = Omit<NoteReplyStore, 'answerItem' | 'fileMark'>;

type NotesSupervisor = ReplySupervisor & { liftBrakeForHer?(): unknown; wake?(): unknown };

// The next version from whoever a comment went to resolves it, so nobody presses
// Resolve on what the agent or a teammate already fixed. Only the thread's own
// copy writes it; a direct conversation has two.
export function resolveAnsweredNotes({ store, people = [], now = Date.now(), items = null }: { store: NotesStore; people?: readonly NotePerson[]; now?: number; items?: readonly NotesItem[] | null }): number {
  const direct = new Set(store.listProducts().filter((p) => p.team?.direct).map((p) => p.slug));
  let resolved = 0;
  for (const item of items ?? store.listItems(now)) {
    if (direct.has(item.product)) continue;
    if (!(item.artifacts?.notes ?? []).some((n) => !n.resolved && (n.sent || people.length))) continue;
    const lines = readItemHistory(store.productDir(item.product), item.id, { max: Number.MAX_SAFE_INTEGER });
    for (const a of answeredNotes(lines, { people })) {
      store.fileMark(item.product, item.id, { do: 'resolve', on: a.on, in: a.in });
      resolved++;
    }
  }
  return resolved;
}

// Your own note on a file an agent made on your thread is you speaking to that
// agent, so it goes as your reply, the way a typed one does: a thread waiting
// on its question opens and the next tick starts the run. A note written to a
// teammate, a thank-you, or one marked `wait` waits for Send (a `toagent`
// mark), which tells the agent every note it names on a file in one reply. A
// note it already has is named again for the replies written under it since.
export async function noteToItsAgent({ store, supervisor, product, id, mark, nameOf = () => 'the person writing to you', people = [], handOffMs = 1500 }: {
  store: NoteReplyStore;
  supervisor: NotesSupervisor;
  product: string;
  id: string;
  mark: Mark | null | undefined;
  nameOf?: (by: string | null) => string;
  people?: readonly NotePerson[];
  /** How long to wait for a running agent to take the note before counting it as handed over. */
  handOffMs?: number;
}): Promise<boolean> {
  if (mark?.do === 'approve') return approvalToItsAgent({ store, supervisor, product, id, mark });
  if (mark?.do === 'note' && mark.wait) return false;
  const ids = mark?.do === 'note' ? [mark.id] : mark?.do === 'toagent' ? mark.on ?? [] : [];
  if (!ids.length || ids.some((n) => !n)) return false;
  if (store.listProducts().find((p) => p.slug === product)?.team?.direct) return false;
  const item = store.readItem(product, id);
  if (!item || heldByAPerson(item)) return false;
  const { words, sent } = notesWords({ store, product, id, item, ids, nameOf, people });
  if (!words.length) return false;
  return handOn({ store, supervisor, product, id, text: words.join('\n\n'), sent, handOffMs });
}

// A reply typed in the thread takes every comment of yours still waiting for
// Send with it, so the agent hears them in the same turn. Null when none wait.
export function replyWithWaitingNotes({ store, product, id, answer, me = null, nameOf = () => 'the person writing to you', people = [] }: {
  store: NoteReadStore;
  product: string;
  id: string;
  answer: unknown;
  me?: string | null;
  nameOf?: (by: string | null) => string;
  people?: readonly NotePerson[];
}): { answer: string; fromNotes: string[] } | null {
  if (typeof answer !== 'string' || !answer.trim() || answer === '(withdrawn)' || answer.trimStart().startsWith('/')) return null;
  const ids = waitingNotes({ store, product, id, me, people });
  if (!ids.length) return null;
  // `waitingNotes` found notes on it, so it is there.
  const { words, sent } = notesWords({ store, product, id, item: store.readItem(product, id)!, ids, nameOf, people });
  return words.length ? { answer: [...words, answer].join('\n\n'), fromNotes: sent } : null;
}

/** Your comments still waiting for Send on this thread, and those with a reply of yours waiting under them. */
export function waitingNotes({ store, product, id, me = null, people = [] }: {
  store: NoteReadStore;
  product: string;
  id: string;
  me?: string | null;
  people?: readonly NotePerson[];
}): string[] {
  if (store.listProducts().find((p) => p.slug === product)?.team?.direct) return [];
  const item = store.readItem(product, id);
  if (!item || heldByAPerson(item)) return [];
  const mine = (by: string | null | undefined) => (by ?? null) === (me ?? null);
  return (item.artifacts?.notes ?? [])
    .filter((n) => !n.resolved && ((mine(n.by) && stillWaiting(n)) || unsentReplies(n, people).some((r) => mine(r.by))))
    .map((n) => n.id);
}

function notesWords({ store, product, id, item, ids, nameOf, people }: {
  store: NoteReadStore;
  product: string;
  id: string;
  item: NotesItem;
  ids: string[];
  nameOf: (by: string | null) => string;
  people: readonly NotePerson[];
}): { words: string[]; sent: string[] } {
  const families = threadFiles(notedFilesInLines(readItemHistory(store.productDir(product), id)));
  const byVersion = new Map<string, { version: FileVersion; count: number; notes: FileNote[] }>();
  const words: string[] = [];
  const sent: string[] = [];
  for (const note of (item.artifacts?.notes ?? []).filter((n) => ids.includes(n.id))) {
    const later = unsentReplies(note, people);
    if (note.resolved || (note.sent && !later.length) || noteGoesTo(note, people).to !== 'agent') continue;
    const family = families.find((f) => f.versions.some((v) => v.id === note.file));
    const version = family?.versions.find((v) => v.id === note.file);
    if (typeof version?.agent !== 'string') continue;
    // `version` was found in `family`.
    if (note.sent) {
      words.push(repliesForTheAgent(note, later, version, family!.versions.length, { nameOf }));
      sent.push(...later.map((r) => r.id));
      continue;
    }
    if (!byVersion.has(version.id)) byVersion.set(version.id, { version, count: family!.versions.length, notes: [] });
    byVersion.get(version.id)!.notes.push(note);
  }
  for (const { version, count, notes } of byVersion.values()) {
    words.push(notesForTheAgent({ notes }, version, count, { nameOf }).text);
    sent.push(...notes.flatMap((n) => [n.id, ...(n.replies ?? []).map((r) => r.id)]));
  }
  return { words, sent };
}

async function handOn({ store, supervisor, product, id, text, sent, handOffMs }: {
  store: NoteReplyStore;
  supervisor: NotesSupervisor;
  product: string;
  id: string;
  text: string;
  sent: string[];
  handOffMs: number;
}): Promise<boolean> {
  const going = submitReply(supervisor, { product, id, answer: text }, () => store.answerItem(product, id, { answer: text, fromNotes: sent }))
    .then(() => { supervisor.liftBrakeForHer?.(); supervisor.wake?.(); });
  // A running agent acknowledges a line at its next break, which can be minutes
  // into a long command. Once written to its input the line is the CLI's, so the
  // note box is not held for that, and a quick failure still leaves the notes unsent.
  let timer: NodeJS.Timeout | undefined;
  const handedOff = await Promise.race([
    going.then(() => true),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), handOffMs); }),
  ]).finally(() => clearTimeout(timer));
  if (!handedOff) going.catch((err: unknown) => console.warn(`[notes] a note to the agent on ${id} was not saved as a reply: ${(err as Error | null)?.message ?? err}`));
  store.fileMark(product, id, { do: 'sent', on: sent });
  return true;
}

// Approving a file this thread's agent made is the go-ahead it was waiting for.
// A closed thread is left closed: approving there is a record, not a request.
async function approvalToItsAgent({ store, supervisor, product, id, mark }: {
  store: NoteReplyStore;
  supervisor: NotesSupervisor;
  product: string;
  id: string;
  mark: Extract<Mark, { do: 'approve' | 'unapprove' }>;
}): Promise<boolean> {
  if (!mark.file || store.listProducts().find((p) => p.slug === product)?.team?.direct) return false;
  const item = store.readItem(product, id);
  if (!item || item.status === 'done' || heldByAPerson(item)) return false;
  const families = threadFiles(notedFilesInLines(readItemHistory(store.productDir(product), id)));
  const version = families.flatMap((f) => f.versions).find((v) => v.id === mark.file);
  if (typeof version?.agent !== 'string') return false;
  const given = (item.artifacts?.approvals ?? []).filter((a) => a.file === mark.file).sort((a, b) => b.ts - a.ts)[0];
  if (!given) return false;
  // A teammate's version is theirs to act on; approving it tells this agent nothing.
  if (version.by && version.by !== given.by && version.by !== (item.runner ?? item.createdBy ?? null)) return false;
  const text = `Approved ${version.path}. Proceed as you proposed.`;
  // fromNotes keeps the thread from drawing this reply beside the approval it already shows.
  await submitReply(supervisor, { product, id, answer: text }, () => store.answerItem(product, id, { answer: text, fromNotes: [approvalId(given)] }));
  supervisor.liftBrakeForHer?.();
  supervisor.wake?.();
  return true;
}
