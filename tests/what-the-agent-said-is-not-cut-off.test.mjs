// She attached the reading pane. Two different things on it were cut and this
// file pins both, because they wear one word and have nothing else in common.
//
// ONE. THE MESSAGE. `oneLine` in terminal.ts cut every line of prose at 300
// characters. That cap is left over from when these lines fed a terminal panel
// with a three-line window; they are her agent's MESSAGES now and they are the
// body of the conversation. Measured over her own store on 2026-08-24, 1,532
// traces: 12,292 agent messages, 968 cut, 1,592,582 characters discarded, the
// worst showing 4.2% of itself.
//
// The tail in her screenshot is the tell and it is reproduced below. A
// continuation line was appended to an ALREADY truncated string and truncated
// again, stacking a second ellipsis, so the message ended `.……` — seven dots.
// 159 of the 968 had it.
//
// TWO. THE COMMAND. Her line was `ran grep -o '"id":""' work-items.jso…`, cut
// by the box two characters short of whole, and it could not be opened to see
// the rest: `full` only ever travelled when OUR shortening changed the string,
// and this command needed no shortening. 13,522 of her 39,258 clipped work
// lines were unrecoverable that way. The pane now asks the browser whether the
// box clipped and opens onto the subject itself when it did, which is asserted
// in Thread.tsx's source here because this repo has no DOM test environment
// (the reasoning is in shortcuts-swallow-their-key.test.mjs).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceLines } from '../renderer/src/terminal.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const startedAt = Date.parse('2026-08-24T02:41:00Z');

// Her own message, in the supervisor's real shape: one stamped opening line,
// then paragraphs separated by blank lines. Shortened in the middle only; the
// first paragraph is verbatim from sessions/ and is 299 characters on its own,
// which is what put the cut exactly where she photographed it.
const HER_SHAPE = {
  startedAt,
  text: [
    '02:49:52  Merged and closed.',
    '',
    '**What landed.** Main is now `fd7df45`. `resolveTheme` takes one argument and returns dark when nothing is stored, a first run writes the look down instead of only painting it, and `prefers-color-scheme` and `systemPrefersDark` appear nowhere in `renderer/`, `main/` or `shared/`.',
    '',
    '**What I actually did rather than merging it as built.** Main had moved since the branch was cut, so I merged main into the branch in a scratch worktree and re-verified there.',
    '',
    '**What I did not do.** No rebuild, no package, no release.',
  ].join('\n'),
};

describe('the message she reads is the message it wrote', () => {
  const [message] = traceLines(HER_SHAPE);

  it('is not cut at three hundred characters', () => {
    expect(message.kind).toBe('say');
    expect(message.text.length).toBeGreaterThan(300);
    expect(message.text).toMatch(/No rebuild, no package, no release\.$/);
  });

  it('never ends in the stacked ellipsis from her screenshot', () => {
    // `.……` is seven dots. It is what a string cut at 300 looks like after a
    // second continuation line was appended to it and cut at 300 again.
    expect(message.text).not.toMatch(/…/);
    expect(message.text).not.toMatch(/\.……/);
  });

  it('keeps the paragraphs it was written in', () => {
    expect(message.text.split('\n\n')).toHaveLength(4);
    expect(message.text.startsWith('Merged and closed.\n\n**What landed.**')).toBe(true);
  });

  it('leaves the cap on what it RAN, which is an argument and not prose', () => {
    const [line] = traceLines({
      startedAt,
      text: `02:49:52  [Bash] echo ${'x'.repeat(400)}`,
    });
    expect(line.kind).toBe('tool');
    expect(line.text.endsWith('…')).toBe(true);
    expect(line.text.length).toBe(301);
  });
});

// HER OWN TRACE, unedited, read by the reader the app uses. The fixture above
// is the shape; this is the file she was looking at.
describe('the trace she photographed', () => {
  const file = '/Users/you/Zero/accounts/00000000-0000-4000-8000-000000000000/agentbox/sessions/w-6fcf1072ca/1787539254456.log';

  it.skipIf(!fs.existsSync(file))('reads whole, where it used to read 299 characters', () => {
    const said = traceLines({ startedAt: 1787539254456, text: fs.readFileSync(file, 'utf8') })
      .filter((l) => l.kind === 'say');
    const last = said[said.length - 1];
    expect(last.text.length).toBe(1625);
    expect(last.text).not.toMatch(/…/);
    expect(last.text).toMatch(/^Merged and closed\./);
    expect(last.text).toMatch(/stale options removed\.$/);
  });
});

describe('a command the box cut can still be read', () => {
  const source = read('renderer/src/components/Thread.tsx');

  it('asks the browser whether the box clipped, rather than guessing a width', () => {
    expect(source).toMatch(/scrollWidth > el\.clientWidth/);
    expect(source).toMatch(/new ResizeObserver\(check\)/);
  });

  it('opens a clipped line even when nothing came back from it', () => {
    expect(source).toMatch(/const canOpen = all\.length > 0 \|\| !!work\.full \|\| clipped;/);
  });

  it('falls back to the subject itself, which is already the whole string', () => {
    expect(source).toMatch(/const whole = work\.full \|\| \(clipped \? work\.subject : ''\);/);
    expect(source).toMatch(/state !== SHUT && !!whole && <pre className="did-full">\{whole\}<\/pre>/);
  });
});
