// YOUR HAND-BACK READS AS THE MESSAGE YOU SENT (w-9767199d02, 2026-11-23).
//
// The founder approved two of Tony's pictures, pressed Looks good, and her page
// then said only "Approved …", "Approved …", "Handed it back": "I need to see
// what my message to him looks like because this is a conversation." Tony's
// thread said "Dana reviewed this and it looks good." under her own name.
// Measured on two test copies of the app. Both pages now draw one message under
// her name with the same words, the verdict, what she wrote and the files she
// approved; Tony's adds his question under it, apart.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadEvents } from '../renderer/src/thread-history';
import { handBackAsSent, shownOnTheirThread } from '../renderer/src/threads/teammate-thread';
import { messageKind } from '../renderer/src/threads/message-kind';
import { handedBackWords } from '../shared/thread-asks.mts';
import { JUST_ITS_NAME, NAME_ONLY, mediaUnderSentences } from '../renderer/src/media-row';

const T0 = Date.parse('2026-11-23T09:00:00Z');
const line = (ts: number, source: string, patch: Record<string, unknown>, by = 'dana') => ({ id: 'w-0a1b2c3d4e', ts, source, by, patch });
const NOTE = 'Approve the words or tell me what to change.';

// The review on her computer: Tony's message with his pictures, as an ask.
const asked = [
  line(T0, 'system', { title: 'Claude sign-in status fix', status: 'open', kind: 'directive', priority: 5, labels: ['given-task'], ask: { kind: 'review', owner: 'tony', thread: 'w-1', product: 'agentbox', note: NOTE } }, 'tony'),
  line(T0 + 1, 'founder', { assignee: 'dana', title: 'Claude sign-in status fix', body: `${NOTE}\n\n![desk.png](attachments/ab12-desk.png)\n![phone.png](attachments/cd34-phone.png)`, people: ['tony', 'dana'] }, 'tony'),
];
const approve = (ts: number, file: string) => line(ts, 'founder', { artifact: { do: 'approve', file } });
const messages = (lines: unknown[]) => threadEvents(lines as never).filter((e) => e.message);
const hers = (lines: unknown[]) => messages(lines).filter((e) => e.by === 'dana');
// The quiet lines of things done, as opposed to messages.
const lines = (lines: unknown[]) => threadEvents(lines as never).filter((e) => !e.message).map((e) => e.said);

describe('on your page', () => {
  it('Looks good after two approvals is one message of yours naming both', () => {
    const all = [...asked, approve(T0 + 10, 'desk.png'), approve(T0 + 20, 'phone.png'),
      line(T0 + 30, 'founder', { verdict: 'yes', approvedFiles: ['desk.png', 'phone.png'] }),
      line(T0 + 31, 'founder', { status: 'done' })];
    const mine = hers(all);
    expect(mine).toHaveLength(1);
    expect(mine[0].words).toBe(`Looks good.\n\nApproved [desk.png](<attachments/ab12-desk.png> "${JUST_ITS_NAME}") and [phone.png](<attachments/cd34-phone.png> "${JUST_ITS_NAME}").`);
    expect(lines(all)).not.toContain('You approved');
    expect(lines(all)).not.toContain('You handed it back');
  });

  it('what you wrote with it is in the same message, not a reply of its own', () => {
    const all = [...asked, line(T0 + 30, 'founder', { verdict: 'changes' }),
      line(T0 + 31, 'founder', { answer: 'Rename the button.' }),
      line(T0 + 32, 'founder', { status: 'done' })];
    expect(hers(all).map((e) => e.words)).toEqual(['Needs changes.\n\nRename the button.']);
  });

  it('an approval made after the hand-back stays a line of its own', () => {
    const all = [...asked, line(T0 + 30, 'founder', { verdict: 'yes' }), line(T0 + 31, 'founder', { status: 'done' }), approve(T0 + 90, 'desk.png')];
    expect(lines(all)).toContain('You approved');
    expect(hers(all).map((e) => e.words)).toEqual(['Looks good.']);
  });

  it('a task closed without a verdict still says you marked it done', () => {
    const all = [...asked, line(T0 + 31, 'founder', { status: 'done' })];
    expect(lines(all)).toContain('You marked it done');
  });
});

