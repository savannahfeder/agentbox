// AN OPENED TASK IS CALLED WHAT ITS ROW IS CALLED (w-b8c8958a12).
//
// The title of an opened task must be the row's summary title, not a cut-off
// copy of the prompt.
//
// And the other half: on many rows the title is the only place the first
// sentence of the request is stored, so once the header stops printing it,
// the conversation has to.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadEvents } from '../renderer/src/thread-history.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const focus = fs.readFileSync(path.join(ROOT, 'renderer/src/components/Focus.tsx'), 'utf8');

const T = 1_790_000_000_000;
const TITLE = "In a task itself I can't see which project it is";
const PIC = '![pasted.png](attachments/pasted.png)';

// Her store writes a new row as two lines: the system stamps the title, her own
// line carries the title again and the body. Then a session writes a label.
const born = (body, title = TITLE) => [
  { id: 'w-1', ts: T, source: 'system', patch: { title, kind: 'directive' } },
  { id: 'w-1', ts: T + 1, source: 'founder', patch: { title, body } },
];
const labelled = (label) => ({ id: 'w-1', ts: T + 5, source: 'agent', patch: { label } });
const opening = (events) => events.find((e) => e.field === 'body') ?? events.find((e) => /opened this$/.test(e.said));

describe('the header', () => {
  it('prints the name the row prints, with her title on hover', () => {
    // A conversation with a person is named for the person (2026-10-01); every
    // other thread prints the name its row prints.
    expect(focus).toMatch(/className="keep-line-title" title=\{item\.title\}>\{direct && talkFull \? talkFull : rowTitle\(item\)\}</);
  });
});

describe('her title is said in the opening when the header no longer says it', () => {
  it('puts it above a body that is only a picture', () => {
    const o = opening(threadEvents([...born(PIC), labelled('Display project name in tasks')]));
    expect(o.words).toBe(`${TITLE}\n\n${PIC}`);
  });

  it('does not repeat it when the body already carries it', () => {
    const body = `${TITLE}, and the header should say so.`;
    const o = opening(threadEvents([...born(body, `${TITLE}…`), labelled('Project name in tasks')]));
    expect(o.words).toBe(body);
  });

  it('leaves a row with no label alone, because the header still says the title', () => {
    const o = opening(threadEvents(born(PIC)));
    expect(o.words).toBe(PIC);
  });

  it('says a title-only row once it has a label', () => {
    const lines = [{ id: 'w-1', ts: T, source: 'founder', patch: { title: TITLE } }, labelled('Project name')];
    expect(opening(threadEvents(lines)).words).toBe(TITLE);
  });
});
