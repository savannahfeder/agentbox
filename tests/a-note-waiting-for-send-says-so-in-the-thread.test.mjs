// A NOTE WAITING FOR SEND SAYS SO IN THE THREAD.
//
// Found by every synthetic tester on w-d18e699928: a note added beside a file
// and never sent was drawn in the thread as "You, Note on leads.csv", exactly
// like a message the agent had. They left full screen without pressing Send,
// read the thread and believed it had gone; one was later surprised to be
// offered Send again on it. Measured by reading the thread's events: a held
// note carried nothing that told it from a sent one. And the sidebar read
// "Sent 11:58pm" for a note sent at 12:38, the time it was written.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadEvents } from '../renderer/src/thread-history';
import { messageKind } from '../renderer/src/threads/message-kind';
import { sentTimes } from '../renderer/src/notes-sidebar';

const line = (ts, patch) => ({ id: 'w-1', ts, source: 'founder', patch });
const note = (ts, id, extra = {}) => line(ts, { artifact: { do: 'note', id, file: 'leads.csv', text: `note ${id}`, place: { kind: 'whole' }, ...extra } });
const kindOf = (lines, words) => messageKind(threadEvents(lines).find((e) => e.words === words));

describe('in the thread', () => {
  it('a note held for Send says it is unsent', () => {
    expect(kindOf([note(1, 'n1', { wait: true })], 'note n1')?.word).toBe('Note on leads.csv, unsent');
  });
  it('once sent, it is a plain note again', () => {
    expect(kindOf([note(1, 'n1', { wait: true }), line(2, { artifact: { do: 'sent', on: ['n1'] } })], 'note n1')?.word).toBe('Note on leads.csv');
  });
  it('a note that went straight to the agent never says it', () => {
    expect(kindOf([note(1, 'n1')], 'note n1')?.word).toBe('Note on leads.csv');
  });
  it('a resolved note is not waiting either', () => {
    expect(kindOf([note(1, 'n1', { wait: true }), line(2, { artifact: { do: 'resolve', on: 'n1' } })], 'note n1')?.word).toBe('Note on leads.csv');
  });
});

describe('in the sidebar', () => {
  it('the time a note was sent is the time of the line that sent it', () => {
    const t = sentTimes([note(1, 'n1', { wait: true }), note(2, 'n2', { wait: true }), line(9, { artifact: { do: 'sent', on: ['n1', 'n2'] } }), line(12, { artifact: { do: 'sent', on: ['n1'] } })]);
    expect(t.get('n1')).toBe(9);
    expect(t.get('n2')).toBe(9);
    expect(t.has('n3')).toBe(false);
  });
  it('a sent note says Sent at that time, and an unsent one only when it was written', () => {
    const side = fs.readFileSync(new URL('../renderer/src/components/NotesSidebar.tsx', import.meta.url), 'utf8');
    expect(side).toContain("{note.sent && sentAt ? `Sent ${clock(sentAt)}` : clock(note.ts)}");
  });
});
