// A CODEX CONVERSATION ASKS TO COME IN, AND HER YES OR NO DECIDES.
//
// The watch files ONE asking row per conversation, in the project whose
// folder it ran in, and never a second; yes turns it into a row she can read;
// no parks it in Closed; a later Import on a parked one is the same yes; and a
// row she said yes to follows Codex's latest answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { scanCodex } from '../main/codex-watch.mjs';
import { NAME, Name } from '../shared/product-name.mjs';
import {
  CODEX_IMPORT_LABEL, CODEX_MIRROR_LABEL, IMPORT_KIND, NOT_IMPORTED_LABEL, codexIdOf, codexImportRow,
  codexMirrorPatch, importChoice, isCodexImportRow, isCodexMirrorRow, isNotImportedRow, productsForThread,
  plainQuote, threadFactsLine, threadsNeedingRows, whereThreadLands,
} from '../shared/codex-import.mjs';

const NOW = Date.parse('2026-09-14T19:30:00-07:00');

async function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-codex-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  const s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-dev-'));
  const zero = path.join(dev, 'zero');
  const sketchbook = path.join(dev, 'sketchbook');
  fs.mkdirSync(zero); fs.mkdirSync(sketchbook);
  const { slug } = s.createProduct({ name: NAME, repoPath: zero });
  return { s, slug, zero, sketchbook, other: path.join(dev, 'nowhere') };
}

const thread = (id, folder, over = {}) => ({
  id, source: 'codex', folder, folderName: path.basename(folder), short: `~/dev/${path.basename(folder)}`,
  title: 'Tidy up the app layout', when: NOW - 9 * 60_000,
  prompt: 'I want to make my recipe app look a lot tidier.', last: 'Starting with the sidebar.', ...over,
});

const rows = (s, slug) => s.listAllWorkItems().filter((i) => i.product === slug && codexIdOf(i));

