// Under each name in Everything else the desktop writes one quiet word from
// statusWord (team/everything/place.ts): "1 agent working", "3 in progress",
// "Nothing in progress", "Free", and for a chat "New messages", "Public
// group", "Everyone" or "Chat" (TeamStrip.tsx `MemberWord`), with the moving
// mark only while busy. The phone wrote its own: "2 agents", "Not running"
// under a still mark, and "Chat" for every chat. Found by the phone parity
// audit of 2026-11-21.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { statusWord } from '../renderer/src/team/everything/place';
import { cardWord } from '../mobile/src/lib/everything';

type M = Parameters<typeof cardWord>[0];
const m = (over: Partial<M>) => ({ key: 'person:p', name: 'Maya', kind: 'person', ...over }) as M;
const page = fs.readFileSync('mobile/src/ui/Everything.tsx', 'utf8');

describe("the phone's team cards", () => {
  it('say the desktop word for a person', () => {
    expect(cardWord(m({ agents: 1 }))).toEqual({ word: '1 agent working', live: true });
    expect(cardWord(m({ agents: 0 }))).toEqual({ word: 'Nothing in progress', live: false });
    expect(cardWord(m({ agents: 0 })).word).toBe(statusWord(m({ agents: 0 })));
  });
  it('say the desktop word for an AI teammate', () => {
    expect(cardWord(m({ key: 'mate:a', kind: 'mate', agents: 0 })).word).toBe('Free');
    expect(cardWord(m({ key: 'mate:a', kind: 'mate', agents: 1 }))).toEqual({ word: 'Working', live: true });
  });
  it('say what a chat is, as the desktop does', () => {
    expect(cardWord(m({ key: 'room:a', kind: 'chat', unread: true })).word).toBe('New messages');
    expect(cardWord(m({ key: 'room:a', kind: 'chat', open: true })).word).toBe('Public group');
    expect(cardWord(m({ key: 'room:t', kind: 'chat', team: true, agents: 0 })).word).toBe('Everyone');
    expect(cardWord(m({ key: 'room:a', kind: 'chat' })).word).toBe('Chat');
    expect(cardWord(m({ key: 'room:t', kind: 'chat', team: true, agents: 2 }))).toEqual({ word: '2 agents working', live: true });
  });
  it('the card draws that word, and no words of its own', () => {
    const card = page.slice(page.indexOf('function Card('), page.indexOf('function AddCard('));
    expect(card).toMatch(/cardWord\(m\)/);
    expect(card).not.toMatch(/'Not running'|agentsShort/);
  });
  it("the bar over an open card says the desktop's agents line", () => {
    expect(page).toMatch(/m\.agents \? agentsWords\(m\.agents\) : m\.starting \? 'Starting' : m\.kind === 'person' \? `\$\{m\.inProgress \?\? 0\} in progress` : 'Not running'/);
  });
});
