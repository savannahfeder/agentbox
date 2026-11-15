// THE BUTTONS AT THE FOOT OF A THREAD READ AS BUTTONS.
//
// A tester brought back a thread put off for later and called its control "a
// lowercase sentence in a box ('back to inbox · in Later until today 8:00 AM')
// that reads like a status, not a button". The words for the press and the
// note about when sat in one bordered box, in lower case, and the time was
// written "8:00 AM" where every other time in the app reads "8:00am".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const focus = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/Focus.tsx'), 'utf8');
const row = focus.slice(focus.indexOf('<div className="focus-actions">'), focus.indexOf('focus-dock'));

describe('the foot of a thread', () => {
  it('names each press in sentence case', () => {
    for (const w of ['Back to inbox', 'Let it run now', 'Start it now', 'Take me to it', 'Send back to agent']) expect(row).toContain(w);
    for (const w of ["'back to inbox'", "'let it run now'", '>send back to agent<']) expect(row).not.toContain(w);
  });
  it('says when beside the button, not inside it', () => {
    expect(row).toMatch(/<\/button>\n\s+<span className="focus-when">/);
    expect(row).not.toContain('<span className="dim">{\' · \'}');
  });
  it('writes the time the way the rest of the app does', () => {
    expect(focus).toMatch(/function whenLabel\(ts: number, now = Date\.now\(\)\): string \{\n\s+const d = new Date\(ts\);\n\s+const time = `\$\{d\.getHours\(\) % 12 \|\| 12\}:\$\{String\(d\.getMinutes\(\)\)\.padStart\(2, '0'\)\}\$\{d\.getHours\(\) < 12 \? 'am' : 'pm'\}`;/);
  });
});
