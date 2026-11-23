// A note opened from its line in the thread opens the picture it is on.
//
// What broke (2026-11-21, w-05897f8e46): a note on an agent's -v2 picture,
// pressed from "Note on <name>-v2.png" in the thread, opened the big view on
// "Opening This file…" and stayed there. The agent had said the -v2 only in
// its run's log, so Files had numbered the file's first version (which the
// row's history named) and not the -v2. A version Files has not numbered is
// kept only when the press names its path, and a press from a note names the
// note, not a path, so the -v2 was dropped and the press never landed.
// Rebuilt from the note's record and the run-log case in
// a-picture-opened-big-walks-the-answer-only-its-runs-log-holds.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { filesInLines, pathsAPressKeeps, stillInHand, threadFiles, whereAPressLands, withFilesAsked } from '../shared/artifact-marks.mts';
import { withRunsSaid } from '../shared/runs-said.mts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && fs.existsSync(chromium.executablePath());
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const D = '/Users/someone/store/designs/w-1/round-two';
const startedAt = Date.UTC(2026, 10, 21, 19, 20, 0);
const at = (s) => `19:20:${String(s).padStart(2, '0')}`;

// The row's history: an earlier round of two pictures.
const ledger = [{ id: 'l1', ts: startedAt - 600_000, source: 'agent', patch: { result: `Two ways:\n\n${D}/pricing-hero.png\n\n${D}/plans-table.png` } }];
// The run that answered her note on the first, as its log reads.
const run = {
  startedAt,
  text: [
    '# the thread',
    '',
    `${at(1)}  [Read] ${D}/pricing-hero.png`,
    '#id t1',
    `${at(9)}  The next version, with the tighter gap under the headline:`,
    `${D}/pricing-hero-v2.png`,
    '',
    '# exited (0)',
  ].join('\n'),
};
const lines = withRunsSaid(ledger, [run]);
// Files numbers only what the row's history named.
const numbers = { [`${D}/pricing-hero.png`]: 1, [`${D}/plans-table.png`]: 1 };
const note = (id, file, v) => ({ id, file, v, place: { kind: 'whole' }, text: 'Less space under the headline', by: 'u-me', ts: startedAt + 60_000, mentions: [], wait: true });
const notes = [note('n1', 'pricing-hero.png', 1), note('n2', 'pricing-hero-v2.png', 2)];
// What a press on the note's line hands the big view (Focus.tsx openFileMark).
const fromTheLine = (n) => ({ file: n.file, note: n.id, at: 1 });
const landed = (families, file) => {
  const hit = whereAPressLands(families, { file });
  return hit ? families[hit.fi].versions[hit.vi] : null;
};

describe('a press on the line of a note on a version Files has not numbered', () => {
  const open = fromTheLine(notes[1]);
  const families = threadFiles(filesInLines(lines), numbers, { keep: pathsAPressKeeps(open, notes) });

  it('opens the picture the note is on', () => {
    expect(landed(families, 'pricing-hero-v2.png')?.path).toBe(`${D}/pricing-hero-v2.png`);
  });

  it('as the second version of its file', () => {
    const hero = families.find((f) => f.versions.some((v) => v.name === 'pricing-hero.png'));
    expect(hero.versions.map((v) => [v.name, v.n])).toEqual([['pricing-hero.png', 1], ['pricing-hero-v2.png', 2]]);
  });

  it('where keeping only what the press names lands nowhere', () => {
    expect(landed(threadFiles(filesInLines(lines), numbers, { keep: [] }), 'pricing-hero-v2.png')).toBeNull();
  });
});

