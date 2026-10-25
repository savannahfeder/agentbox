// PUTTING A TASK OFF IS CALLED LATER, AND NOWHERE YOU CAN SEE IS IT SNOOZE.
//
// Asked 2026-10-12 (w-66e3ece93d): "We refer to Snooze as Later. In Command-K
// and other cases where I'm searching for it, it should come up as Later."
// The key moved from S to L on 2026-10-01 (s-means-the-summary-and-l-means-
// later.test.mjs), the row chip and the tab already said Later, and the action
// itself still said Snooze in eleven places: the ⌘K row ("Remind Me (Snooze)"),
// the picker's title, three toasts, the undo words, the line in the thread
// ("You snoozed it"), the button under a scheduled thread ("snoozed until"),
// the byline chip ("back from snooze") and two error messages. Measured by
// grepping the renderer for string literals and JSX text holding "snooz":
// eleven hits before this change, none after.
//
// Typing "later" in ⌘K did find the row, but only because no other word in its
// label contained those letters by chance; "Remind Me (Snooze)" has no
// "later" in it, so it matched nothing and the row could not be found by the
// word the key stands for. The old words stay in the keywords, which are
// searched and never drawn, so "snooze" and "remind" still reach it.
//
// What is NOT renamed, on purpose: the ledger field `snoozedUntil`, the IPC
// channel `zero:snooze` and the view id 'snoozed'. Those are names on disk and
// on the wire that nobody reads, and changing the field would orphan every
// reminder already written.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LATER_KEYWORDS, matchesQuery, rankMatches } from '../renderer/src/palette-rows.ts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { actWords } from '../renderer/src/act-line.ts';
import { rowKeys } from '../renderer/src/list-rules.ts';
import { SHORTCUTS } from '../shared/shortcuts.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');

// The item commands as App.tsx assembles them over a focused row, with the
// Later row spelled the way the app now spells it.
const ROWS = [
  { id: 'remote-control', label: 'Remote Control', keywords: 'phone mobile continue claude rc' },
  { id: 'open-terminal', label: 'Open Terminal', keywords: 'shell command console' },
  { id: 'done', label: 'Close This Task' },
  { id: 'reply', label: 'Reply' },
  { id: 'read', label: 'Mark Read' },
  { id: 'snooze', label: 'Later', keywords: LATER_KEYWORDS },
];
const type = (query) => rankMatches(query, ROWS.filter((c) => matchesQuery(query, c))).map((c) => c.id);

describe('⌘K', () => {
  it('draws the row as Later, alone and over a ticked selection', () => {
    expect(app).toContain("{ id: 'snooze', label: 'Later', keywords: LATER_KEYWORDS, keyHint: 'L', run: () => openSnooze(target) },");
    expect(app).toContain("{ id: 'snooze', label: `Later (${n} selected)`, keywords: LATER_KEYWORDS, keyHint: 'L', run: () => openSnooze(sel) },");
  });

  it('finds it by the word on the key', () => {
    expect(type('later')).toEqual(['snooze']);
    expect(type('LAT')).toEqual(['snooze']);
  });

  it('still finds it by the old words, which are searched and never shown', () => {
    expect(type('snooze')).toEqual(['snooze']);
    expect(type('remind me')).toEqual(['snooze']);
    expect(type('put off')).toEqual(['snooze']);
    expect(type('rem')).toEqual(['snooze', 'remote-control']);
  });

  it('does not answer to a word that is neither', () => {
    expect(type('terminal')).toEqual(['open-terminal']);
    expect(type('latest')).toEqual([]);
  });
});

describe('the line in the thread', () => {
  const T = new Date(2026, 9, 1, 14, 32).getTime();
  const tomorrow9 = new Date(2026, 9, 2, 9, 0).getTime();
  const put = (source) => [{ id: 'w-1', ts: T, source, patch: { snoozedUntil: tomorrow9 } }];

  it('says you moved it to Later', () => {
    expect(threadEvents(put('founder')).map((e) => e.said)).toEqual(['You moved it to Later']);
  });

  it('reads as a few words beside the ring', () => {
    expect(actWords({ verb: 'You moved it to Later', subject: 'until tomorrow 9:00am' }).lead)
      .toBe('Moved to Later until tomorrow 9:00am');
    expect(actWords({ verb: 'You moved it to Later', subject: 'until 5:00pm' }, 'Ana').lead)
      .toBe('Ana moved to Later until 5:00pm');
  });

  it('leaves an agent pausing its own work in its own words', () => {
    expect(threadEvents([{ id: 'w-1', ts: T, source: 'agent', patch: { runAt: tomorrow9 } }]).map((e) => e.said))
      .toEqual(['It paused this']);
  });
});

