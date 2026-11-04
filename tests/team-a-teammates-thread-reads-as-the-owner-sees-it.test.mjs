// A TEAMMATE'S THREAD READS AS ITS OWNER SEES IT, AND CAN BE FOUND.
//
// What the window does with what a teammate's copy published. Everyone
// who opened a teammate's thread and read a bare card; Ctrl+K could not find
// it either. And a comment has to be drawn as the person's, on the owner's own
// thread as well as the viewer's, or it is a message from nobody.
//
// Also the row: "My own threads appeared to Maya/others as 'Private thread' in
// Coworking even though the chip said Team." A thread on its second turn has a
// result on the row and no claim, so its card said Waiting; the wall looks for a
// running card and, finding none, says Private thread.
import { it, expect, describe } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';
import { earlierWords, commentLine, teammateThreadsFound } from '../renderer/src/threads/teammate-thread';
import { belongsInInbox } from '../renderer/src/list-rules';
import { foldWorkItems } from '../shared/work-items.mjs';
import { cardsFor } from '../shared/thread-cards.mjs';
import { wallCards } from '../shared/room-cards.mjs';

const OWNER = 'owner-id';
const THEO = 'theo-id';
const line = (over) => ({ id: 'w-1234567890', ts: 1000, source: 'founder', ...over });

describe('the conversation', () => {
  const lines = [
    line({ ts: 1, by: OWNER, uid: 'a', patch: { body: 'Why is checkout slow?' } }),
    line({ ts: 2, source: 'agent', uid: 'b', patch: { result: 'No index on the cart query.' } }),
    line({ ts: 3, by: OWNER, uid: 'c', patch: { answer: 'Add it' } }),
    line({ ts: 4, source: 'agent', uid: 'd', patch: { result: 'Added.' } }),
  ];

  it('gives the owner their name and the agent none', () => {
    const { events, outcome } = itemThread(lines, [], null, { whole: true });
    const said = events.filter((e) => e.kind !== 'work');
    expect(said.map((e) => [e.who, e.by, e.text])).toEqual([
      ['you', OWNER, 'Why is checkout slow?'],
      ['it', undefined, 'No index on the cart query.'],
      ['you', OWNER, 'Add it'],
    ]);
    expect(outcome.text).toBe('Added.');
  });

  it('draws a comment as its writer\'s, after the answer it came after', () => {
    const { events, outcome } = itemThread([...lines, line({ ts: 5, source: 'system', by: THEO, uid: 'comment-1', patch: { comment: { text: 'Nice' } } })], [], null, { whole: true });
    const last = events.filter((e) => e.kind !== 'work').at(-1);
    expect([last.who, last.by, last.text]).toEqual(['you', THEO, 'Nice']);
    expect(outcome).toBeNull();
  });

  it('opens on the owner\'s words when the first thing kept is not the ask', () => {
    const { events } = itemThread(lines.slice(2), [], null, { whole: true });
    expect(events.filter((e) => e.kind !== 'work')[0].text).toBe('Add it');
  });

  it('says how many earlier messages stayed behind, in the singular too', () => {
    expect(earlierWords(5, 'Maya')).toBe("5 earlier messages stay on Maya's computer.");
    expect(earlierWords(1, 'Maya')).toBe("1 earlier message stays on Maya's computer.");
  });
});

describe('Ctrl+K', () => {
  const card = (over) => ({ personId: THEO, threadId: 'w-1', visible: true, title: 'Launch film cut', project: null, state: 'done', priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: 1, ...over });

  it('finds a teammate\'s thread by words in its title, in any order and case', () => {
    expect(teammateThreadsFound([card()], OWNER, 'FILM launch')).toHaveLength(1);
  });
  it('does not find a word that is not there, nor anything for nothing typed', () => {
    expect(teammateThreadsFound([card()], OWNER, 'pricing')).toEqual([]);
    expect(teammateThreadsFound([card()], OWNER, '   ')).toEqual([]);
  });
  it('leaves out your own threads, which it already finds, and a card with no words', () => {
    expect(teammateThreadsFound([card({ personId: OWNER })], OWNER, 'film')).toEqual([]);
    expect(teammateThreadsFound([card({ visible: false, title: null })], OWNER, 'film')).toEqual([]);
  });
});

