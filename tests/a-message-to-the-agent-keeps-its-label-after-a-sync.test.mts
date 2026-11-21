// A MESSAGE TO THE AGENT KEEPS ITS LABEL AFTER A SYNC (w-f702d60afe, bug 7).
//
// Theo, asked to help on Sam's thread, wrote to Sam's agent. Right after
// sending it read "You · To the agent"; after a sync it read "Theo" with no
// tag, and Sam's copy never showed the tag at all. Measured on two copies: the
// relabel only matched Theo's own comment line while the ask was open, and a
// sync swaps that line for the one Sam's copy wrote when it passed the words to
// its agent (main/team/asks.mts relay: an `answer` with `from`), which carried
// no tag. A hand-back is written the same way, so it must not get the tag.
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { itemThread } from '../renderer/src/item-thread';
import { messageKind } from '../renderer/src/threads/message-kind';
import { MessageKind } from '../renderer/src/components/FileMarkLine';
import { TeamContext, type TeamView } from '../renderer/src/team/people';
import { shownOnTheirThread } from '../renderer/src/threads/teammate-thread';
import { handedBackWords, isHandBack } from '../shared/thread-asks.mts';
import type { AgentEvent, AgentTurn, Person } from '../renderer/src/types';

const theo = { id: 'theo', email: 'theo@example.com', name: 'Theo Park', avatarUrl: null } as Person;
const sam = { id: 'sam', email: 'sam@example.com', name: 'Sam Lee', avatarUrl: null } as Person;
const teamAs = (me: string): TeamView => ({ state: {} as TeamView['state'], me, byId: new Map([[theo.id, theo], [sam.id, sam]]), products: new Map() });

const back = handedBackWords({ kind: 'help', name: 'Theo', verdict: 'done', words: 'All set.', asked: null });
const line = (ts: number, patch: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: 'w-1', ts, source: 'founder', patch, ...extra });
// Sam's thread as both copies read it once Sam's copy has passed Theo's words on.
const synced = [
  line(1, { title: 'Login fails', body: 'Fix the login.' }, { by: 'sam' }),
  line(2, { answer: 'Try the staging key first.', from: { teammate: 'theo', name: 'Theo Park' } }, { source: 'system' }),
  line(3, { result: 'Fixed with the staging key.' }, { source: 'agent' }),
  line(4, { answer: back, from: { teammate: 'theo', name: 'Theo Park' } }, { source: 'system' }),
];
const said = (lines: ReturnType<typeof line>[]) => itemThread(lines, [], null, { whole: true }).events.filter((e: AgentEvent) => e.kind !== 'work' && e.kind !== 'run') as AgentTurn[];
const find = (events: AgentTurn[], words: string) => events.find((e) => (e.text ?? '').includes(words))!;
const tagOn = (e: AgentTurn, me: string) => renderToStaticMarkup(h(TeamContext.Provider, { value: teamAs(me) }, h(MessageKind, { e })));

describe('a hand-back is told apart from words for the agent', () => {
  it('knows every hand-back the app writes', () => {
    for (const kind of ['help', 'review'] as const) {
      for (const verdict of ['done', 'yes', 'changes', null] as const) {
        expect(isHandBack(handedBackWords({ kind, name: 'Theo', verdict, words: 'Some words.', asked: { by: 'Sam', note: 'Look at login' } }))).toBe(true);
        expect(isHandBack(handedBackWords({ kind, name: 'Theo', verdict, words: '', asked: null }))).toBe(true);
      }
    }
  });
  it('does not take ordinary words for one', () => {
    expect(isHandBack('Try the staging key first.')).toBe(false);
    expect(isHandBack('I handed this back to the design team yesterday.')).toBe(false);
    expect(isHandBack('')).toBe(false);
  });
});

describe("on Sam's copy", () => {
  const events = said(synced);
  it("Theo's words to the agent wear the tag", () => {
    expect(messageKind(find(events, 'staging key first'), { helper: true })).toEqual({ word: 'To the agent' });
    expect(tagOn(find(events, 'staging key first'), 'sam')).toContain('To the agent');
  });
  it("Theo's hand-back does not", () => {
    expect(messageKind(find(events, 'handed this back'), { helper: true })).toBe(null);
    expect(tagOn(find(events, 'handed this back'), 'sam')).toBe('');
  });
  it('an answer from someone not on the team, like an AI teammate, does not', () => {
    const ai = said([line(1, { body: 'Fix it.' }), line(2, { answer: 'Over to you.', from: { teammate: 'ai-1', name: 'Scout' } }, { source: 'system' })]);
    expect(tagOn(find(ai, 'Over to you'), 'sam')).toBe('');
  });
});

describe("on Theo's copy", () => {
  it('after a sync, his words still read as his, to the agent, while the ask is open and after it ends', () => {
    for (const helping of [true, false]) {
      const shown = shownOnTheirThread(said(synced), { me: 'theo', helping });
      const mine = find(shown, 'staging key first');
      expect(mine.who).toBe('you');
      expect(messageKind(mine)).toEqual({ word: 'To the agent' });
      expect(tagOn(mine, 'theo')).toContain('To the agent');
    }
  });
  it('his hand-back is not relabelled', () => {
    const shown = shownOnTheirThread(said(synced), { me: 'theo', helping: false });
    expect(messageKind(find(shown, 'handed this back'), { helper: true })).toBe(null);
  });
  it('before the sync, his comment reads as to the agent while he helps, and as a comment when he does not', () => {
    const before = [line(1, { body: 'Fix the login.' }, { by: 'sam' }), line(2, { comment: { text: 'Try the staging key first.' } }, { source: 'system', by: 'theo', uid: 'comment-1' })];
    expect(messageKind(find(shownOnTheirThread(said(before), { me: 'theo', helping: true }), 'staging'))).toEqual({ word: 'To the agent' });
    expect(messageKind(find(shownOnTheirThread(said(before), { me: 'theo', helping: false }), 'staging'))).toEqual({ word: 'Comment', why: 'did not start the agent' });
  });
  it("Sam's own messages are left alone", () => {
    const shown = shownOnTheirThread(said(synced), { me: 'theo', helping: true });
    expect(find(shown, 'Fix the login').who).toBe(find(said(synced), 'Fix the login').who);
  });
});
