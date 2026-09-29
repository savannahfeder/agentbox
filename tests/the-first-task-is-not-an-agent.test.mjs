// THE WALK'S FIRST TASK, WHICH LOOKS LIKE A REAL TASK AND IS NOT ONE.
//
// The walk's first task must answer at once, without starting an agent.
//
// The problem it answers was measured on a real row. A first task
// was created at 10:12:16, started at 10:12:29 after thirteen seconds queued
// behind the directive the walk itself had composed eight seconds earlier, and
// answered at 10:13:15: 59.6 seconds under a sentence promising a few. At
// fifteen seconds the sentence said it was still reading while the row said
// queued, and it was not reading, because it had not started.
//
// So the row is real down to the ledger and the result, and the answer is read
// out of the folder chosen two screens earlier. Four things hold that here: the
// line the reading picks, the mark that keeps a session off the row, the words
// on screen, and the wiring, which a pure test cannot see.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  MAX_LINE, clip, firstRunAnswer, fromDescription, fromReadme, plainText,
} from '../shared/first-run-line.mjs';
import { answerFor, countFolder, describeFor, readDescription, readReadme } from '../main/first-run.mjs';
import { howLongAgo, mainLanguage, projectSentence } from '../shared/first-run-shape.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { ANSWER_AFTER_MS, FIRST_RUN_LABEL, coach, walkRows } from '../renderer/src/onboarding.ts';
import { NAME, Name } from '../shared/product-name.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const mainSrc = (...p) => fs.readFileSync(path.join(here, '..', 'main', ...p), 'utf8');

