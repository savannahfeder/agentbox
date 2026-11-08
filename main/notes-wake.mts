// A teammate's note on a file an agent made wakes that agent's thread: it is
// told the notes as a turn, once, the way a teammate's reply is
// (shared/artifact-marks.mts notesForItsAgent).
import { answeredNotes, approvalId, notedFilesInLines, noteGoesTo, notesForItsAgent, notesForTheAgent, stillWaiting, threadFiles, type FileMarks, type FileNote, type FileVersion, type Mark, type NotePerson } from '../shared/artifact-marks.mts';
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

interface NotesTeam {
  state?(): { me?: { id?: string } | null; people?: readonly NotePerson[] } | null | undefined;
}

export type NotesTell = (product: string, id: string, line: { text: string; from: { teammate: string | null; name: string }; fromNotes: string[] }) => Promise<unknown>;

type NotesSupervisor = ReplySupervisor & { liftBrakeForHer?(): unknown; wake?(): unknown };

const hasNews = (item: NotesItem, me: string, people: readonly NotePerson[]) => (item.artifacts?.notes ?? []).some((n) => n.by && n.by !== me && !n.resolved && !n.sent && !stillWaiting(n) && noteGoesTo(n, people).to === 'agent');

/** Tells each agent the notes on its files once; resolves to how many were told. */
export async function wakeForNotes({ store, team, tell, now = Date.now() }: {
  store: NotesStore;
  team: NotesTeam | null | undefined;
  tell: NotesTell | null | undefined;
  now?: number;
}): Promise<number> {
  const state = team?.state?.();
  const me = state?.me?.id;
  if (!me || !tell) return 0;
  // `me` was read off `state`, so it is there.
  const people = state!.people ?? [];
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? 'Someone';
  const direct = new Set(store.listProducts().filter((p) => p.team?.direct).map((p) => p.slug));
  let told = 0;
  for (const item of store.listItems(now)) {
    if (direct.has(item.product) || !hasNews(item, me, people)) continue;
    if (item.status === 'done' && item.wrote?.status?.source === 'founder') continue;
    const lines = readItemHistory(store.productDir(item.product), item.id);
    for (const ask of notesForItsAgent(lines, item.artifacts, { me, nameOf, people })) {
      // Marked first, so a tell that fails is not told again on every tick.
      store.fileMark(item.product, item.id, { do: 'sent', on: ask.ids });
      await tell(item.product, item.id, { text: ask.text, from: { teammate: ask.by, name: nameOf(ask.by) }, fromNotes: ask.ids });
      told++;
    }
  }
  return told;
}

// The next version from whoever a comment went to resolves it, so nobody presses
// Resolve on what the agent or a teammate already fixed. Only the thread's own
// copy writes it; a direct conversation has two.
export function resolveAnsweredNotes({ store, people = [], now = Date.now() }: { store: NotesStore; people?: readonly NotePerson[]; now?: number }): number {
  const direct = new Set(store.listProducts().filter((p) => p.team?.direct).map((p) => p.slug));
  let resolved = 0;
  for (const item of store.listItems(now)) {
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
// mark), which tells the agent every note it names on a file in one reply.
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
  const families = threadFiles(notedFilesInLines(readItemHistory(store.productDir(product), id)));
  const byVersion = new Map<string, { version: FileVersion; count: number; notes: FileNote[] }>();
  for (const note of (item.artifacts?.notes ?? []).filter((n) => ids.includes(n.id))) {
    if (note.resolved || note.sent || noteGoesTo(note, people).to !== 'agent') continue;
    const family = families.find((f) => f.versions.some((v) => v.id === note.file));
    const version = family?.versions.find((v) => v.id === note.file);
    if (typeof version?.agent !== 'string') continue;
    // `version` was found in `family`.
    if (!byVersion.has(version.id)) byVersion.set(version.id, { version, count: family!.versions.length, notes: [] });
    byVersion.get(version.id)!.notes.push(note);
  }
  if (!byVersion.size) return false;
  const text = [...byVersion.values()].map(({ version, count, notes }) => notesForTheAgent({ notes }, version, count, { nameOf }).text).join('\n\n');
  const sent = [...byVersion.values()].flatMap(({ notes }) => notes.map((n) => n.id));
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

// Approving a file the agent made is the go-ahead it was waiting for. A closed
// thread is left closed: approving there is a record, not a request.
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
  const text = `Approved ${version.path}. Proceed as you proposed.`;
  // fromNotes keeps the thread from drawing this reply beside the approval it already shows.
  await submitReply(supervisor, { product, id, answer: text }, () => store.answerItem(product, id, { answer: text, fromNotes: [approvalId(given)] }));
  supervisor.liftBrakeForHer?.();
  supervisor.wake?.();
  return true;
}
