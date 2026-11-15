// QA batch 011 (F-187), Oct 30, 2026: after answering a new teammate's three
// setup questions with Send answers, its chat showed "You answered 3 questions"
// and, under it, a second raw line: You answered "> When should I check in on my
// own? Only when you message me > What should I handle first…". The run's own
// "answered" line carries your words with their line breaks folded and cut at
// 400 characters, so it no longer matched the message the chat already showed,
// and the chat drew both.
import { describe, it, expect } from 'vitest';
import { chatEntries } from '../renderer/src/teammates/chat-lines.ts';

const ADA = 't-aaaaaaaaaa';
const said = '> When should I check in on my own?\n\nOnly when you message me\n\n> What should I handle first?\n\nFinish setup and wait for a task\n\n> May I route requests?\n\nAsk before every handoff';
const folded = (text, max = 400) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};
const view = (runText, chatText = said) => ({
  list: [],
  chat: [{ id: 'm-1', kind: 'msg', from: 'you', to: [ADA], text: chatText, answers: { q1: 'a', q2: 'b', q3: 'c' }, ts: 10 }],
  runs: [{ id: 'w-1:answered', kind: 'run', teammate: ADA, item: 'w-1', product: 'p', title: 'Set up', verb: 'answered', text: runText, ts: 11 }],
});

describe('answers you sent in the chat', () => {
  it('show once, though the run keeps them with their line breaks folded', () => {
    expect(chatEntries(view(folded(said))).map((e) => e.id)).toEqual(['m-1']);
    expect(chatEntries(view(folded(said)), ADA).map((e) => e.id)).toEqual(['m-1']);
  });

  it('show once when the run cut a long answer short', () => {
    const long = `${said}\n\n${'More detail. '.repeat(60)}`;
    expect(chatEntries(view(folded(long), long)).map((e) => e.id)).toEqual(['m-1']);
  });

  it('an answer typed in the thread itself, not in the chat, still gets its line', () => {
    expect(chatEntries(view('Skip the FAQ')).map((e) => e.id)).toEqual(['m-1', 'w-1:answered']);
    // Nor does a short answer pass for the start of a longer one you sent.
    expect(chatEntries(view('> When should I check in on my own?')).map((e) => e.id)).toEqual(['m-1', 'w-1:answered']);
  });
});