describe('the line it reads out of a readme', () => {
  it('takes the first sentence of prose, not the heading, which is the name', () => {
    // The heading is the project's name, which the user typed on the screen
    // before this one. Answering with it would be answering with their own input.
    expect(fromReadme(`# ${NAME}\n\nAn inbox for your Claude Code agents.\n`))
      .toBe('An inbox for your Claude Code agents.');
  });

  it('walks past the badges every readme opens with', () => {
    const readme = [
      '# kestrel',
      '',
      '[![build](https://img.shields.io/x.svg)](https://ci/x) [![npm](https://img.shields.io/y.svg)](https://npm/y)',
      '',
      'Collectible card games, made beautiful.',
    ].join('\n');
    expect(fromReadme(readme)).toBe('Collectible card games, made beautiful.');
  });

  it('walks past rules, lists, tables, quotes and html', () => {
    const readme = [
      '<!-- a generated file -->',
      '<div align="center">',
      '---',
      '- a bullet is not a description',
      '1. and neither is a step',
      '| a | table |',
      '> or a quote',
      'Strength programming for busy people.',
    ].join('\n');
    expect(fromReadme(readme)).toBe('Strength programming for busy people.');
  });

  it('does not read code out of a fenced block', () => {
    const readme = '# thing\n\n```sh\nnpm install thing\n```\n\nA small tool for a small job.\n';
    expect(fromReadme(readme)).toBe('A small tool for a small job.');
  });

  it('leaves markdown behind and keeps the words', () => {
    expect(plainText('A **bold** thing with a [link](http://x) and `code`.'))
      .toBe('A bold thing with a link and code.');
  });

  it('refuses a one word line, which is a label rather than a description', () => {
    expect(fromReadme('# thing\n\nInstall\n')).toBe(null);
  });

  it('answers null on a readme that is only headings', () => {
    expect(fromReadme('# thing\n\n## install\n\n### notes\n')).toBe(null);
    expect(fromReadme('')).toBe(null);
    expect(fromReadme(null)).toBe(null);
  });

  it('falls back to the one field a manifest has for saying what a thing is', () => {
    expect(fromDescription('Employee onboarding that runs itself'))
      .toBe('Employee onboarding that runs itself');
    expect(fromDescription('')).toBe(null);
    expect(fromDescription(undefined)).toBe(null);
  });

  it('clips a paragraph to one sentence rather than to a word count', () => {
    const long = 'A short first sentence about the thing. ' + 'And then a very much longer second one that runs on and on past every budget this file has. '.repeat(3);
    const out = clip(long);
    expect(out.length).toBeLessThanOrEqual(MAX_LINE);
    expect(out).toBe('A short first sentence about the thing.');
  });

  it('never cuts a word in half when there is no sentence end to cut at', () => {
    const out = clip('word '.repeat(80));
    expect(out.length).toBeLessThanOrEqual(MAX_LINE + 1);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe('the pre-written answer, which is what the task actually answers with', () => {
  // The sentence is ours and every number in it is theirs, so it is true about
  // any folder and says nothing about what the project IS.
  const now = Date.UTC(2026, 7, 21, 18, 0, 0);

  it('says how much is there, what it is written in, and when it changed', () => {
    expect(projectSentence({
      name: 'Zero', files: 944, dirs: 146, ext: { '.mjs': 400, '.ts': 300 }, lastCommit: '2 minutes ago',
    }, now)).toBe('Zero is 944 files across 146 folders, mostly JavaScript, and its last commit was 2 minutes ago.');
  });

  it('falls back to the newest file when the folder is not a repo', () => {
    expect(projectSentence({
      name: 'Refactor', files: 35, dirs: 17, ext: { '.swift': 30 },
      lastCommit: null, newest: now - 9 * 86_400_000,
    }, now)).toBe('Refactor is 35 files across 17 folders, mostly Swift, and it was last touched 9 days ago.');
  });

  it('counts one thing as one file, not one files', () => {
    expect(projectSentence({ name: 'Manifesto', files: 1, dirs: 0, ext: { '.md': 1 }, newest: now }, now))
      .toBe('Manifesto is 1 file, mostly Markdown, and it was last touched today.');
  });

  it('names no language rather than the wrong one', () => {
    expect(mainLanguage({ '.wat': 40, '.xyz': 2 })).toBe(null);
    expect(projectSentence({ name: 'Thing', files: 42, dirs: 4, ext: { '.wat': 40 }, lastCommit: 'a week ago' }, now))
      .toBe('Thing is 42 files across 4 folders, and its last commit was a week ago.');
  });

  it('has something true to say about an empty folder, which is the newest project of all', () => {
    expect(projectSentence({ name: 'Cascade', files: 0, dirs: 0, ext: {} }, now))
      .toBe(`Cascade is an empty folder. Everything you put in it from here shows up in ${NAME}.`);
  });

  it('speaks about time the way a person does', () => {
    expect(howLongAgo(now - 3_600_000, now)).toBe('today');
    expect(howLongAgo(now - 30 * 3_600_000, now)).toBe('yesterday');
    expect(howLongAgo(now - 5 * 86_400_000, now)).toBe('5 days ago');
    expect(howLongAgo(now - 30 * 86_400_000, now)).toBe('4 weeks ago');
    expect(howLongAgo(now - 200 * 86_400_000, now)).toBe('7 months ago');
    expect(howLongAgo(now - 800 * 86_400_000, now)).toBe('2 years ago');
  });

  it('never counts node_modules, which is the difference between 944 and 90,000', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-count-'));
    fs.writeFileSync(path.join(dir, 'a.ts'), 'x');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), 'x');
    fs.mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'x');
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'x');
    const out = countFolder(dir);
    expect(out.files).toBe(2);
    expect(out.dirs).toBe(1);
    expect(out.ext['.ts']).toBe(2);
  });

  it('is correct about a real folder that has no description anywhere in it', () => {
    // The exact case the readme version failed on, and there are ten of them in
    // ~/Desktop/dev.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-bare-'));
    fs.writeFileSync(path.join(dir, 'main.py'), 'print(1)\n');
    expect(answerFor({ folder: dir, name: 'Agent Poc' }))
      .toMatch(/^Agent Poc is 1 file, mostly Python, and it was last touched today\.$/);
  });

  it('answers rather than throwing on a folder that is not there', () => {
    expect(answerFor({ folder: '/no/such/folder/anywhere', name: 'Ghost' }))
      .toBe(`Ghost is an empty folder. Everything you put in it from here shows up in ${NAME}.`);
  });
});

