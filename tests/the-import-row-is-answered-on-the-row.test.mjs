// THE ROW THAT ASKS WHETHER A CODEX CONVERSATION COMES IN, ON HER SCREEN.
//
// So the row is a Codex title with one line under it saying where it would go,
// Y and N at its right end all the time, and opening it draws the app's own
// options strip off the body. This file holds the renderer's side of that and
// the two list rules it depends on: the row reaches her inbox, and the line
// the inbox prints under the title carries the whole question.
import { describe, it, expect } from 'vitest';
import { codexImportRow, codexMirrorPatch, whenPhrase } from '../shared/codex-import.mjs';
import { IMPORT_KEYS, NOT_IMPORTED_HEADING, NOT_IMPORTED_KEYS, importAnswer, isCodexRow, isImportRow, isNotImportedRow } from '../renderer/src/import-row';
import { belongsInInbox, belongsInProgress, rowSummary, SUMMARY_BUDGET } from '../renderer/src/list-rules';
import { itemOptions, offerIsLive } from '../renderer/src/format';
import { bylineFacts } from '../renderer/src/byline';
import { NAME, Name } from '../shared/product-name.mjs';

describe('the header over a Codex row says Codex', () => {
  it('names Codex on the asking row, the imported row and the declined row, whatever would run here', () => {
    const NOW = Date.parse('2026-09-14T19:30:00-07:00');
    const base = { id: 'w', product: 'p', productName: 'P', status: 'open', title: 't', kind: 'import', priority: 5, epoch: 0, claim: null, createdAt: NOW, updatedAt: NOW };
    const facts = { engineChoice: true, engine: 'claude', now: NOW };
    expect(bylineFacts({ ...base, labels: ['codex-import', 'codex:1'] }, facts).engineWord).toBe('Codex');
    expect(bylineFacts({ ...base, labels: ['codex', 'codex:1'], kind: 'directive' }, facts).engineWord).toBe('Codex');
    expect(bylineFacts({ ...base, labels: ['not-imported', 'codex:1'], status: 'done' }, facts).engineWord).toBe('Codex');
    // An ordinary row is untouched: the engine that would run it, and only where there is a choice.
    expect(bylineFacts({ ...base, labels: ['founder'], kind: 'directive' }, facts).engineWord).toBe('Claude Code');
    expect(bylineFacts({ ...base, labels: ['founder'], kind: 'directive' }, { ...facts, engineChoice: false }).engineWord).toBeNull();
  });
});

const NOW = Date.parse('2026-09-14T19:30:00-07:00');
const THREAD = {
  id: '01a0a2a7', source: 'codex', folder: '/Users/s/Desktop/dev/zero', folderName: 'zero', short: '~/Desktop/dev/zero',
  title: 'Tidy up the app layout', when: NOW - 9 * 60_000,
  prompt: 'Make the recipe app look a lot tidier.', last: 'I read the screenshots. Starting with the sidebar.',
};

/** The asking row as the store writes it: agent-made, open, body after title. */
function askingRow(over = {}) {
  const row = codexImportRow(THREAD, { projectName: NAME, now: NOW });
  const ts = NOW - 60_000;
  return {
    id: 'w-1', product: 'agentbox', productName: Name, status: 'open', epoch: 0, claim: null,
    title: row.title, body: row.body, kind: row.kind, labels: row.labels, priority: row.priority,
    createdAt: ts, updatedAt: ts,
    wrote: { title: { ts, source: 'agent' }, body: { ts, source: 'agent' }, status: { ts, source: 'agent' } },
    ...over,
  };
}

describe('which rows are which', () => {
  it('knows the asking row, the declined row and the imported row apart', () => {
    const asking = askingRow();
    expect(isImportRow(asking)).toBe(true);
    expect(isNotImportedRow(asking)).toBe(false);
    expect(isCodexRow(asking)).toBe(false);
    const declined = askingRow({ status: 'done', labels: ['not-imported', 'codex:01a0a2a7'] });
    expect(isImportRow(declined)).toBe(false);
    expect(isNotImportedRow(declined)).toBe(true);
    const mirrored = askingRow({ kind: 'directive', labels: codexMirrorPatch(THREAD).labels });
    expect(isImportRow(mirrored)).toBe(false);
    expect(isCodexRow(mirrored)).toBe(true);
    expect(isImportRow(null)).toBe(false);
  });
  it('an asking row that was closed is no longer asking', () => {
    expect(isImportRow(askingRow({ status: 'done' }))).toBe(false);
  });
});

describe('the two keys and the word each sends', () => {
  it('are 1 for yes and 2 for no, which replaced Y and N, and I to bring one back', () => {
    expect(IMPORT_KEYS).toEqual([{ key: '1', word: 'Yes' }, { key: '2', word: 'No' }]);
    expect(NOT_IMPORTED_KEYS).toEqual([{ key: 'I', word: 'Import' }]);
    expect(importAnswer('yes')).toBe('Yes');
    expect(importAnswer('no')).toBe('Not now');
    expect(NOT_IMPORTED_HEADING).toBe('Not imported');
  });
});

describe('where the row is and what the inbox prints under it', () => {
  it('reaches her inbox and not In progress while it is asking', () => {
    const row = askingRow();
    expect(belongsInInbox(row, { now: NOW })).toBe(true);
    expect(belongsInProgress(row, { now: NOW })).toBe(false);
  });
  it('prints the whole question on the row, under the budget, and names the project', () => {
    const line = rowSummary(askingRow(), 'inbox');
    // What she asked is ON the row, so the list tells her what the task is
    // without opening it.when the detail was in the body and the line read
    // exactly as before.
    expect(line).toBe(`Import into ${NAME}? You asked Codex: "Make the recipe app look a lot tidier".`);
    expect(line.length).toBeLessThan(SUMMARY_BUDGET);
  });
  it(`opening it draws the app's own options strip: Import into ${NAME}, then Not now`, () => {
    const row = askingRow();
    expect(offerIsLive(row)).toBe(true);
    expect(itemOptions(row).map((o) => o.text)).toEqual([`Import into ${NAME}`, 'Not now']);
  });
  it('says when in her words', () => {
    expect(whenPhrase(NOW - 9 * 60_000, NOW)).toBe('7:21 PM today');
    expect(whenPhrase(NOW - 26 * 3600_000, NOW)).toMatch(/^yesterday at /);
    expect(whenPhrase(NOW - 3 * 86400_000, NOW)).toMatch(/^Friday at /); // 14 September 2026 is a Monday
    expect(whenPhrase(NOW - 20 * 86400_000, NOW)).toBe('August 25');
    expect(whenPhrase(0, NOW)).toBe('');
  });
});
