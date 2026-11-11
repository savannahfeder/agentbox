// A PERSON'S PAGE HOLDS EVERYTHING THAT PASSED BETWEEN THE TWO OF YOU (2026-11-11).
//
// Three synthetic testers used the team build for three rounds and scored it 4
// to 6 for replacing Slack, Linear and Notion. All three named the same thing
// first: "Today I was moving between People, the task, Needs you and Files to
// rebuild one morning." The person's page drew only the Rooms chat; a task
// given, a reply inside it, a comment on a thread, a note on a file and a
// hand-off each lived on another page. Measured on one morning between Lena and
// Theo: of nine things that passed between them, the page showed the two chat
// messages. The page now draws one stream, built by `pairTimeline` from each
// side's own inputs, and both sides get the same entries.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pairTimeline, pairLine, fileLabel, type PairInput, type ThreadTalk, type PairTask } from '../renderer/src/team/pair-timeline.ts';
import type { RoomMessage } from '../renderer/src/types.ts';

const LENA = 'lena', THEO = 'theo', JUN = 'jun';
const at = (h: number, m: number) => Date.UTC(2026, 10, 11, h, m);
const msg = (id: string, roomId: string, by: string, body: string, when: number): RoomMessage => ({ id, roomId, by, body, inReplyTo: null, mentions: [], at: when });
const task = (id: string, from: string, to: string, title: string, body: string, when: number, chat: { by: string; ts: number; text: string }[] = []): PairTask => ({
  id, title, body, people: [from, to], assignee: to, createdBy: from, createdAt: when, labels: ['given-task'],
  talk: { chat: [{ by: from, ts: when, text: body }, ...chat] },
});

// One morning, as the cloud holds it. Each side reads its own share of it below.
const room = 'r-lena-theo';
const messages = [
  msg('m1', room, LENA, 'Morning. Can you take the webhook bug?', at(9, 0)),
  msg('m2', room, THEO, 'PR is up', at(9, 30) + 20_000),
];
const theirTasks = {
  webhook: task('t1', LENA, THEO, 'Fix the webhook retry', 'Retries double-charge', at(9, 5), [
    { by: THEO, ts: at(9, 20), text: 'Found it: the retry has no idempotency key' },
    { by: THEO, ts: at(9, 30), text: 'PR is up' },
  ]),
  handoff: task('t2', THEO, LENA, 'Stripe runbook', `[Stripe runbook](https://app.agentbox.ac/t/${THEO}/th-runbook)\n\nPlease finish the refund section`, at(10, 0)),
};
const comments: ThreadTalk[] = [
  { id: 'c1', kind: 'comment', owner: THEO, threadId: 'th-audit', by: LENA, text: 'Check the refresh path too', at: at(9, 40) },
  // Lena's private thread, open only to Theo.
  { id: 'c2', kind: 'comment', owner: LENA, threadId: 'th-pricing', by: THEO, text: 'Ship it', at: at(10, 10) },
  { id: 'n1', kind: 'note', owner: THEO, threadId: 'th-audit', by: LENA, text: 'This number looks off', at: at(9, 50), file: 'report.md#2', note: 'n1' },
];
// What must not come in: a third person's words, and the two of them with someone else.
const noise: ThreadTalk[] = [
  { id: 'c3', kind: 'comment', owner: THEO, threadId: 'th-audit', by: JUN, text: 'Jun was here', at: at(9, 45) },
  { id: 'c4', kind: 'comment', owner: JUN, threadId: 'th-jun', by: THEO, text: 'Theo on Jun', at: at(9, 46) },
  { id: 'n2', kind: 'note', owner: LENA, threadId: 'th-pricing', by: JUN, text: 'Jun on Lena', at: at(9, 47), file: 'pricing.png', note: 'n2' },
];
const titles: Record<string, string> = { 'theo/th-audit': 'Auth audit', 'lena/th-pricing': 'Pricing page', 'theo/th-runbook': 'Stripe runbook' };
const titleOf = (owner: string, threadId: string) => titles[`${owner}/${threadId}`] ?? null;

const lenaSees: PairInput = {
  me: LENA, other: THEO, rooms: [room],
  messages: [...messages, msg('m9', 'r-lena-jun', JUN, 'Lunch?', at(9, 10)), msg('m8', 'r-lena-jun', LENA, 'Yes', at(9, 11))],
  directItems: [theirTasks.webhook, theirTasks.handoff, task('t9', LENA, JUN, 'Jun task', 'For Jun', at(9, 15))],
  talk: [...comments, ...noise],
  titleOf,
};
const theoSees: PairInput = {
  me: THEO, other: LENA, rooms: [room],
  messages: [msg('m7', 'r-theo-jun', THEO, 'Hey Jun', at(9, 12)), ...messages],
  directItems: [task('t8', JUN, THEO, 'From Jun', 'Jun asks', at(9, 16)), theirTasks.handoff, theirTasks.webhook],
  talk: [...noise.slice(0, 2), ...comments],
  titleOf,
};

