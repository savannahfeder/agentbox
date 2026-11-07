// A teammate's note on a file an agent made wakes that agent's thread: it is
// told the notes as a turn, once, the way a teammate's reply is
// (shared/artifact-marks.mjs notesForItsAgent).
import { answeredNotes, approvalId, notedFilesInLines, noteGoesTo, notesForItsAgent, notesForTheAgent, stillWaiting, threadFiles } from '../shared/artifact-marks.mjs';
import { heldByAPerson } from '../shared/team-rules.mjs';
import { readItemHistory } from './store/work-items.mjs';
import { submitReply } from './live-replies.mts';

const hasNews = (item, me, people) => (item.artifacts?.notes ?? []).some((n) => n.by && n.by !== me && !n.resolved && !n.sent && !stillWaiting(n) && noteGoesTo(n, people).to === 'agent');

export async function wakeForNotes({ store, team, tell, now = Date.now() }) {
  const state = team?.state?.();
  const me = state?.me?.id;
  if (!me || !tell) return 0;
  const people = state.people ?? [];
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'Someone';
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
export function resolveAnsweredNotes({ store, people = [], now = Date.now() }) {
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
export async function noteToItsAgent({ store, supervisor, product, id, mark, nameOf = () => 'the person writing to you', people = [], handOffMs = 1500 }) {
  if (mark?.do === 'approve') return approvalToItsAgent({ store, supervisor, product, id, mark });
  if (mark?.do === 'note' && mark.wait) return false;
  const ids = mark?.do === 'note' ? [mark.id] : mark?.do === 'toagent' ? mark.on ?? [] : [];
  if (!ids.length || ids.some((n) => !n)) return false;
  if (store.listProducts().find((p) => p.slug === product)?.team?.direct) return false;
  const item = store.readItem(product, id);
  if (!item || heldByAPerson(item)) return false;
  const families = threadFiles(notedFilesInLines(readItemHistory(store.productDir(product), id)));
  const byVersion = new Map();
  for (const note of (item.artifacts?.notes ?? []).filter((n) => ids.includes(n.id))) {
    if (note.resolved || note.sent || noteGoesTo(note, people).to !== 'agent') continue;
    const family = families.find((f) => f.versions.some((v) => v.id === note.file));
    const version = family?.versions.find((v) => v.id === note.file);
    if (typeof version?.agent !== 'string') continue;
    if (!byVersion.has(version.id)) byVersion.set(version.id, { version, count: family.versions.length, notes: [] });
    byVersion.get(version.id).notes.push(note);
  }
  if (!byVersion.size) return false;
  const text = [...byVersion.values()].map(({ version, count, notes }) => notesForTheAgent({ notes }, version, count, { nameOf }).text).join('\n\n');
  const sent = [...byVersion.values()].flatMap(({ notes }) => notes.map((n) => n.id));
  const going = submitReply(supervisor, { product, id, answer: text }, () => store.answerItem(product, id, { answer: text, fromNotes: sent }))
    .then(() => { supervisor.liftBrakeForHer?.(); supervisor.wake?.(); });
  // A running agent acknowledges a line at its next break, which can be minutes
  // into a long command. Once written to its input the line is the CLI's, so the
  // note box is not held for that, and a quick failure still leaves the notes unsent.
  let timer;
  const handedOff = await Promise.race([
    going.then(() => true),
    new Promise((resolve) => { timer = setTimeout(() => resolve(false), handOffMs); }),
  ]).finally(() => clearTimeout(timer));
  if (!handedOff) going.catch((err) => console.warn(`[notes] a note to the agent on ${id} was not saved as a reply: ${err?.message ?? err}`));
  store.fileMark(product, id, { do: 'sent', on: sent });
  return true;
}

// Approving a file the agent made is the go-ahead it was waiting for. A closed
// thread is left closed: approving there is a record, not a request.
async function approvalToItsAgent({ store, supervisor, product, id, mark }) {
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
