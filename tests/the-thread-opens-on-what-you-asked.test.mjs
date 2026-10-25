// A new thread opened on a worker's progress note instead of on the message
// that started it (power-test-2, issue 21): "The agent 9:35pm — Now looking at
// how the open thread handles keys", and the tester's own first message under
// it.
//
// A thread you compose is written in two lines, the stamp that makes the row
// and then your words (store.composeItem), and a worker can claim the row and
// write between them. The ledger is read in the order it was appended and
// never re-sorted, so the note was first and the ask was second.
//
// Nothing happened on a thread before you asked for it, so the ask is its
// first line whatever the clock says. Everything else keeps the ledger's own
// order.

import { describe, expect, it } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history.ts';

const ID = 'w-0dd0';
const T = Date.UTC(2026, 9, 19, 21, 35);
const at = (s) => T + s * 1000;

// The shape the tester hit: the stamp, a worker's note, then her own line.
const lines = [
  { id: ID, ts: at(0), source: 'system', patch: { title: 'the nightly eval job writes results to the wrong bucket', status: 'open', kind: 'directive' } },
  { id: ID, ts: at(1), source: 'agent', claim: true },
  { id: ID, ts: at(2), source: 'agent', patch: { note: 'Now looking at how the open thread handles keys. Listed ./' } },
  { id: ID, ts: at(3), source: 'founder', patch: { title: 'the nightly eval job writes results to the wrong bucket', body: 'the nightly eval job writes results to the wrong bucket on weekends' } },
  { id: ID, ts: at(900), source: 'agent', patch: { result: 'Claude Code stopped partway through and did not finish this task.' } },
];

describe('a thread whose worker wrote before the ask landed', () => {
  const events = threadEvents(lines);

  it('opens on the message that started it', () => {
    expect(events[0].message).toBe(true);
    expect(events[0].words).toContain('wrong bucket on weekends');
    expect(events[0].who).toBe('you');
  });

  it('keeps the note, under the ask rather than over it', () => {
    const note = events.findIndex((e) => (e.words ?? '').includes('how the open thread handles keys'));
    expect(note).toBeGreaterThan(0);
  });

  it('leaves everything after the ask in the order the ledger has it', () => {
    const after = events.slice(1).map((e) => e.at);
    expect(after).toEqual([...after].sort((a, b) => a - b));
  });
});

describe('the ordinary thread is untouched', () => {
  it('already opens on the ask and stays exactly as it was', () => {
    const quiet = [
      { id: ID, ts: at(0), source: 'system', patch: { title: 'Tidy the settings page', status: 'open', kind: 'directive' } },
      { id: ID, ts: at(1), source: 'founder', patch: { title: 'Tidy the settings page', body: 'The rows are too far apart.' } },
      { id: ID, ts: at(30), source: 'agent', claim: true },
      { id: ID, ts: at(900), source: 'agent', patch: { result: 'Done.' } },
    ];
    const events = threadEvents(quiet);
    expect(events[0].words).toBe('The rows are too far apart.');
    expect(events.map((e) => e.at)).toEqual([at(1), at(30), at(900)]);
  });
});