describe('the stream between two people', () => {
  const lena = pairTimeline(lenaSees);

  it('holds each thing once, in time order, each with where it happened', () => {
    expect(lena.map((e) => [e.kind, e.by, e.text, e.where?.label ?? null])).toEqual([
      ['message', LENA, 'Morning. Can you take the webhook bug?', null],
      ['task', LENA, 'Fix the webhook retry', 'Fix the webhook retry'],
      ['reply', THEO, 'Found it: the retry has no idempotency key', 'on Fix the webhook retry'],
      ['message', THEO, 'PR is up', 'on Fix the webhook retry'],
      ['comment', LENA, 'Check the refresh path too', 'on Auth audit'],
      ['note', LENA, 'This number looks off', 'report.md v2'],
      ['handoff', THEO, 'Stripe runbook', 'Stripe runbook'],
      ['comment', THEO, 'Ship it', 'on Pricing page'],
    ]);
  });

  it('opens each where it happened', () => {
    const opens = Object.fromEntries(lena.map((e) => [e.kind === 'message' ? e.key : `${e.kind}:${e.text}`, e.where?.open ?? null]));
    expect(opens['task:Fix the webhook retry']).toEqual({ to: 'task', id: 't1' });
    expect(opens['reply:Found it: the retry has no idempotency key']).toEqual({ to: 'task', id: 't1' });
    expect(opens['comment:Check the refresh path too']).toEqual({ to: 'thread', owner: THEO, threadId: 'th-audit' });
    expect(opens['note:This number looks off']).toEqual({ to: 'file', owner: THEO, threadId: 'th-audit', file: 'report.md#2', note: 'n1' });
    expect(opens['handoff:Stripe runbook']).toEqual({ to: 'task', id: 't2' });
    expect(opens['comment:Ship it']).toEqual({ to: 'thread', owner: LENA, threadId: 'th-pricing' });
  });

  it('is the same on both screens', () => {
    expect(pairTimeline(theoSees)).toEqual(lena);
  });

  it('says who to from where each person sits', () => {
    const given = lena.find((e) => e.kind === 'task')!;
    const handed = lena.find((e) => e.kind === 'handoff')!;
    const nameOf = (id: string) => ({ lena: 'Lena Fischer', theo: 'Theo Okafor' } as Record<string, string>)[id] ?? 'Someone';
    expect(pairLine(given, LENA, nameOf)).toBe('Gave Theo a task');
    expect(pairLine(given, THEO, nameOf)).toBe('Gave you a task');
    expect(pairLine(handed, LENA, nameOf)).toBe('Handed you a thread');
    expect(pairLine(handed, THEO, nameOf)).toBe('Handed Lena a thread');
    expect(pairLine(lena.find((e) => e.kind === 'note')!, LENA, nameOf)).toBe('This number looks off');
  });

  it('draws a task reply that was also sent to the chat once, as the message', () => {
    expect(lena.filter((e) => e.text === 'PR is up')).toHaveLength(1);
    expect(lena.find((e) => e.text === 'PR is up')!.kind).toBe('message');
  });

  it('draws a hand-off once, never also as a task given', () => {
    expect(lena.filter((e) => e.where?.open.to === 'task' && (e.where.open as { id: string }).id === 't2')).toHaveLength(1);
  });

  it('keeps the same words in a task apart from a chat message an hour away', () => {
    const later = { ...lenaSees, messages: [...messages, msg('m3', room, THEO, 'Found it: the retry has no idempotency key', at(10, 20))] };
    expect(pairTimeline(later).filter((e) => e.text.startsWith('Found it'))).toHaveLength(2);
  });

  it('never draws a third person, nor either of them with someone else', () => {
    const words = lena.map((e) => e.text);
    for (const w of ['Jun was here', 'Theo on Jun', 'Jun on Lena', 'Lunch?', 'Yes', 'Jun task']) expect(words).not.toContain(w);
    expect(pairTimeline(theoSees).map((e) => e.text)).not.toContain('Hey Jun');
  });

  it('does not draw the task\'s own brief as a reply', () => {
    expect(lena.map((e) => e.text)).not.toContain('Retries double-charge');
  });
});

describe('a file note names the file and its version', () => {
  it('reads the version from the note\'s file', () => {
    expect(fileLabel('report.md')).toBe('report.md v1');
    expect(fileLabel('report.md#3')).toBe('report.md v3');
    expect(fileLabel('report.md@4')).toBe('report.md v4');
  });
});

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const rooms = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');

describe('the app', () => {
  it('draws the person\'s chat with the stream along it', () => {
    expect(app).toMatch(/roomsUi\.chatIn\(room, \(messages, pairRoomIds\) => along\(pairTimeline\(\{ me: team\?\.me \?\? '', other: id, rooms: pairRoomIds, messages, directItems: items, talk: snap\.team\?\.threadTalk \?\? \[\], titleOf \}\)\)\)/);
  });

  it('opens each entry where it happened', () => {
    expect(app).toMatch(/const openPairEntry = \(o: PairOpens\) => \{/);
    expect(app).toMatch(/if \(o\.to === 'task'\)/);
    expect(app).toMatch(/openTeammateCard\(card, \{ file: o\.file, note: o\.note \}\)/);
    expect(app).toMatch(/openContinuedFrom\(o\.owner, o\.threadId\)/);
  });

  it('hands the pair\'s merged messages to that stream', () => {
    expect(rooms).toMatch(/const chatIn = \(roomId: string, along\?: \(messages: RoomMessage\[\], rooms: string\[\]\) => ChatAlong\): ReactNode => \{/);
    expect(rooms).toMatch(/along=\{along\?\.\(c\.messages, c\.rooms\)\}/);
  });

  it('draws the rows in the message column, not as a list of their own', () => {
    expect(chat).toMatch(/className=\{`rm-cm rm-along/);
    expect(chat).toMatch(/className="rm-there"/);
  });
});