describe('a folder with nothing written down in it', () => {
  it('says so, because this same line goes under the name in the sidebar', () => {
    const { line, found } = firstRunAnswer({
      readme: null, description: null, name: `${Name} v2`, folder: '~/Desktop/dev/agentbox-v2',
    });
    expect(found).toBe(false);
    expect(line).toBe(`${Name} v2 has no readme in ~/Desktop/dev/agentbox-v2, so there is nothing written down yet that says what it is.`);
  });

  it('reports found, so the caller knows whether it has a description to keep', () => {
    const { found } = firstRunAnswer({ readme: '# x\n\nA real description of it.', description: null, name: 'X', folder: '~/x' });
    expect(found).toBe(true);
  });
});

describe('reading a real folder off the disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-'));

  it('finds a readme whatever it is called', () => {
    fs.writeFileSync(path.join(dir, 'readme.md'), '# thing\n\nOne line about the thing.\n');
    expect(readReadme(dir)).toMatch('One line about the thing.');
    expect(describeFor({ folder: dir, name: 'Thing', shortFolder: '~/thing' }).line)
      .toBe('One line about the thing.');
  });

  it('falls back to package.json when there is no readme', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-'));
    fs.writeFileSync(path.join(bare, 'package.json'), JSON.stringify({ description: 'A tool for tools' }));
    expect(readDescription(bare)).toBe('A tool for tools');
    expect(describeFor({ folder: bare, name: 'Tool', shortFolder: '~/tool' }).line).toBe('A tool for tools');
  });

  it('answers rather than throwing on a folder that is not there', () => {
    const { line, found } = describeFor({ folder: '/no/such/folder/anywhere', name: 'Ghost', shortFolder: '~/ghost' });
    expect(found).toBe(false);
    expect(line).toMatch(/^Ghost has no readme/);
  });

  it('does not choke on a package.json that will not parse', () => {
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-'));
    fs.writeFileSync(path.join(broken, 'package.json'), '{ not json');
    expect(readDescription(broken)).toBe(null);
  });
});

