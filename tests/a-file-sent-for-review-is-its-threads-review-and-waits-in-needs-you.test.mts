// A FILE SENT FOR REVIEW IS ITS THREAD'S REVIEW, AND WAITS IN NEEDS YOU (2026-11-20).
//
// Synthetic team rerun, review sent from a file's Share panel:
// - Theo sent validation-gaps.md to Sam with Review and send back. Sam put a
//   note on it in their chat and sent it; Theo's thread "Payments API input
//   validation gaps" never changed (still Answered, nothing came back). The
//   Share message was a bare file in the chat, tied to no thread.
// - Priya's Needs you lost Lena's review request once Priya wrote anything in
//   their chat: any message of hers settled the chat's row.
// - Theo's row first read "named you on 91c4e598-validation-gaps.md", the
//   name the chat stores the file under.
// Now a review of a thread's file is that thread's ask (the thread's link
// heads the files, and the thread waits on them), the reviewer's notes or
// approval on those files end the wait saying what came back, the request
// stays in the reviewer's Needs you until they send it back, and the row
// names the file as it was sent. Measured on the rules and the sync step.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileMessage } from '../main/team/file-to-chat.mts';
import { askedThread, askedPatch } from '../shared/thread-ask.mts';
import { endedWaits, personWait } from '../shared/thread-waits.mts';
import { noticeEndedWaits, reviewedInChat } from '../main/team/waits.mts';
import { groupFileRow, groupRow, reviewStillAsked } from '../shared/room-needs-you.mts';

const link = 'https://app.agentbox.ac/t/p-theo/w-gaps';
const stored = '91c4e598-validation-gaps.md';
const body = fileMessage({ note: 'Anything missing?', want: 'review', links: [{ name: 'validation-gaps.md', stored }], about: { title: 'Payments API input validation gaps', link } });
const at = 1_000_000;
const ask = { id: 'm-1', by: 'p-theo', body, at };
const note = (by: string, ts: number, file = stored) => ({ id: `k-${ts}`, by, at: ts, mark: { do: 'note', id: `n-${ts}`, file, text: 'Pagination adds limit and cursor params', place: { kind: 'whole' } } });

describe('the message a file review sends', () => {
  it('is the thread\'s ask, with the files under it', () => {
    expect(askedThread(body)).toEqual({ owner: 'p-theo', id: 'w-gaps' });
    expect(body).toContain(`[validation-gaps.md](attachments/${stored})`);
    expect(body.startsWith('Review and send back: Anything missing?')).toBe(true);
  });
  it('must NOT name a thread when it was sent from none', () => {
    expect(askedThread(fileMessage({ note: '', want: 'review', links: [{ name: 'a.png', stored: 'ab12cd34-a.png' }] }))).toBeNull();
  });
  it('the Share panel\'s send ties the review to the thread it came from', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    expect(ipc).toContain("askedPatch([to], askedSaid('review', team.firstNameOf(to) || 'them', note), Date.now(), 'review')");
    expect(ipc).toContain('sendFileToChat({ rooms, me, to, toName: person?.name ?? \'\', files, note, want, about })');
  });
});

