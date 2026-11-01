// A teammate's note on a file an agent made wakes that agent's thread: it is
// told the notes as a turn, once, the way a teammate's reply is
// (shared/artifact-marks.mjs notesForItsAgent).
import { notedFilesInLines, noteGoesTo, notesForItsAgent, notesForTheAgent, threadFiles } from '../shared/artifact-marks.mjs';
import { heldByAPerson } from '../shared/team-rules.mjs';
import { readItemHistory } from './store/work-items.mjs';
import { submitReply } from './live-replies.mjs';

const hasNews = (item, me, people) => (item.artifacts?.notes ?? []).some((n) => n.by && n.by !== me && !n.resolved && !n.sent && noteGoesTo(n, people).to === 'agent');

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

// Your own note on a file an agent made on your thread is you speaking to that
// agent, so it goes as your reply, the way a typed one does: a thread waiting
// on its question opens and the next tick starts the run. A note written to a
// teammate, or a thank-you, waits for "Send to the agent" (a `toagent` mark).
export async function noteToItsAgent({ store, supervisor, product, id, mark, nameOf = () => 'the person writing to you', people = [] }) {
  const ids = mark?.do === 'note' ? [mark.id] : mark?.do === 'toagent' ? mark.on ?? [] : [];
  if (!ids.length || ids.some((n) => !n)) return false;
  if (store.listProducts().find((p) => p.slug === product)?.team?.direct) return false;
  const item = store.readItem(product, id);
  if (!item || heldByAPerson(item)) return false;
  const families = threadFiles(notedFilesInLines(readItemHistory(store.productDir(product), id)));
  let went = false;
  for (const note of (item.artifacts?.notes ?? []).filter((n) => ids.includes(n.id))) {
    if (note.resolved || note.sent || noteGoesTo(note, people).to !== 'agent') continue;
    const family = families.find((f) => f.versions.some((v) => v.id === note.file));
    const version = family?.versions.find((v) => v.id === note.file);
    if (typeof version?.agent !== 'string') continue;
    const { text } = notesForTheAgent({ notes: [note] }, version, family.versions.length, { nameOf });
    // Marked after, so a reply that fails leaves the note to send again.
    await submitReply(supervisor, { product, id, answer: text }, () => store.answerItem(product, id, { answer: text, fromNotes: [note.id] }));
    store.fileMark(product, id, { do: 'sent', on: [note.id] });
    went = true;
  }
  if (!went) return false;
  supervisor.liftBrakeForHer?.();
  supervisor.wake?.();
  return true;
}
