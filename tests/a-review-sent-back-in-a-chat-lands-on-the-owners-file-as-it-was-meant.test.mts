// A REVIEW SENT BACK IN A CHAT LANDS ON THE OWNER'S FILE AS IT WAS MEANT (2026-11-20).
//
// Third synthetic team run, a review sent from pricing.html's Share panel:
// - Priya typed a note and pressed Approve; Lena's thread said "Priya sent it
//   back with 1 note". An approval with a note is an approval.
// - Priya's note stayed on the chat's copy of the file: Lena's own
//   pricing.html had an empty Notes panel, and the thread's top line cut the
//   note off. Lena's Needs you also held a second row for the chat copy.
// - The viewer Priya opened from the chat was titled "655dfd96-pricing.html"
//   and never said Lena had asked for a review.
// - After she approved, their chat showed nothing of it.
// - Lena's Share panel stayed open on its person list after Send for review,
//   with nothing saying it went.
// Measured on the rules, the sync step and the screens' sources.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileMessage } from '../main/team/file-to-chat.mts';
import { askedPatch } from '../shared/thread-ask.mts';
import { noticeEndedWaits, reviewedInChat } from '../main/team/waits.mts';
import { askFiles, reviewAskIn, reviewLine } from '../shared/room-needs-you.mts';
import { sharedWords } from '../renderer/src/components/ShareLink.tsx';

const stored = '655dfd96-pricing.html';
const body = fileMessage({ note: 'Does the plan grid read?', want: 'review', links: [{ name: 'pricing.html', stored }], about: { title: 'Mock up the pricing page', link: 'https://app.agentbox.ac/t/p-lena/w-price' } });
const at = 1_000_000;
const ask = { id: 'm-1', by: 'p-lena', body, at };
const noteMark = (ts: number) => ({ id: `k-${ts}`, by: 'p-priya', at: ts, mark: { do: 'note', id: `n-${ts}`, file: stored, v: 1, place: { kind: 'whole' }, text: 'Love it. Calm and clear. One small thing: the toggle.' } });
const approveMark = (ts: number) => ({ id: `k-${ts}`, by: 'p-priya', at: ts, mark: { do: 'approve', file: `${stored}#1` } });

describe('what came back', () => {
  it('an approval with a note is Priya approved, with the note: the reported case', () => {
    expect(reviewedInChat([{ messages: [ask], marks: [noteMark(at + 5), approveMark(at + 6)] }], 'p-lena', { id: 'w-price' }, 'p-priya'))
      .toBe('Approved: Love it. Calm and clear. One small thing: the toggle.');
  });
  it('notes with no approval are still sent back', () => {
    expect(reviewedInChat([{ messages: [ask], marks: [noteMark(at + 5)] }], 'p-lena', { id: 'w-price' }, 'p-priya')).toMatch(/^Sent back with 1 note/);
  });
});

describe('the owner\'s file', () => {
  const waiting = { id: 'w-price', status: 'open', ...askedPatch(['p-priya'], 'Sent to Priya to review and send back', at, 'review'), wrote: { blockedBy: { source: 'founder', ts: at + 1 }, asked: { source: 'founder', ts: at + 1 } } };
  const run = () => {
    const added: { dir: string; lines: Record<string, unknown>[] }[] = [];
    noticeEndedWaits({
      products: [{ slug: 'web', dir: '/web', team: { direct: false } }] as never, read: () => [waiting] as never, write: () => {}, cards: [],
      nameOf: () => 'Priya Shah', now: at + 100, me: 'p-lena', chats: [{ messages: [ask], marks: [noteMark(at + 5), approveMark(at + 6)] }],
      append: (dir, lines) => { added.push({ dir, lines: lines as Record<string, unknown>[] }); },
    });
    return added;
  };
  it('gets her note and approval, under her name, on the file as Lena named it', () => {
    const [{ dir, lines }] = run();
    expect(dir).toBe('/web');
    expect(lines.map((l) => (l.patch as { artifact: { do: string; file: string } }).artifact)).toEqual([
      expect.objectContaining({ do: 'note', file: 'pricing.html', text: 'Love it. Calm and clear. One small thing: the toggle.' }),
      expect.objectContaining({ do: 'approve', file: 'pricing.html' }),
    ]);
    expect(lines.every((l) => l.by === 'p-priya' && l.id === 'w-price' && String(l.uid).startsWith('review-'))).toBe(true);
  });
  it('must NOT carry the chat\'s own version number onto Lena\'s file', () => {
    const [{ lines }] = run();
    expect((lines[0].patch as { artifact: { v?: number } }).artifact.v).toBeUndefined();
  });
});

describe('the chat', () => {
  it('a review ask names its files, and the ask is read back for the viewer', () => {
    expect(askFiles(body)).toEqual([stored]);
    expect(reviewAskIn([ask], stored, 'p-priya')).toEqual({ by: 'p-lena', note: 'Does the plan grid read?' });
    expect(reviewAskIn([ask], stored, 'p-lena')).toBeNull();
    expect(reviewAskIn([{ ...ask, body: `Look at this\n\n[pricing.html](attachments/${stored})` }], stored, 'p-priya')).toBeNull();
  });
  it('under the ask, says what the reviewer did, to both of them', () => {
    const marks = [noteMark(at + 5), approveMark(at + 6)];
    const nameOf = (id: string | null) => (id === 'p-priya' ? 'Priya' : 'Lena');
    expect(reviewLine(ask, marks, 'p-priya', nameOf)).toBe('You approved pricing.html with 1 note');
    expect(reviewLine(ask, marks, 'p-lena', nameOf)).toBe('Priya approved pricing.html with 1 note');
    expect(reviewLine(ask, [noteMark(at + 5), noteMark(at + 7)], 'p-lena', nameOf)).toBe('Priya sent back pricing.html with 2 notes');
    expect(reviewLine(ask, [], 'p-lena', nameOf)).toBeNull();
  });
  it('the chat draws that line, and the viewer shows the ask and the file\'s own name', () => {
    const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
    expect(chat).toContain('reviewLine(m, calls.files.marks, meId, nameOf)');
    const viewer = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomFileView.tsx', import.meta.url), 'utf8');
    expect(viewer).toContain('nameShown={shownRoomFile}');
    expect(viewer).toMatch(/asked=\{[^}]*reviewAskWords\(/);
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toContain('{asked && <p className="av-asked">{asked}</p>}');
    expect(view).toContain('nameShown(familyName(');
  });
});

describe('the Share panel after Send for review', () => {
  it('closes and says where it went', () => {
    expect(sharedWords('Priya', 'review')).toBe('Sent to Priya for review');
    expect(sharedWords('Priya', null)).toBe('Sent to Priya');
    const share = fs.readFileSync(new URL('../renderer/src/components/ShareLink.tsx', import.meta.url), 'utf8');
    expect(share).toMatch(/setOpen\(false\);\s*setWent\(sharedWords\(/);
    expect(share).toContain('{went && <span className="av-share-went" role="status">{went}</span>}');
  });
});