describe('the words on the asking row', () => {
  it('is the Codex title, a first line that carries the whole question, and the two options', () => {
    const row = codexImportRow(thread('t1', '/x/zero'), { projectName: NAME, now: NOW });
    expect(row.title).toBe('Tidy up the app layout');
    expect(row.kind).toBe(IMPORT_KIND);
    expect(row.labels).toEqual([CODEX_IMPORT_LABEL, 'codex:t1']);
    const first = row.body.split('\n')[0];
    expect(first).toBe(`**Import into ${NAME}? You asked Codex: "I want to make my recipe app look a lot tidier".**`);
    expect(first.replace(/\*\*/g, '').length).toBeLessThan(112);
    // A long prompt is cut to the row's budget on the line and given in full below.
    const long = codexImportRow(thread('t1', '/x/zero', { prompt: 'Read DESIGN-NOTES.md. Reuse the existing local Codex integration, fill the gaps needed for the weekly report, and finish it inside the application. Report the results before widening the scope.' }), { projectName: 'Sketchbook', now: NOW });
    const longFirst = long.body.split('\n')[0].replace(/\*\*/g, '');
    expect(longFirst.length).toBeLessThanOrEqual(110);
    expect(longFirst.startsWith('Import into Sketchbook? You asked Codex: "Read DESIGN-NOTES.md. Reuse the existing local Codex')).toBe(true);
    expect(longFirst.endsWith('…".')).toBe(true);
    expect(long.body).toContain('You asked: Read DESIGN-NOTES.md. Reuse the existing local Codex integration, fill the gaps needed for the weekly report, and finish it inside the application. Report the results before widening the scope.');
    expect(row.body).toContain('You asked: I want to make my recipe app look a lot tidier.');
    expect(row.body).toContain('Codex last said: Starting with the sidebar.');
    expect(row.body.split('## Options')[1].trim().split('\n')).toEqual([`1. Import into ${NAME}`, '2. Not now']);
  });
  it('carries the facts she approves from: where, how long, what was attached, whether Codex is still in it', () => {
    const t = thread('t1', '/x/zero', { startedAt: NOW - 30 * 60_000, lastActive: NOW - 3 * 60_000, turns: 3, images: 2 });
    expect(threadFactsLine(t, NOW)).toBe('A Codex conversation started 7:00 PM today in ~/dev/zero, last active 7:27 PM today. 3 turns, 2 screenshots attached.');
    expect(threadFactsLine({ ...t, live: true }, NOW)).toBe('A Codex conversation started 7:00 PM today in ~/dev/zero, still going. 3 turns, 2 screenshots attached.');
    expect(threadFactsLine({ ...t, turns: 1, images: 0, lastActive: t.startedAt + 1000 }, NOW)).toBe('A Codex conversation started 7:00 PM today in ~/dev/zero. 1 turn.');
    // A short one: one moment, not a start and an end.
    expect(threadFactsLine(thread('t2', '/x/zero', { turns: 1 }), NOW)).toBe('A Codex conversation from 7:21 PM today in ~/dev/zero. 1 turn.');
    expect(threadFactsLine({}, NOW)).toBe('');
    const row = codexImportRow(t, { projectName: NAME, now: NOW });
    expect(row.body.split('\n\n')[1]).toBe('A Codex conversation started 7:00 PM today in ~/dev/zero, last active 7:27 PM today. 3 turns, 2 screenshots attached.');
  });
  it('turns the headings in a long Codex answer into sentences on the row', () => {
    const t = thread('t1', '/x/zero', { last: 'Three proposals.\n\n### 1. Folio\n\nWarm paper.\n\n### 2. Studio\n\nCrisp type.' });
    const row = codexImportRow(t, { projectName: NAME, now: NOW });
    expect(row.body).toContain('Codex last said: Three proposals. 1. Folio. Warm paper. 2. Studio. Crisp type.');
    expect(row.body).not.toContain('###');
  });
  it('quotes Codex in words that work from a row: no pictures, no links to this Mac', () => {
    // A real message on a row, as Codex wrote it.
    const last = [
      '![Mockup of the inbox](/private/tmp/zero-mockup-ui/preview.png)',
      '',
      '[Open the interactive preview](http://127.0.0.1:5194/?fixtures=mock).',
      '',
      'One implemented design using your original UI. **6,474 tests pass**; renderer build passes.',
      '',
      'Ready for review in [the isolated worktree](/private/tmp/zero-mockup-ui/REVIEW.md); not installed in your running app.',
    ].join('\n');
    expect(plainQuote(last)).toBe('One implemented design using your original UI. **6,474 tests pass**; renderer build passes.\n\nReady for review in the isolated worktree; not installed in your running app.');
    // A link to the open web is kept, because it works from anywhere.
    expect(plainQuote('I like [this site](https://example.org/) a lot.')).toBe('I like [this site](https://example.org/) a lot.');
    expect(plainQuote('See [the docs](http://localhost:3000/docs) and [the site](https://example.com).')).toBe('See the docs and [the site](https://example.com).');
    expect(plainQuote(null)).toBe('');
    const t = thread('t1', '/x/zero', { last, prompt: 'Make it like [this site](https://example.org/). ![shot](/tmp/a.png)' });
    const row = codexImportRow(t, { projectName: NAME, now: NOW });
    expect(row.body).not.toContain('preview.png');
    expect(row.body).not.toContain('127.0.0.1');
    expect(row.body).not.toContain('REVIEW.md');
    expect(row.body).toContain('Codex last said: One implemented design using your original UI.');
    expect(row.body).toContain('You asked: Make it like [this site](https://example.org/).');
    // And the row she reads after yes says the same plain words.
    const p = codexMirrorPatch(t);
    expect(p.result.startsWith('One implemented design using your original UI.')).toBe(true);
    expect(p.result).not.toContain('](/private');
    expect(p.body).toBe('Make it like [this site](https://example.org/).');
  });
  it('says so when it could not read what she asked, rather than showing nothing', () => {
    const row = codexImportRow(thread('t1', '/x/zero', { prompt: '' }), { projectName: NAME, now: NOW });
    expect(row.body.split('\n')[0]).toBe(`**Import into ${NAME}? A Codex conversation from 7:21 PM today.**`);
    expect(row.body).toContain(`${Name} could not read what you asked; open it in Codex to see.`);
  });
  it('says so when Codex has not answered yet', () => {
    const row = codexImportRow(thread('t1', '/x/zero', { last: '' }), { projectName: NAME, now: NOW });
    expect(row.body).toContain('Codex has not answered yet.');
    expect(row.body).not.toContain('Codex last said');
  });
  it('the row she reads after yes is her prompt, then Codex, then where replies go', () => {
    const p = codexMirrorPatch(thread('t1', '/x/zero'));
    expect(p.body).toBe('I want to make my recipe app look a lot tidier.');
    expect(p.result).toBe('Starting with the sidebar.\n\nRead from Codex. Replies happen there.');
    expect(p.kind).toBe('directive');
    expect(p.labels).toEqual([CODEX_MIRROR_LABEL, 'codex:t1']);
  });
});

