// A SENT NOTE SAYS WHEN IT WAS SENT.
//
// Found by a synthetic tester on w-d18e699928: Send pressed at 12:38 on two
// notes beside leads.csv, and the sidebar read "Sent 11:58pm" and "Sent
// 12:21am", the times the notes were written. Measured by reading the
// sidebar: it printed "Sent " before the note's own time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { sentTimes } from '../renderer/src/notes-sidebar';

const line = (ts, patch) => ({ id: 'w-1', ts, source: 'founder', patch });
const note = (ts, id) => line(ts, { artifact: { do: 'note', id, file: 'leads.csv', text: `note ${id}`, place: { kind: 'whole' }, wait: true } });

describe('the time a note was sent', () => {
  it('is the time of the first line that sent it, by Send or by delivery', () => {
    const t = sentTimes([note(1, 'n1'), note(2, 'n2'), note(3, 'n3'), line(9, { artifact: { do: 'toagent', on: ['n1', 'n2'] } }), line(12, { artifact: { do: 'sent', on: ['n1', 'n3'] } })]);
    expect(t.get('n1')).toBe(9);
    expect(t.get('n2')).toBe(9);
    expect(t.get('n3')).toBe(12);
  });
  it('is unknown for a note nothing sent', () => {
    expect(sentTimes([note(1, 'n1')]).has('n1')).toBe(false);
  });
  it('is what the sidebar says, and a note not sent shows only when it was written', () => {
    const side = fs.readFileSync(new URL('../renderer/src/components/NotesSidebar.tsx', import.meta.url), 'utf8');
    expect(side).toContain('{note.sent && sentAt ? `Sent ${clock(sentAt)}` : clock(note.ts)}');
  });
});