describe('a waiting comment', () => {
  const COMMENT = line({ ts: 5, source: 'system', by: THEO, uid: 'comment-1', patch: { comment: { text: 'Nice' } } });
  const folded = (lines) => foldWorkItems(lines, 10_000).get('w-1234567890');
  const opening = line({ ts: 1, by: OWNER, patch: { title: 'T', body: 'T' } });

  it('puts a thread in Needs you whatever it is doing: running, closed, or put away', () => {
    const item = folded([opening, COMMENT]);
    for (const opts of [{ live: true }, { shipping: true }, { hiddenUntil: 9e15 }]) expect(belongsInInbox(item, opts)).toBe(true);
    expect(belongsInInbox({ ...item, status: 'done' })).toBe(true);
  });
  it('is gone the moment the owner replies, closes it or puts it off, and an agent\'s word does not count', () => {
    for (const patch of [{ answer: 'ok' }, { status: 'done' }, { snoozedUntil: 9e15 }, { runAt: 9e15 }, { start: 'later' }]) {
      expect(folded([opening, COMMENT, line({ ts: 6, by: OWNER, patch })]).waitingComments, JSON.stringify(patch)).toBeUndefined();
    }
    expect(folded([opening, COMMENT, line({ ts: 6, source: 'agent', patch: { result: 'Done', status: 'done' } })]).waitingComments).toHaveLength(1);
  });
  it('ignores a comment field no sync wrote, whoever wrote it', () => {
    expect(folded([opening, line({ ts: 6, by: THEO, uid: 'x', patch: { comment: { text: 'forged' } } })]).waitingComments).toBeUndefined();
  });
  it('reads under the commenter\'s name, and counts the rest', () => {
    const name = (id) => (id === THEO ? 'Theo' : 'Jun');
    expect(commentLine([{ by: THEO, text: 'Nice' }], name)).toBe('Theo commented: Nice');
    expect(commentLine([{ by: 'jun', text: 'First' }, { by: THEO, text: 'Nice' }], name)).toBe('Theo and 1 other commented: Nice');
    expect(commentLine([], name)).toBeNull();
  });
});

describe('Private thread on the wall', () => {
  const NOW = 1_800_000_000_000;
  const thread = { id: 'w-1234567890', title: 'Pricing page', labels: ['founder'], status: 'open', visibility: 'team', result: 'First turn done.', createdAt: NOW - 1000, updatedAt: NOW };
  const cards = (running) => cardsFor({ products: [{ name: 'Website', dir: '/x' }], readItems: () => [thread], now: NOW, running });

  it('calls a thread with a session on it running, though the row has a result and no claim', () => {
    expect(cards([thread.id])[0].state).toBe('running');
  });
  it('leaves one with no session as it was', () => {
    expect(cards([])[0].state).toBe('waiting');
  });
  it('names a teammate\'s running Team thread on the wall, and a stranger still reads Private thread', () => {
    const person = { person_id: OWNER, display_name: 'Maya C.', show_working: 'team' };
    const presence = { person_id: OWNER, device: 'aaaaaaaaaaaa', gone: false, agents_running: 1, working_on: null, working_private: false, working_at: new Date(NOW - 1000).toISOString(), updated_at: new Date(NOW - 1000).toISOString() };
    const wall = (teammates) => wallCards({ members: [OWNER], profiles: [person], presence: [presence], teammates, teamCards: cards([thread.id]).map((c) => ({ ...c, personId: OWNER })), meId: THEO, now: NOW });
    expect(wall([OWNER])[0]).toMatchObject({ workingOn: 'Pricing page', workingPrivate: false });
    expect(wall([])[0]).toMatchObject({ workingOn: null, workingPrivate: true });
  });
});