describe('what her answer means', () => {
  it('reads the key, the strip and a typed word the same way', () => {
    for (const yes of ['Yes', 'y', 'Import', `Option 1: Import into ${NAME}`, 'import it please']) expect(importChoice(yes)).toBe('yes');
    for (const no of ['No', 'n', 'Not now', 'Option 2: Not now', 'skip']) expect(importChoice(no)).toBe('no');
    for (const other of ['', 'make it blue', 'Option 3: something', null]) expect(importChoice(other)).toBeNull();
  });
});

describe('where a conversation lands', () => {
  it('is the project whose folder it ran in, trailing slash or not, and nowhere otherwise', () => {
    const products = [{ slug: 'agentbox', name: Name, repoPath: '/x/zero/' }, { slug: 'a', name: 'Sketchbook', repoPath: '/x/sketchbook' }];
    expect(whereThreadLands(thread('t', '/x/zero'), products).slug).toBe('agentbox');
    expect(whereThreadLands(thread('t', '/x/sketchbook/'), products).slug).toBe('a');
    expect(whereThreadLands(thread('t', '/x/other'), products)).toBeNull();
    expect(whereThreadLands({ folder: '' }, products)).toBeNull();
  });
  it('lists every project on the folder, so the store can choose among them', () => {
    const products = [{ slug: 'a', name: 'A', repoPath: '/x/zero' }, { slug: 'b', name: 'B', repoPath: '/x/zero/' }, { slug: 'c', name: 'C', repoPath: '/x/c' }];
    expect(productsForThread(thread('t', '/x/zero'), products).map((p) => p.slug)).toEqual(['a', 'b']);
    expect(productsForThread(thread('t', '/x/none'), products)).toEqual([]);
  });
  it('a conversation with any row anywhere, asking, imported or declined, needs no new one', () => {
    const items = [
      { labels: [CODEX_IMPORT_LABEL, 'codex:a'] },
      { labels: [CODEX_MIRROR_LABEL, 'codex:b'], status: 'open' },
      { labels: [NOT_IMPORTED_LABEL, 'codex:c'], status: 'done' },
    ];
    const need = threadsNeedingRows([thread('a', '/x'), thread('b', '/x'), thread('c', '/x'), thread('d', '/x'), thread('d', '/x'), thread('', '/x')], items);
    expect(need.map((t) => t.id)).toEqual(['d']);
  });
});