describe("on Tony's thread", () => {
  const born = [
    line(T0, 'system', { title: 'Claude sign-in status fix', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }, 'tony'),
    line(T0 + 4, 'founder', { title: 'Claude sign-in status fix', body: 'Fix the wording.' }, 'tony'),
    line(T0 + 60_000, 'agent', { result: 'Here they are.\n\n/docs/agentbox/desk.png\n/docs/agentbox/phone.png' }, 'tony'),
  ];
  const stored = handedBackWords({ kind: 'review', name: 'Dana', verdict: 'yes', words: '', asked: { by: 'Tony', note: NOTE }, approved: ['desk.png', 'phone.png'] });
  const back = (text: string) => line(T0 + 120_000, 'system', { answer: text, from: { teammate: 'dana', name: 'Dana Whitfield' } }, 'tony');

  it('reads as her message, naming the files, with his question apart', () => {
    const [e] = messages([...born, back(stored)]).filter((m) => m.from);
    expect(e.words).toBe(`Looks good.\n\nApproved [desk.png](</docs/agentbox/desk.png> "${JUST_ITS_NAME}") and [phone.png](</docs/agentbox/phone.png> "${JUST_ITS_NAME}").`);
    expect(e.asked).toBe(`You asked: “${NOTE}”`);
    expect(e.says).toBe('hand-back');
  });

  it('a hand-back from before files were named reads the same way', () => {
    const [e] = messages([...born, back('Dana reviewed this and it looks good.\n\nTony had asked: “Is it right?”\n\nShip it.')]).filter((m) => m.from);
    expect(e.words).toBe('Looks good.\n\nShip it.');
    expect(e.asked).toBe('You asked: “Is it right?”');
  });

  it('a name no file of the thread has is said without a link', () => {
    const [e] = messages([...born, back(handedBackWords({ kind: 'review', name: 'Dana', verdict: 'yes', words: '', approved: ['gone.png'] }))]).filter((m) => m.from);
    expect(e.words).toBe('Looks good.\n\nApproved gone.png.');
  });
});

describe('the files it names', () => {
  // The approved design names the files; the pictures are already on the page above.
  const tree = (url: string, title: string | null) => ({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Approved ' }, { type: 'link', url, title, children: [{ type: 'text', value: 'desk.png' }] }, { type: 'text', value: '.' }] }] });
  it('are their names, with no pictures drawn under the sentence', () => {
    const t = tree('attachments/ab12-desk.png', JUST_ITS_NAME);
    mediaUnderSentences(t as never);
    expect(t.children).toHaveLength(1);
    expect((t.children[0].children[1] as { data?: { hProperties?: Record<string, unknown> } }).data?.hProperties?.[NAME_ONLY]).toBe('1');
  });
  it('while any other picture named in a sentence still draws under it', () => {
    const t = tree('attachments/ab12-desk.png', null);
    mediaUnderSentences(t as never);
    expect(t.children).toHaveLength(2);
  });
  it("are their names on your view of the owner's thread too, which draws its own links", () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/if \(title === JUST_ITS_NAME\) return <ArtifactLink[^\n]*\n\s*if \(PICTURE\.test\(href\)\)/);
  });
  it('are written that way by the hand-back', () => {
    const [e] = messages([...asked, line(T0 + 30, 'founder', { verdict: 'yes', approvedFiles: ['desk.png'] }), line(T0 + 31, 'founder', { status: 'done' })]).filter((m) => m.by === 'dana');
    expect(e.words).toContain(`[desk.png](<attachments/ab12-desk.png> "${JUST_ITS_NAME}")`);
  });
});

// Round two of the testers: the moment after Send, the page drew only the words typed, with no
// approved files and no notes; the whole message came once the owner's copy had posted it.
describe('the moment after you send it', () => {
  const approvals = [{ file: 'desk.png', by: 'dana', ts: 20 }, { file: 'old.png', by: 'dana', ts: 5 }, { file: 'phone.png', by: 'tony', ts: 30 }];
  it('is the message the owner will get: your words, the notes with them, and what you approved', () => {
    const shown = handBackAsSent({ kind: 'review', words: 'Ship it.\n\nNotes on desk.png:\n- Whole file: bigger', approvals, me: 'dana', since: 10, pathOf: (n) => (n === 'desk.png' ? 'attachments/ab-desk.png' : null) });
    expect(shown).toBe(`Ship it.\n\nNotes on desk.png:\n- Whole file: bigger\n\nApproved [desk.png](<attachments/ab-desk.png> "${JUST_ITS_NAME}").`);
  });
  it('says the files alone when nothing was typed', () => {
    expect(handBackAsSent({ kind: 'review', words: '', approvals, me: 'dana', since: 10, pathOf: () => null })).toBe('Reviewed.\n\nApproved desk.png.');
  });
  it('is drawn on the page', () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    expect(page).toContain('text: sentBack.shown');
  });
});

describe('on Tony\'s thread as you read it', () => {
  const handBack = { at: 1, who: 'it', text: 'Looks good.', asked: 'You asked: “Is it right?”', says: 'hand-back', from: 'Dana Whitfield', fromId: 'dana' } as never;
  it('his question says who asked, and the message stays yours to him, not to his agent', () => {
    const [e] = shownOnTheirThread([handBack], { me: 'dana', helping: false, owner: 'Tony' });
    expect(e).toMatchObject({ text: 'Looks good.', asked: 'Tony asked: “Is it right?”', says: 'hand-back', fromId: 'dana' });
    expect(messageKind(e as never, { helper: true })).toBeNull();
  });
  it('your words to his agent are still marked as that', () => {
    const toAgent = { at: 2, who: 'it', text: 'Try the other index.', from: 'Dana Whitfield', fromId: 'dana' } as never;
    const [e] = shownOnTheirThread([toAgent], { me: 'dana', helping: true, owner: 'Tony' });
    expect(e).toMatchObject({ who: 'you', says: 'to-agent' });
  });
});
