// AN IMPORTED CLAUDE CODE CHAT OPENS ON WHAT YOU ASKED, AND SAYS WHERE IT CAME
// FROM.
//
// The import now files a Claude Code chat as the chat itself (w-62228098e6):
// your first message as yours and the agent's last reply as its result. Drawn
// in the real app, the thread opened on "An agent opened this", which is not
// true of a chat you started yourself. It says "Started in Claude Code", as a
// Codex chat says "Started in Codex", because the row is dated when the chat
// started (tests/an-imported-chat-keeps-the-times-it-happened).

import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-10-24T09:00:00-07:00');
const line = (ts, source, patch) => ({ id: 'w-1', ts, source, patch });
const PROMPT = 'the upload test fails about one run in five on CI, find out why and fix it';

// What store.importThreadRows writes.
const imported = [
  line(T0, 'agent', { title: 'Fix the flaky upload test on CI', status: 'open', kind: 'question', priority: 3, labels: ['thread-import', 'thread:s-1'] }),
  line(T0, 'founder', { body: PROMPT }),
  line(T0 + 1, 'agent', { result: 'Mocking the clock is the real fix. Which one?' }),
];

describe('an imported Claude Code chat', () => {
  const events = threadEvents(imported);

  it('says where it came from rather than that an agent opened it', () => {
    const said = events.map((e) => e.said);
    expect(said).toContain('Started in Claude Code');
    expect(said).not.toContain('An agent opened this');
  });

  it('opens on your first message, as yours', () => {
    const yours = events.filter((e) => e.field === 'body');
    expect(yours).toHaveLength(1);
    expect(yours[0].who).toBe('you');
    expect(yours[0].words).toBe(PROMPT);
  });
});

describe('a row an agent filed', () => {
  it('still says an agent opened it', () => {
    const lines = [line(T0, 'agent', { title: 'Tidy the footer', status: 'open', kind: 'directive', priority: 5, labels: [] })];
    expect(threadEvents(lines).map((e) => e.said)).toContain('An agent opened this');
  });
});
