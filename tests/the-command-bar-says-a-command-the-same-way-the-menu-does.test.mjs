// ⌘K AND THE THREE-DOT MENU CALL A COMMAND THE SAME THING, IN SENTENCE CASE.
//
// Reported from the QA box, 2026-10-23: "the palette mixes Title Case ('Done
// Task', 'Mark Read') with sentence case ('New thread')".
//
// Measured in thread-commands.ts: a `titled` helper there took the menu's own
// rows and upper-cased every word of them on the way into ⌘K, so one command
// had two spellings — the menu said "Run on this Mac" and ⌘K said "Run on This
// Mac" — and the rows written straight into ⌘K were in neither style. The
// helper is gone. Where both surfaces offer a command, they read it off the
// same words; everything else in the list is written as a sentence.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACE_ROW, threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { runNowCommands } from '../renderer/src/run-now.ts';
import { threadCommands } from '../renderer/src/thread-commands.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const labels = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.label]));

describe('a command offered in both places', () => {
  const menu = labels(threadMenuRows({ change: true, terminal: 'closed', finish: true, runNow: true, pin: 'unpinned', place: 'cloud' }));
  const bar = labels(threadCommands({
    seen: 'private', teammates: true, pinned: false, rename: true, repeats: true, addPeople: true,
    place: 'cloud', open: { summary: 'shut', change: true },
  }));

  it('reads the same on both, for the place a thread runs in', () => {
    expect(bar.place).toBe(menu.place);
    expect(bar.place).toBe(PLACE_ROW.cloud.label);
  });

  it('and for the rest of the pairs', () => {
    expect(bar.code).toBe(menu.code);
    expect(bar.pin).toBe(menu.pin);
    expect(runNowCommands({ id: 'w-1' }, { queued: ['w-1'] }, () => {})[0].label).toBe(menu.run);
    // Finishing a thread is built in App.tsx rather than here, off the same
    // one word every surface reads (../renderer/src/done-word).
    expect(read('renderer/src/App.tsx')).toContain('`Mark ${DONE.verb.toLowerCase()}`');
    expect(menu.done).toBe('Mark done');
  });

  // THE CASE THAT MUST NOT MATCH: a row nobody looked at going back to
  // headline case. One capital at the front, and after that only a word the
  // app capitalises everywhere (a Mac, a tab, a tool, a person's product).
  it('is written as a sentence, like every other row in the list', () => {
    const PROPER = /^(Mac|Claude|Codex|Agentbox|Inbox|Later|Done|Team|Light|Dark|Code)$/;
    for (const label of [...Object.values(bar), ...Object.values(menu)]) {
      for (const word of label.replace('…', '').split(' ').slice(1)) {
        expect(/^[A-Z]/.test(word) && !PROPER.test(word), `${label}: ${word}`).toBe(false);
      }
    }
  });
});

describe('the helper that made the two disagree', () => {
  it('is gone, so nothing re-cases a label on its way into ⌘K', () => {
    const src = read('renderer/src/thread-commands.ts');
    expect(src).not.toMatch(/function titled\b/);
    expect(src).not.toMatch(/titled\(/);
  });

  it('and the rows ⌘K writes for itself are sentences too', () => {
    const app = read('renderer/src/App.tsx');
    for (const old of ['Mark Read', 'Mark Unread', 'Resume Agents', 'Remote Control', 'Open Terminal',
      'Send Back to Agent', 'Restart the Agent', 'Resume This Agent', 'Approve Recommended',
      'Approve (Run It)', 'Let It Run Now', 'Done Task']) {
      expect(app, old).not.toContain(`'${old}'`);
    }
    // The tabs keep their capitals, because that is their name on the strip.
    expect(app).toContain("label: `Back to Inbox (${n} selected)`");
  });
});