describe('the other presses', () => {
  it('a note on the version Files numbered still opens that one', () => {
    const open = fromTheLine(notes[0]);
    const families = threadFiles(filesInLines(lines), numbers, { keep: pathsAPressKeeps(open, notes) });
    expect(landed(families, 'pricing-hero.png')?.path).toBe(`${D}/pricing-hero.png`);
  });

  it('before the log is read, the note opens its picture by name and follows it once the log names it', () => {
    const open = fromTheLine(notes[1]);
    const keep = pathsAPressKeeps(open, notes);
    // The big view asks for a noted file the lines do not name (ArtifactView `asks`).
    const early = threadFiles(withFilesAsked(filesInLines(ledger), ['pricing-hero-v2.png']), numbers, { keep });
    const first = landed(early, 'pricing-hero-v2.png');
    expect(first?.path).toBe('pricing-hero-v2.png');
    const later = threadFiles(filesInLines(lines), numbers, { keep });
    const now = stillInHand(later, whereAPressLands(early, { file: first.id }), { id: first.id, path: first.path });
    expect(later[now.fi].versions[now.vi].path).toBe(`${D}/pricing-hero-v2.png`);
  });

  it('a press that names a path keeps only what it names', () => {
    expect(pathsAPressKeeps({ path: `${D}/pricing-hero.png`, steps: [`${D}/plans-table.png`] }, notes)).toEqual([`${D}/pricing-hero.png`, `${D}/plans-table.png`]);
  });

  it('a note on the second file of one name keeps that name', () => {
    expect(pathsAPressKeeps({ note: 'n3' }, [note('n3', 'pricing-hero.png#2', 1)])).toEqual(['pricing-hero.png']);
  });
});

describe('never another file', () => {
  it('a note on a version nobody numbered or named opens that name, not the versions beside it', () => {
    const lost = note('n9', 'pricing-hero-v7.png', 7);
    const keep = pathsAPressKeeps(fromTheLine(lost), [lost]);
    const families = threadFiles(withFilesAsked(filesInLines(lines), ['pricing-hero-v7.png']), numbers, { keep });
    expect(landed(families, 'pricing-hero-v7.png')?.path).toBe('pricing-hero-v7.png');
  });

  it('a note the thread does not hold keeps nothing beyond the press', () => {
    expect(pathsAPressKeeps({ note: 'gone', file: 'x.png' }, notes)).toEqual([]);
  });
});

describe('the wiring', () => {
  it('the big view keeps what the press and its note name', () => {
    expect(read('renderer/src/components/ArtifactView.tsx')).toMatch(/const kept = useMemo\(\(\) => pathsAPressKeeps\(open, given\.notes\)/);
  });
});

// The real big view in Chromium, handed what ThreadArtifacts hands it for this thread.
let browser;
const opened = async (withLog) => {
  const props = {
    lines: withLog ? lines : ledger,
    numbers,
    marks: { notes: [notes[1]], approvals: [], seen: {} },
    open: fromTheLine(notes[1]),
  };
  const bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ArtifactView } from './renderer/src/components/ArtifactView';
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      const p = ${JSON.stringify(props)};
      createRoot(document.getElementById('root')).render(
        <ArtifactView product="p" thread="t" lines={p.lines} numbers={p.numbers} marks={p.marks} me="u-me" people={[]}
          open={p.open} ownerOfRow="u-me" withAgent write={async () => ({ ok: true })} onClose={() => {}}
          files={{ find: async (f) => f, readText: async () => null }} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://view.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://view.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('.av-stage').waitFor();
  return page;
};

describe.skipIf(!browserAvailable)('in the big view, pressed from the note\'s line', () => {
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it('shows the note\'s version, not "Opening This file…"', async () => {
    const page = await opened(true);
    await expect.poll(() => page.locator('.av-of').textContent()).toBe('v2 of 2');
    expect(await page.getByText('Opening This file').count()).toBe(0);
    await page.close();
  }, 30_000);

  it('does so before the run\'s log is read, too', async () => {
    const page = await opened(false);
    await expect.poll(() => page.locator('.av-of').textContent()).toBe('v2 of 2');
    expect(await page.getByText('Opening This file').count()).toBe(0);
    await page.close();
  }, 30_000);
});
