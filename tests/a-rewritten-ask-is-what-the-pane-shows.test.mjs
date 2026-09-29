// A REWRITTEN ASK IS WHAT THE PANE SHOWS.
//
// The inbox line and the options heading read the row's folded body, which the
// watch had rewritten with the detail. The pane drew the opening message off
// the FIRST body line in the ledger and dropped every later body line on the
// floor, so it still said "Codex has not answered yet." over options that no
// longer matched.
//
// The other side's body never does: the fold ignores an agent's body on a row
// she wrote, and the pane must not draw the agent's words under her name.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';
import { itemThread } from '../renderer/src/item-thread';

const T0 = Date.parse('2026-09-15T09:59:23-07:00');
const line = (ts, source, patch, extra = {}) => ({ id: 'w-1', ts, source, patch, ...extra });

describe('an agent-made row whose body was rewritten', () => {
  const lines = [
    line(T0, 'agent', { title: 'Improve app visual design', status: 'open', kind: 'import', priority: 5, labels: ['codex-import', 'codex:1'] }),
    line(T0 + 10, 'agent', { body: '**Import into Test Proj? A Codex conversation from 9:59 AM today.**\n\nCodex has not answered yet.\n\n## Options\n1. Import into Test Proj\n2. Not now' }),
    line(T0 + 60_000, 'agent', { label: 'Cross-platform agent inbox' }),
    line(T0 + 2_146_000, 'agent', { body: '**Import into Test Proj? You asked Codex: "I want to make my recipe app look a lot tidier".**\n\nA Codex conversation started yesterday at 6:14 PM in ~/Desktop/dev/zero. 3 turns.\n\nYou asked: I want to make my recipe app look a lot tidier.\n\n## Options\n1. Import into Test Proj\n2. Not now' }),
  ];

  it('draws one opening, and it carries the latest words', () => {
    const events = threadEvents(lines);
    const openings = events.filter((e) => e.field === 'body');
    expect(openings).toHaveLength(1);
    expect(openings[0].said).toBe('An agent opened this');
    expect(openings[0].words).toContain('You asked Codex: "I want to make my recipe app look a lot tidier"');
    expect(openings[0].words).toContain('3 turns.');
    expect(openings[0].words).not.toContain('Codex has not answered yet');
    // It sits where the opening sat, not at the time of the rewrite.
    expect(openings[0].at).toBe(T0 + 10);
    // And the rewrite line adds no second message.
    expect(events.filter((e) => e.message)).toHaveLength(1);
  });

  it('reaches the pane the same way', () => {
    const thread = itemThread(lines, []);
    const said = thread.events.filter((e) => e.kind !== 'work' && e.text);
    expect(said).toHaveLength(1);
    expect(said[0].text).toContain('You asked Codex');
    expect(thread.total).toBe(1);
  });

  it('a rewrite that says the same words changes nothing', () => {
    const same = [...lines, line(T0 + 3_000_000, 'agent', { body: lines[3].patch.body })];
    expect(threadEvents(same).filter((e) => e.message)).toHaveLength(1);
  });
});

describe('her own row', () => {
  it('keeps her words when an agent writes a body over them, because the fold ignores that line too', () => {
    const lines = [
      line(T0, 'system', { title: 'Make the sidebar quieter', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
      line(T0 + 1, 'founder', { title: 'Make the sidebar quieter', body: 'Make the sidebar quieter, please.' }),
      line(T0 + 500_000, 'agent', { body: 'An agent trying to put words in her mouth.' }),
    ];
    const events = threadEvents(lines);
    const openings = events.filter((e) => e.field === 'body');
    expect(openings).toHaveLength(1);
    expect(openings[0].who).toBe('you');
    expect(openings[0].words).toBe('Make the sidebar quieter, please.');
  });

  it('follows her own edit of her ask', () => {
    const lines = [
      line(T0, 'system', { title: 'Make the sidebar quieter', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
      line(T0 + 1, 'founder', { title: 'Make the sidebar quieter', body: 'Make the sidebar quieter, please.' }),
      line(T0 + 500_000, 'founder', { body: 'Make the sidebar quieter and narrower, please.' }),
    ];
    const openings = threadEvents(lines).filter((e) => e.field === 'body');
    expect(openings).toHaveLength(1);
    expect(openings[0].words).toBe('Make the sidebar quieter and narrower, please.');
  });
});