describe('the supervisor, run for real against the walk s row', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-first-run-'));
  const now = Date.now();

  const WALK_ROW = {
    id: 'w-first', product: 'agentbox', status: 'open', kind: 'directive',
    title: 'Tell me what this project is, in one line.',
    labels: ['founder', FIRST_RUN_LABEL], createdAt: now, updatedAt: now,
  };
  const DIRECTIVE = {
    id: 'w-directive', product: 'agentbox', status: 'open', kind: 'directive',
    title: `Take ${NAME} from idea toward launch`,
    labels: ['founder'], createdAt: now, updatedAt: now,
  };

  function makeSupervisor(items) {
    const store = {
      listItems: () => items,
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: tmp }],
      isDue: (i, at = Date.now()) => !i?.runAt || i.runAt <= at,
    };
    const sup = new Supervisor({ storeRoot: tmp, maxConcurrentSessions: 3 }, store, tmp);
    sup.spawned = [];
    sup.spawnWorker = (item) => sup.spawned.push(item.id);
    sup.serveRepeats = async () => {};
    return sup;
  }

  it('never spawns a worker on the walk s own row', async () => {
    const sup = makeSupervisor([WALK_ROW]);
    await sup.tick();
    expect(sup.spawned).toEqual([]);
  });

  it('spawns on an ordinary row beside it, so the skip is the label and nothing else', async () => {
    const sup = makeSupervisor([WALK_ROW, DIRECTIVE]);
    await sup.tick();
    expect(sup.spawned).toEqual(['w-directive']);
  });

  it('holds everything back while the walk is up, and lets go when it ends', async () => {
    const sup = makeSupervisor([DIRECTIVE]);
    sup.firstRunWalking(true, now);
    expect(sup.firstRunHolding(now)).toBe(true);
    await sup.tick();
    expect(sup.spawned).toEqual([]);
    // Letting go ticks by itself: "everything arrives the moment the walk ends"
    // means the moment, not up to fifteen seconds later on the next poll.
    sup.firstRunWalking(false, now);
    expect(sup.firstRunHolding(now)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(sup.spawned).toEqual(['w-directive']);
  });

  it('lets the hold lapse on its own, so a window left open is not a Mac with no agents', async () => {
    const sup = makeSupervisor([DIRECTIVE]);
    sup.firstRunWalking(true, now);
    expect(sup.firstRunHolding(now + 19 * 60_000)).toBe(true);
    expect(sup.firstRunHolding(now + 21 * 60_000)).toBe(false);
  });

  it('never writes the hold to disk, so a crash mid-walk cannot leave it set', () => {
    const sup = makeSupervisor([DIRECTIVE]);
    sup.firstRunWalking(true, now);
    sup._saveState();
    const state = JSON.parse(fs.readFileSync(path.join(tmp, '.zero-supervisor.json'), 'utf8'));
    expect(JSON.stringify(state)).not.toMatch(/firstRun/i);
  });

  it('never advertises the row as queued, which is the word she read on her own', () => {
    const sup = makeSupervisor([WALK_ROW, DIRECTIVE]);
    expect(sup.status().queued).toEqual(['w-directive']);
  });

  it('still spawns on a REPLY of hers, because by then the walk is over', async () => {
    // The skip is on isFresh alone. A row she answers later is an ordinary task
    // in an ordinary inbox and gets an ordinary worker.
    const sup = makeSupervisor([{ ...WALK_ROW, answer: 'no, be more specific' }]);
    await sup.tick();
    expect(sup.spawned).toEqual(['w-first']);
  });
});

describe('what the sentence beside the row says', () => {
  it('names the thing that is running, in her words', () => {
    // IT IS TWO LINES FROM ROUND FOUR ON.
    expect(coach('working', 0)).toEqual({
      quiet: 'Your agent is running.',
      lead: 'It comes back in a few seconds.',
      key: null,
      tail: '',
    });
  });

  it('still has something to say if the answer somehow does not land', () => {
    expect(coach('working', 20_000).lead).toMatch(/^Still reading\./);
    expect(coach('working', 20_000).quiet).toBe('Your agent is running.');
  });

  it('promises a few seconds, and the walk waits about two', () => {
    expect(ANSWER_AFTER_MS).toBe(2_000);
  });
});

describe('the list while the walk is running', () => {
  const rows = [{ id: 'w-walk' }, { id: 'w-directive' }, { id: 'w-other' }];
  const run = (step, item) => ({ step, item, folder: null, name: '', product: 'agentbox', sentAt: null });

  it('holds one row, and it is the row being pointed at', () => {
    expect(walkRows(rows, run('working', 'w-walk'))).toEqual([{ id: 'w-walk' }]);
  });

  it('is empty before the task exists, because nothing has been introduced yet', () => {
    expect(walkRows(rows, run('command', null))).toEqual([]);
  });

  it('gives everything back the moment the walk ends', () => {
    expect(walkRows(rows, run('landed', 'w-walk'))).toEqual(rows);
    expect(walkRows(rows, null)).toEqual(rows);
  });
});