describe('the rest of what you see', () => {
  it('titles the picker Later', () => {
    expect(read('renderer/src/components/Snooze.tsx')).toContain('title="Later"');
  });

  it('says Later on the toast, the undo and the failure', () => {
    // The toast names the thread and the key now
    // (tests/every-undo-you-can-press-z-for-says-so).
    expect(app).toContain('`Later: ${moved}. Back ${label.toLowerCase()}${SAYS_UNDO}`');
    expect(app).toContain("pushUndo({ label: 'Back in your inbox', undoes: 'undo moving it to Later'");
    expect(app).toContain("words: 'Undid moving it to Later'");
    expect(app).toContain('`Could not move it to Later: ');
  });

  it('gives L one word on a row, in the inbox and in the Later tab', () => {
    expect(rowKeys('inbox').find((k) => k.key === 'L').word).toBe('Later');
    expect(rowKeys('snoozed').find((k) => k.key === 'L').word).toBe('Later');
  });

  it('names L Later on the shortcuts page', () => {
    const l = SHORTCUTS.flatMap((g) => g.keys).filter((k) => k.keys.includes('L'));
    expect(l.map((k) => k.what)).toEqual(['Later: put the task off until a time you pick.']);
  });
});

// THE SWEEP. Every string literal and every run of JSX text in the renderer,
// with comments taken out, must not say snooze. Ids, class names and selectors
// ('snooze', 'modal snooze', '.modal.snooze') are names the code uses and are
// let through; anything with a capital or a space outside a class list is
// words somebody reads.
function sources(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return sources(rel);
    return /\.(tsx?|mjs)$/.test(e.name) ? [rel] : [];
  });
}

// One walk over the text: comments dropped, each string literal collected, and
// the code that is left with its strings blanked so JSX text can be read on its
// own. It tracks whether it is inside a quote, so a // inside 'https://' is
// not a comment, and a string that follows `className=` is a class list.
function split(text) {
  let code = '';
  const strings = [];
  let quote = null;
  let s = '';
  let classes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { s += c + (text[++i] ?? ''); continue; }
      if (c === quote) { if (!classes) strings.push(s); quote = null; code += '""'; continue; }
      s += c;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; code += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; s = ''; classes = /className=\{?`?$/.test(code.slice(-12)); continue; }
    code += c;
  }
  return { code, strings };
}

// A name the code uses rather than a word anybody reads: an identifier
// ('snoozedUntil'), an id ('zero:snooze'), a selector or a module path.
const aName = (s) => /^[a-z][A-Za-z]*$/.test(s) || /^[a-z.:\-_]+$/.test(s) || /^\.\.?\//.test(s) || /^\.[a-z]/.test(s);

function visibleSnoozes(file) {
  const { code, strings } = split(read(file));
  // The ⌘K keywords are the one place the word belongs: searched, never drawn.
  const found = strings.filter((s) => /[Ss]nooz/.test(s) && !aName(s) && s !== LATER_KEYWORDS).map((s) => `${file}: ${s}`);
  for (const m of code.matchAll(/>([^<>{}=;()]*[Ss]nooz[^<>{}=;()]*)</g)) found.push(`${file}: ${m[1].trim()}`);
  return found;
}

describe('the sweep', () => {
  it('finds no snooze in any word the renderer draws', () => {
    expect(sources('renderer/src').flatMap(visibleSnoozes)).toEqual([]);
  });

  it('nor in the error the store gives back', () => {
    expect(visibleSnoozes('main/store.mjs')).toEqual([]);
  });

  it('would catch one if it came back', () => {
    // The must-not-match half, run on the sweep itself.
    const probe = path.join(root, 'scripts/scratch');
    fs.mkdirSync(probe, { recursive: true });
    const file = path.join(probe, 'sweep-probe.tsx');
    fs.writeFileSync(file, [
      "const a = 'Snoozed. Back tomorrow';",
      "const b = 'snooze';",
      "const c = '.modal.snooze .palette-list';",
      "import { Snooze } from './components/Snooze';",
      '// a comment about snoozing',
      '<div className="modal snooze"><span>back from snooze</span></div>',
    ].join('\n'));
    try {
      expect(visibleSnoozes('scripts/scratch/sweep-probe.tsx').map((s) => s.split(': ')[1]))
        .toEqual(['Snoozed. Back tomorrow', 'back from snooze']);
    } finally {
      fs.rmSync(file);
    }
  });
});