describe('what came back, on the thread', () => {
  const chat = (marks: ReturnType<typeof note>[]) => [{ messages: [ask], marks }];
  it('Sam sent it back with 1 note: the reported case', () => {
    expect(reviewedInChat(chat([note('p-sam', at + 5)]), 'p-theo', { id: 'w-gaps' }, 'p-sam')).toBe('Sent back with 1 note: Pagination adds limit and cursor params');
    const waiting = { id: 'w-gaps', status: 'open', ...askedPatch(['p-sam'], 'Sent to Sam to review and send back', at, 'review'), wrote: { blockedBy: { source: 'founder', ts: at + 1 }, asked: { source: 'founder', ts: at + 1 } } };
    const said = endedWaits([waiting], { items: [], cards: [], nameOf: () => 'Sam Ortiz', now: at + 100, lastWordFrom: () => at + 50, reviewedIn: (item, person) => reviewedInChat(chat([note('p-sam', at + 5)]), 'p-theo', item, person) })[0]?.said;
    expect(said).toBe('Sam sent it back with 1 note: “Pagination adds limit and cursor params”');
  });
  it('an approval is Sam approved', () => {
    expect(reviewedInChat(chat([{ ...note('p-sam', at + 5), mark: { do: 'approve', file: `${stored}#1` } }]), 'p-theo', { id: 'w-gaps' }, 'p-sam')).toBe('Approved');
  });
  it('must NOT count marks from before the ask, by someone else, on another file, or about another thread', () => {
    expect(reviewedInChat(chat([note('p-sam', at - 5)]), 'p-theo', { id: 'w-gaps' }, 'p-sam')).toBeNull();
    expect(reviewedInChat(chat([note('p-jun', at + 5)]), 'p-theo', { id: 'w-gaps' }, 'p-sam')).toBeNull();
    expect(reviewedInChat(chat([note('p-sam', at + 5, 'ffff0000-other.md')]), 'p-theo', { id: 'w-gaps' }, 'p-sam')).toBeNull();
    expect(reviewedInChat(chat([note('p-sam', at + 5)]), 'p-theo', { id: 'w-other' }, 'p-sam')).toBeNull();
  });
  it('the sync step ends the wait with it', () => {
    const waiting = { id: 'w-gaps', status: 'open', ...askedPatch(['p-sam'], 'Sent to Sam to review and send back', at, 'review'), wrote: { blockedBy: { source: 'founder', ts: at + 1 }, asked: { source: 'founder', ts: at + 1 } } };
    const wrote: Record<string, unknown>[] = [];
    noticeEndedWaits({
      products: [{ slug: 'api', dir: '/api', team: { direct: false } }] as never, read: () => [waiting] as never,
      write: (_d, _id, patch) => wrote.push(patch), cards: [], nameOf: () => 'Sam Ortiz', now: at + 100, me: 'p-theo',
      chats: chat([note('p-sam', at + 5)]),
    });
    expect(wrote[0]).toMatchObject({ blockedBy: [], waitEnded: { said: 'Sam sent it back with 1 note: “Pagination adds limit and cursor params”' } });
  });
});

describe('the request in the reviewer\'s Needs you', () => {
  const card = (waits: boolean) => ({ personId: 'p-theo', threadId: 'w-gaps', blockedBy: waits ? [{ id: personWait('p-sam'), title: null, want: 'review' }] : [] });
  const row = (o: { waits?: boolean; marks?: ReturnType<typeof note>[] } = {}) => groupRow({
    roomId: 'r-1', roomName: 'Theo', pair: true, me: 'p-sam',
    messages: [ask, { id: 'm-2', by: 'p-sam', body: 'On it after lunch', at: at + 10 }],
    stillAsked: (m) => reviewStillAsked(m, { me: 'p-sam', cards: [card(o.waits ?? true)], marks: o.marks ?? [] }),
  });
  it('stays after the reviewer wrote in the chat: the reported case', () => {
    expect(row()?.messageId).toBe('m-1');
  });
  it('goes once the review is sent back on the file, or the thread no longer waits on them', () => {
    expect(row({ marks: [note('p-sam', at + 20)] })).toBeNull();
    expect(row({ waits: false })).toBeNull();
  });
  it('must NOT keep an ordinary message once answered', () => {
    const plain = groupRow({ roomId: 'r-1', roomName: 'Theo', pair: true, me: 'p-sam', messages: [{ id: 'm-1', by: 'p-theo', body: 'lunch?', at }, { id: 'm-2', by: 'p-sam', body: 'yes', at: at + 10 }],
      stillAsked: (m) => reviewStillAsked(m, { me: 'p-sam', cards: [card(true)], marks: [] }) });
    expect(plain).toBeNull();
  });
});

describe('the row about a note on a sent file', () => {
  it('names the file as it was sent, without the chat\'s prefix', () => {
    const r = groupFileRow({ roomId: 'r-1', roomName: 'Sam', me: 'p-theo', marks: [{ ...note('p-sam', at + 5), mark: { ...note('p-sam', at + 5).mark, owner: 'p-theo', mentions: ['p-theo'] } }] });
    expect(r?.body).toContain('validation-gaps.md');
    expect(r?.body).not.toContain('91c4e598');
  });
});
