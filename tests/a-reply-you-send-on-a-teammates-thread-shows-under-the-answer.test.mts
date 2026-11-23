// A REPLY YOU SEND ON A TEAMMATE'S THREAD SHOWS UNDER THE ANSWER (2026-11-22).
//
// Asked to review Theo's thread, the founder wrote to him in the box at the
// foot and sent it. Nothing appeared: "pretty sure i sent a reply but ... reply
// is not visible". The page lifted the agent's newest answer to the foot and put
// everything else behind "Show earlier messages", her new words included, so
// they went into the fold, and opening it drew them above the answer they
// replied to. Measured by splitting a thread's events the way the page does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { aroundTheAnswer } from '../renderer/src/threads/teammate-thread';
import type { AgentEvent } from '../renderer/src/types';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

const it1 = { at: 1, who: 'it', text: 'First pass done.' } as AgentEvent;
const theo = { at: 2, who: 'you', by: 'theo', text: 'Make the pictures bigger.' } as AgentEvent;
const answer = { at: 3, who: 'it', text: 'Here are the pictures.' } as AgentEvent;
const mine = { at: 4, who: 'you', by: 'me', says: 'comment', text: 'Looks right to me.' } as AgentEvent;

describe('a reply you send on a teammate\'s thread', () => {
  it('is drawn after the newest answer, not folded behind it', () => {
    const { before, after } = aroundTheAnswer([it1, theo, answer, mine], answer, 3);
    expect(before).toEqual([it1, theo]);
    expect(after).toEqual([mine]);
  });

  it('leaves what came before the answer in the fold', () => {
    const { before, after } = aroundTheAnswer([it1, theo, answer], answer, 3);
    expect(before).toEqual([it1, theo]);
    expect(after).toEqual([]);
  });

  it('keeps a reply said in the same moment as the answer in the fold', () => {
    const same = { ...mine, at: 3 } as AgentEvent;
    expect(aroundTheAnswer([it1, same, answer], answer, 3).after).toEqual([]);
  });

  it('shows words after a finished thread\'s result, which is not an event of its own', () => {
    const { before, after } = aroundTheAnswer([it1, theo, mine], null, 3);
    expect(before).toEqual([it1, theo]);
    expect(after).toEqual([mine]);
  });

  it('folds everything when there is no answer to stand under', () => {
    expect(aroundTheAnswer([it1, theo, mine], null, null)).toEqual({ before: [it1, theo, mine], after: [] });
  });

  it('is what the page draws under the answer', () => {
    expect(page).toContain('aroundTheAnswer(events, lastIt, newest?.at ?? null)');
    expect(page.indexOf('<QueueAnswer')).toBeLessThan(page.indexOf('events={underAnswer}'));
    // Words sent since the ask came sit under it, where the reply box is.
    expect(page.indexOf('<AskBar ')).toBeLessThan(page.indexOf('events={underAsk}'));
    expect(page).toContain('after.filter((e: AgentEvent) => e.at > askAt)');
  });
});