describe('the answer, written to a real store', () => {
  let store = null;
  let dir = null;
  let repo = null;

  beforeAll(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-first-run-store-'));
    const accountRoot = path.join(tmp, 'accounts', 'test-account');
    dir = path.join(accountRoot, 'agentbox-v2');
    repo = path.join(tmp, 'code');
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, 'README.md'), `# ${NAME} v2\n\nAn inbox for your Claude Code agents.\n`);
    fs.writeFileSync(path.join(repo, 'index.ts'), 'export const x = 1;\n');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'agentbox-v2', name: `${Name} v2`, repoPath: repo,
    }));
    const { Store } = await import('../main/store.mjs');
    store = await new Store({ storeRoot: tmp, accountId: 'test-account', accountRoot, products: [] }).init();
  });

  it('answers with the pre-written sentence and her folder s own numbers', () => {
    const made = store.composeItem('agentbox-v2', {
      title: 'Take a look at this project and tell me what is in it.',
      labels: [FIRST_RUN_LABEL],
    });
    expect(made.labels).toContain(FIRST_RUN_LABEL);

    const out = store.finishFirstRunTask('agentbox-v2', made.id);
    // Two real files were put in the folder above: a readme and one .ts.
    expect(out.line).toBe(`${Name} v2 is 2 files, mostly Markdown, and it was last touched today.`);
    expect(out.item.result).toBe(out.line);
    // Still open, the way an agent that answered and left the thread alive
    // leaves it. The walk's last step is her closing it herself.
    expect(out.item.status).toBe('open');
  });

  it('puts the readme s description under the project name in the sidebar', () => {
    expect(store.listProducts().find((p) => p.slug === 'agentbox-v2').oneLiner)
      .toBe('An inbox for your Claude Code agents.');
  });

  it('leaves the sidebar alone when there was nothing written down to find', () => {
    fs.rmSync(path.join(repo, 'README.md'));
    store.setOneLiner('agentbox-v2', '');
    const made = store.composeItem('agentbox-v2', { title: 'again', labels: [FIRST_RUN_LABEL] });
    const out = store.finishFirstRunTask('agentbox-v2', made.id);
    expect(out.oneLiner).toBe(null);
    // The task is still answered, which is the whole point: a folder with no
    // description in it is exactly the case the readme version failed on.
    expect(out.item.result.startsWith(`${Name} v2 is 1 file, mostly TypeScript`)).toBe(true);
    expect(store.listProducts().find((p) => p.slug === 'agentbox-v2').oneLiner).toBe('');
  });
});

describe('the wiring, which is the half a pure test cannot see', () => {
  const app = src('App.tsx');

  it('composes the example task with the mark on it', () => {
    expect(app).toMatch(/api\.compose\(firstRunTask \? \{ \.\.\.p, labels: \[FIRST_RUN_LABEL\] \} : p\)/);
  });

  it('says nothing about a queue and offers no undo on it', () => {
    const send = app.slice(app.indexOf('onSend={async (p) => {'));
    const branch = send.slice(send.indexOf('if (made?.id && firstRunTask)'), send.indexOf('if (made?.id) {'));
    expect(branch).not.toMatch(/showToast/);
    expect(branch).not.toMatch(/noteNewTask/);
    expect(branch).toMatch(/fire\(\{ t: 'sent'/);
  });

  it('writes the answer itself, after the wait', () => {
    expect(app).toMatch(/api\.firstRunAnswer\(\{ product, id \}\)/);
    expect(app).toMatch(/\}, ANSWER_AFTER_MS\);/);
  });

  it('draws the row as working while it does, since no supervisor can', () => {
    expect(app).toMatch(/const runningRows = useMemo\(/);
    expect(app).toMatch(/running=\{runningRows\}/);
  });

  it('holds the supervisor for as long as the walk is up, and lets go after', () => {
    const hold = app.slice(app.indexOf('const walking = !!run'), app.indexOf('const walking = !!run') + 320);
    expect(hold).toMatch(/api\.firstRunWalking\(true\)/);
    expect(hold).toMatch(/return \(\) => \{ api\.firstRunWalking\(false\); \};/);
  });

  it('keeps the found line under the project name in the sidebar, and only that', () => {
    const store = mainSrc('store.mjs');
    const fn = store.slice(store.indexOf('finishFirstRunTask('), store.indexOf('setOneLiner(slug, oneLiner)'));
    expect(fn).toMatch(/if \(described\.found\) this\.setOneLiner\(slug, described\.line\);/);
  });
});