describe('the store, end to end', () => {
  it('files one asking row per conversation in its project, and never a second', async () => {
    const { s, slug, zero, sketchbook } = await store();
    const threads = [thread('t1', zero), thread('t2', sketchbook)];
    expect(s.askAboutCodexThreads(threads, { now: NOW })).toBe(1); // sketchbook has no project
    expect(s.askAboutCodexThreads(threads, { now: NOW })).toBe(0);
    const [row] = rows(s, slug);
    expect(isCodexImportRow(row)).toBe(true);
    expect(row.status).toBe('open');
    expect(row.kind).toBe(IMPORT_KIND);
    expect(row.title).toBe('Tidy up the app layout');
    expect(row.body.startsWith(`**Import into ${NAME}?`)).toBe(true);
    expect(row.wrote.body.source).toBe('agent');
  });

  it('when several projects point at one folder, the one with her own work wins, then the oldest', async () => {
    const { s, zero } = await store(); // Powerup, made now, on `zero`
    const older = s.createProduct({ name: 'Zero', repoPath: zero }).slug;
    const file = path.join(s.productDir(older), 'project.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), createdAt: '2026-08-24T20:53:43.097Z' }));
    const products = s.listProducts();
    // Neither has a row of her own in it, so age decides: Zero.
    expect(s.homeForCodexThread(thread('t', zero), products, s.listAllWorkItems()).slug).toBe(older);
    // Give the app a task of her own and it wins on work.
    const powerup = products.find((p) => p.name === NAME).slug;
    s.modules.workItemsDisk.createWorkItem(s.productDir(powerup), { title: 'Ship the thing', kind: 'directive', labels: ['founder'] }, { source: 'founder', now: NOW });
    expect(s.homeForCodexThread(thread('t', zero), products, s.listAllWorkItems()).slug).toBe(powerup);
    // Codex rows themselves never count as her work, or the first pick would entrench itself.
    s.askAboutCodexThreads([thread('t9', zero, { title: 'Nine' })], { now: NOW });
    expect(s.homeForCodexThread(thread('t', zero), products, s.listAllWorkItems()).slug).toBe(powerup);
  });

  it('an asking row is retold when the transcript says more than the row does', async () => {
    const { s, slug, zero } = await store();
    const thin = thread('t1', zero, { prompt: '', last: '' });
    s.askAboutCodexThreads([thin], { now: NOW });
    const [before] = rows(s, slug);
    expect(before.body).toContain('Codex has not answered yet.');
    const full = thread('t1', zero, { turns: 2, images: 1, startedAt: NOW - 600_000, lastActive: NOW - 60_000 });
    expect(s.refreshCodexAsks([full], { now: NOW + 1000 })).toBe(1);
    expect(s.refreshCodexAsks([full], { now: NOW + 2000 })).toBe(0);
    const [after] = rows(s, slug);
    expect(after.body).toContain('You asked: I want to make my recipe app look a lot tidier.');
    expect(after.body).toContain('Codex last said: Starting with the sidebar.');
    expect(after.body).toContain('2 turns, 1 screenshot attached.');
    expect(after.wrote.body.source).toBe('agent');
    expect(isCodexImportRow(after)).toBe(true);
    // A row she already answered is left alone.
    s.answerCodexImport(slug, after.id, 'yes', { thread: full, now: NOW + 3000 });
    expect(s.refreshCodexAsks([{ ...full, last: 'Different.' }], { now: NOW + 4000 })).toBe(0);
  });

  it('yes makes it a row she can read, open, with her prompt as hers and Codex as the result', async () => {
    const { s, slug, zero } = await store();
    const t = thread('t1', zero);
    s.askAboutCodexThreads([t], { now: NOW });
    const [asking] = rows(s, slug);
    const after = s.answerCodexImport(slug, asking.id, 'yes', { thread: t, now: NOW + 1000 });
    expect(isCodexImportRow(after)).toBe(false);
    expect(isCodexMirrorRow(after)).toBe(true);
    expect(after.status).toBe('open');
    expect(after.kind).toBe('directive');
    expect(after.body).toBe(t.prompt);
    expect(after.wrote.body.source).toBe('founder');
    expect(after.result).toBe('Starting with the sidebar.\n\nRead from Codex. Replies happen there.');
    expect(after.wrote.result.source).toBe('agent');
    expect(after.wrote.result.ts).toBeGreaterThan(after.wrote.body.ts);
    expect(after.labels).toEqual([CODEX_MIRROR_LABEL, 'codex:t1']);
  });

  it('yes still works when the transcript cannot be read again: the row already knows its words', async () => {
    const { s, slug, zero } = await store();
    s.askAboutCodexThreads([thread('t1', zero)], { now: NOW });
    const [asking] = rows(s, slug);
    const after = s.answerCodexImport(slug, asking.id, 'yes', { now: NOW + 1000 });
    expect(after.body).toBe('I want to make my recipe app look a lot tidier.');
    expect(after.result.startsWith('Starting with the sidebar.')).toBe(true);
  });

  it('no parks it in Closed under not-imported, and Import later is the same yes', async () => {
    const { s, slug, zero } = await store();
    const t = thread('t1', zero);
    s.askAboutCodexThreads([t], { now: NOW });
    const [asking] = rows(s, slug);
    const parked = s.answerCodexImport(slug, asking.id, 'no', { now: NOW + 1000 });
    expect(parked.status).toBe('done');
    expect(parked.wrote.status.source).toBe('founder');
    expect(isNotImportedRow(parked)).toBe(true);
    expect(isCodexImportRow(parked)).toBe(false);
    // The watch sees the parked row and files nothing new.
    expect(s.askAboutCodexThreads([t], { now: NOW + 2000 })).toBe(0);
    const back = s.answerCodexImport(slug, asking.id, 'yes', { thread: t, now: NOW + 3000 });
    expect(back.status).toBe('open');
    expect(isCodexMirrorRow(back)).toBe(true);
    expect(back.labels).not.toContain(NOT_IMPORTED_LABEL);
  });

  it('the row she said yes to follows Codex\'s latest answer, and only when it changed', async () => {
    const { s, slug, zero } = await store();
    const t = thread('t1', zero);
    s.askAboutCodexThreads([t], { now: NOW });
    const [asking] = rows(s, slug);
    s.answerCodexImport(slug, asking.id, 'yes', { thread: t, now: NOW + 1000 });
    expect(s.refreshCodexMirrors([t], { now: NOW + 2000 })).toBe(0);
    const later = { ...t, last: 'The sidebar is done. Next the type scale.' };
    expect(s.refreshCodexMirrors([later], { now: NOW + 3000 })).toBe(1);
    const [row] = rows(s, slug);
    expect(row.result.startsWith('The sidebar is done.')).toBe(true);
    // A parked one is left alone.
    s.answerCodexImport(slug, asking.id, 'no', { now: NOW + 4000 });
    expect(s.refreshCodexMirrors([{ ...later, last: 'Again.' }], { now: NOW + 5000 })).toBe(0);
  });

  it('the ⌘K card\'s press imports at once, whatever state the row was in', async () => {
    const { s, slug, zero } = await store();
    const a = thread('a', zero);
    const b = thread('b', zero, { title: 'Second one' });
    const c = thread('c', zero, { title: 'Third one' });
    s.askAboutCodexThreads([a], { now: NOW });
    const [askingA] = rows(s, slug);
    s.answerCodexImport(slug, askingA.id, 'no', { now: NOW + 1000 });
    s.askAboutCodexThreads([b], { now: NOW + 2000 });
    const out = s.importCodexThreads(slug, [a, b, c], { now: NOW + 3000 });
    expect(out.added).toBe(3);
    expect(out.already).toBe(0);
    const all = rows(s, slug);
    expect(all).toHaveLength(3);
    for (const row of all) { expect(isCodexMirrorRow(row)).toBe(true); expect(row.status).toBe('open'); }
    // Pressing again moves nothing.
    expect(s.importCodexThreads(slug, [a, b, c], { now: NOW + 4000 })).toEqual({ ids: [], added: 0, already: 3 });
  });

  // The watch stopped asking on 2026-10-05 (w-db6f5e331e): importing is on
  // command only, pinned in after-setup-nothing-is-imported-unless-you-ask.
  it('one scan of the watch refreshes what was imported and asks about nothing', async () => {
    const { s, slug, zero } = await store();
    const t = thread('t1', zero);
    const first = scanCodex({ store: s, readThreads: () => ({ threads: [t] }), now: NOW });
    expect(first).toEqual({ refreshed: 0, retold: 0, threads: 1 });
    expect(rows(s, slug)).toEqual([]);
    s.importCodexThreads(slug, [t], { now: NOW + 1000 });
    const second = scanCodex({ store: s, readThreads: () => ({ threads: [{ ...t, last: 'Done.' }] }), now: NOW + 2000 });
    expect(second).toEqual({ refreshed: 1, retold: 0, threads: 1 });
    // A reader that throws costs nothing.
    expect(scanCodex({ store: s, readThreads: () => { throw new Error('no codex'); } })).toEqual({ refreshed: 0, retold: 0, threads: 0 });
  });
});
