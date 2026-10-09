// NOTHING OF OURS LANDS IN THE FOLDER SHE UPLOADS FILES TO.
//
// Claude Code writes nothing into a working directory; its per-project state is
// at `~/.claude/projects/<encoded path>/`. Agentbox did the opposite, and on a
// product with no code repo registered the product folder IS the worker's
// working directory.
//
// So: the app's own records live in the app's own home, and this file is what
// says so. It pins three things.
//
//   1. After a product has been used, her folder holds her material and the two
//      files that describe it, and none of our bookkeeping.
//   2. A store that already has our files in it keeps every byte: they are
//      moved in on first read, not abandoned and not duplicated.
//   3. Two product folders never share one ledger, which the encoding alone
//      cannot promise.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';
import { appHome, encodeProjectPath, isMachineryDir, machineryDir, machineryPath } from '../main/store/home.mjs';
import * as workItems from '../main/store/work-items.mjs';
import { WAS, envNames, nameSlug } from '../shared/product-name.mjs';

let tmp;
let accountRoot;
const dirOf = (slug) => path.join(accountRoot, slug);

function makeProduct(slug, name = slug) {
  const dir = dirOf(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 2, id: slug, name }));
  return dir;
}

const newStore = async () => new Store({
  storeRoot: tmp, accountId: 'test-account', accountRoot, products: [],
}).init();

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-home-'));
  accountRoot = path.join(tmp, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('the home is the one Claude Code taught us', () => {
  // The setup file gives every test file its own throwaway home, which is also
  // the proof that the override exists at all.
  it('is the app home for a directory that has none yet', () => {
    const held = {};
    for (const key of envNames('HOME')) { held[key] = process.env[key]; delete process.env[key]; }
    try {
      // Linux keeps a fresh store in the XDG data directory. macOS keeps the
      // dot-folder. Neither answer is a visible folder of the app's name.
      const expected = process.platform === 'linux'
        ? path.join(tmp, '.local', 'share', nameSlug)
        : path.join(tmp, `.${nameSlug}`);
      expect(appHome(tmp)).toBe(expected);
    } finally {
      for (const [key, value] of Object.entries(held)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  // A STORE WRITTEN UNDER AN OLD NAME IS STILL HER STORE. The rename would
  // otherwise hand an existing install an empty home and lose the work item
  // ledger, the session traces and the run records for every project on it.
  it('keeps reading a dot-folder from an older name when that is the one on disk', () => {
    const held = {};
    for (const key of envNames('HOME')) { held[key] = process.env[key]; delete process.env[key]; }
    fs.mkdirSync(path.join(tmp, `.${WAS[1].toLowerCase()}`), { recursive: true });
    try {
      expect(appHome(tmp)).toBe(path.join(tmp, `.${WAS[1].toLowerCase()}`));
      // And the current name wins the moment it exists, so a fresh home is
      // never pulled backwards into an old one.
      fs.mkdirSync(path.join(tmp, `.${nameSlug}`), { recursive: true });
      expect(appHome(tmp)).toBe(path.join(tmp, `.${nameSlug}`));
    } finally {
      for (const [key, value] of Object.entries(held)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  // Checked against a real folder on a real Mac:
  // `/Users/you/Zero/accounts/00000000-.../agentbox` is on disk under
  // ~/.claude as `-Users-you-Zero-accounts-00000000-...-agentbox`.
  it('encodes a path the way Claude Code encodes one', () => {
    expect(encodeProjectPath('/Users/you/Zero/accounts/00000000-1111/agentbox'))
      .toBe('-Users-you-Zero-accounts-00000000-1111-agentbox');
    expect(encodeProjectPath('/tmp/a.b/c')).toBe('-tmp-a-b-c');
  });

  it('puts a product under <home>/projects/<encoded>', () => {
    const dir = makeProduct('acme');
    expect(machineryDir(dir)).toBe(path.join(process.env.ASTRAL_HOME, 'projects', encodeProjectPath(dir)));
  });

  // THE ONE THING THE ENCODING CANNOT PROMISE. `/a/b.c` and `/a/b/c` encode the
  // same string, and two products sharing one ledger would merge two inboxes
  // with nothing on screen saying so. The folder records the path it belongs to
  // and a stranger gets a hash suffix instead.
  it('never lets two different folders share one ledger', () => {
    const one = makeProduct('collide');
    const two = makeProduct('collide-two');
    // Stage the collision: the folder `two` would use is already claimed by
    // `one`, which is exactly what `/a/b.c` and `/a/b/c` would do on their own.
    const wanted = machineryDir(two);
    fs.mkdirSync(wanted, { recursive: true });
    fs.writeFileSync(path.join(wanted, '.origin'), `${one}\n`);

    const given = machineryDir(two);
    expect(given).not.toBe(wanted);
    expect(given.startsWith(`${wanted}-`)).toBe(true);
    // And `one` still gets the folder that says it is his.
    expect(machineryDir(one, process.env.ASTRAL_HOME)).toBe(machineryDir(one));
  });

  it('writes the origin marker so the folder says whose it is', () => {
    const dir = makeProduct('marked');
    const file = machineryPath(dir, 'work-items.jsonl');
    expect(fs.readFileSync(path.join(path.dirname(file), '.origin'), 'utf8').trim()).toBe(dir);
  });
});

describe('her folder after a product has really been used', () => {
  it('holds her material and none of our bookkeeping', async () => {
    const dir = makeProduct('acme', 'Acme');
    // Her own things, the way they arrive: a document and an upload.
    fs.writeFileSync(path.join(dir, 'STATE.md'), '# state\n');
    fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'attachments', 'her-file.png'), 'png');

    const store = await newStore();
    const row = store.composeItem('acme', { title: 'a row', body: 'text' });
    store.answerItem('acme', row.id, { answer: 'go on then' });
    store.composeRepeat('acme', { title: 'daily', body: 'run it', every: 'day', at: '08:00' });
    store.writePracticeTrace('acme', row.id, ['09:00:00  hello'], Date.now());

    const left = fs.readdirSync(dir).sort();
    expect(left).not.toContain('work-items.jsonl');
    expect(left).not.toContain('repeats.jsonl');
    expect(left).not.toContain('sessions');
    // What she keeps: her documents, and the file that says this is a product.
    expect(left).toContain('project.json');
    expect(left).toContain('STATE.md');
    expect(left).toContain('attachments');

    // And the row really is readable, from the new place.
    expect(store.listItems().find((i) => i.id === row.id).answer).toBe('go on then');
    expect(fs.existsSync(machineryPath(dir, 'work-items.jsonl'))).toBe(true);
  });

  it('keeps two products apart', async () => {
    makeProduct('one', 'One');
    makeProduct('two', 'Two');
    const store = await newStore();
    const a = store.composeItem('one', { title: 'in one', body: '' });
    const b = store.composeItem('two', { title: 'in two', body: '' });
    const ids = (slug) => store.modules.workItemsDisk.readWorkItems(dirOf(slug)).map((i) => i.id);
    expect(ids('one')).toEqual([a.id]);
    expect(ids('two')).toEqual([b.id]);
  });
});

describe('a store that already has our files in it', () => {
  it('moves the ledger in, whole, on the first read', () => {
    const dir = makeProduct('legacy');
    const lines = [
      { id: 'w-eac254ddb2', ts: 1, source: 'agent', patch: { title: 'first', status: 'open' } },
      { id: 'w-eac254ddb2', ts: 2, source: 'founder', patch: { answer: 'her words' } },
      { id: 'w-bc30207ef4', ts: 3, source: 'agent', patch: { title: 'second', status: 'done' } },
    ].map((l) => `${JSON.stringify(l)}\n`).join('');
    fs.writeFileSync(path.join(dir, 'work-items.jsonl'), lines);

    const items = workItems.readWorkItems(dir);

    // Both sides sorted: the claim is about which rows arrived, not about how
    // two made-up ids happen to collate against each other.
    expect(items.map((i) => i.id).sort()).toEqual(['w-eac254ddb2', 'w-bc30207ef4'].sort());
    expect(items.find((i) => i.id === 'w-eac254ddb2').answer).toBe('her words');
    // Moved, not copied: her folder is clean and not one byte was lost.
    expect(fs.existsSync(path.join(dir, 'work-items.jsonl'))).toBe(false);
    expect(fs.readFileSync(machineryPath(dir, 'work-items.jsonl'), 'utf8')).toBe(lines);
  });

  // ALL OF IT, ON THE FIRST TOUCH, NOT ONE FILE PER READER. Lazily, the ledger
  // moves when the inbox opens and a session trace moves only if somebody
  // reopens that row, which for most rows is never. Measured on her folder
  // 2026-08-26: 1,785 of the 1,830 files that leave are session traces, so a
  // per-reader migration would leave her looking at nearly all of it.
  it('takes every record of ours the first time it touches the product', () => {
    const dir = makeProduct('sweep');
    fs.writeFileSync(path.join(dir, 'work-items.jsonl'), '');
    fs.writeFileSync(path.join(dir, 'repeats.jsonl'), '');
    fs.mkdirSync(path.join(dir, 'sessions', 'w-86377d7fea'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'runs', '2026-01-01-run-a'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'pending-writes', 'w-86377d7fea'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'her-notes.md'), 'mine\n');

    // One touch of one of them.
    workItems.readWorkItems(dir);

    expect(fs.readdirSync(dir).sort()).toEqual(['her-notes.md', 'project.json']);
    expect(fs.readdirSync(machineryDir(dir)).sort())
      .toEqual(['.origin', 'pending-writes', 'repeats.jsonl', 'runs', 'sessions', 'work-items.jsonl']);
  });

  it('moves a whole directory of session traces in', () => {
    const dir = makeProduct('traces');
    const old = path.join(dir, 'sessions', 'w-a0c6494bb7');
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, '1700000000000.log'), '# a run\n');

    const moved = machineryPath(dir, path.join('sessions', 'w-a0c6494bb7'));

    expect(fs.readFileSync(path.join(moved, '1700000000000.log'), 'utf8')).toBe('# a run\n');
    expect(fs.existsSync(old)).toBe(false);
  });

  // A NEW LINE APPENDED AFTER THE MOVE GOES ON THE END OF THE OLD ONES, which
  // is the whole reason this is a move and not a read-both. An append-only log
  // in two halves is two stores that disagree.
  it('appends onto the history it moved rather than starting a new file', () => {
    const dir = makeProduct('append');
    fs.writeFileSync(path.join(dir, 'work-items.jsonl'),
      `${JSON.stringify({ id: 'w-2cf19f63dc', ts: 1, source: 'agent', patch: { title: 'old', status: 'open' } })}\n`);

    workItems.updateWorkItem(dir, 'w-2cf19f63dc', { note: 'new' }, { source: 'agent' });

    const text = fs.readFileSync(machineryPath(dir, 'work-items.jsonl'), 'utf8').trim().split('\n');
    expect(text).toHaveLength(2);
    expect(workItems.readWorkItem(dir, 'w-2cf19f63dc').title).toBe('old');
    expect(workItems.readWorkItem(dir, 'w-2cf19f63dc').note).toBe('new');
  });

  // The move is undone by moving the file back, which is what makes this safe
  // to ship: nothing is rewritten and nothing is deleted. THE STRAY IS NOT
  // IGNORED, THOUGH — see the block below. This used to assert that a file
  // dropped back into her folder was left there, which is exactly the gap was
  // filed about.
  it('never lets a stray overwrite the history that is already home', () => {
    const dir = makeProduct('idempotent');
    fs.writeFileSync(path.join(dir, 'work-items.jsonl'),
      `${JSON.stringify({ id: 'w-2ea7c17e0e', ts: 1, source: 'agent', patch: { title: 'x', status: 'open' } })}\n`);
    const first = fs.readFileSync(machineryPath(dir, 'work-items.jsonl'), 'utf8');
    fs.writeFileSync(path.join(dir, 'work-items.jsonl'), 'a later line\n');

    const now = fs.readFileSync(machineryPath(dir, 'work-items.jsonl'), 'utf8');

    expect(now.startsWith(first)).toBe(true);   // the history is untouched
    expect(now).toBe(`${first}a later line\n`); // and the stray is on the end of it
  });
});

// THE GAP THIS FILE DID NOT COVER.
//
// The move was written as one event: a sweep that ran once per process, and a
// per-path adoption that only fired when there was NOTHING at the new place.
// After the first move there always is something at the new place, so anything
// of ours that appeared in her folder afterwards was never picked up by
// anything, ever. It was not hypothetical. On a real store, hours after the
// move landed, the product folder held a `work-items.jsonl` carrying release
// lines that the real ledger never got, and run records under `runs/`.
//
// Everything below is about what happens the SECOND time, and after.
describe('one of our files that turns up in her folder later', () => {
  it('is carried across even though the first move is long done', () => {
    const dir = makeProduct('later');
    workItems.readWorkItems(dir); // the first move happens, and finds nothing

    fs.mkdirSync(path.join(dir, 'runs', 'w-86377d7fea'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runs', 'w-86377d7fea', 'the-change-it-made.change'), '{"item":"w-86377d7fea"}');

    machineryPath(dir, 'work-items.jsonl'); // any touch at all sweeps again

    expect(fs.existsSync(path.join(dir, 'runs'))).toBe(false);
    expect(fs.readFileSync(machineryPath(dir, path.join('runs', 'w-86377d7fea', 'the-change-it-made.change')), 'utf8'))
      .toBe('{"item":"w-86377d7fea"}');
  });

  // THE LINES ARE THE POINT, not the file. A stray ledger holds writes the real
  // one never saw, so it is appended, and the two cards in it become readable.
  it('folds a stray ledger onto the end of the real one, losing no line', () => {
    const dir = makeProduct('folded');
    const real = `${JSON.stringify({ id: 'w-eac254ddb2', ts: 1, source: 'agent', patch: { title: 'first', status: 'open' } })}\n`;
    fs.writeFileSync(path.join(dir, 'work-items.jsonl'), real);
    workItems.readWorkItems(dir);

    // An old process, still pointed at her folder, writes two more lines there.
    const strayLines = [
      { id: 'w-eac254ddb2', ts: 2, source: 'founder', patch: { answer: 'her words' } },
      { id: 'w-bc30207ef4', ts: 3, source: 'agent', patch: { title: 'second', status: 'open' } },
    ].map((l) => `${JSON.stringify(l)}\n`).join('');
    fs.writeFileSync(path.join(dir, 'work-items.jsonl'), strayLines);

    const items = workItems.readWorkItems(dir);

    expect(fs.existsSync(path.join(dir, 'work-items.jsonl'))).toBe(false);
    expect(fs.readFileSync(machineryPath(dir, 'work-items.jsonl'), 'utf8')).toBe(real + strayLines);
    // Both sides sorted: the claim is about which rows arrived, not about how
    // two made-up ids happen to collate against each other.
    expect(items.map((i) => i.id).sort()).toEqual(['w-eac254ddb2', 'w-bc30207ef4'].sort());
    expect(items.find((i) => i.id === 'w-eac254ddb2').answer).toBe('her words');
  });

  // A directory is merged, not swapped. The run record that is only in her
  // folder comes across; the one that is only at home is not disturbed.
  it('merges a directory rather than choosing one side of it', () => {
    const dir = makeProduct('merged');
    fs.mkdirSync(path.join(dir, 'runs', 'w-oldoldold1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runs', 'w-oldoldold1', 'the-change-it-made.change'), 'already home');
    machineryPath(dir, 'runs');

    fs.mkdirSync(path.join(dir, 'runs', 'w-strandedxx'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runs', 'w-strandedxx', 'the-change-it-made.change'), 'came later');

    machineryPath(dir, 'work-items.jsonl');

    const home = machineryDir(dir);
    expect(fs.readdirSync(path.join(home, 'runs')).sort()).toEqual(['w-oldoldold1', 'w-strandedxx']);
    expect(fs.readFileSync(path.join(home, 'runs', 'w-oldoldold1', 'the-change-it-made.change'), 'utf8')).toBe('already home');
    expect(fs.readFileSync(path.join(home, 'runs', 'w-strandedxx', 'the-change-it-made.change'), 'utf8')).toBe('came later');
    expect(fs.existsSync(path.join(dir, 'runs'))).toBe(false);
  });

  // THE CASE THE SESSION BEFORE THIS ONE REFUSED TO TOUCH BY HAND, and it was
  // right to: two run records for the same card, one in each place. Neither is
  // deleted. The newer takes the name and the older keeps its bytes beside it.
  it('keeps both when the same run record exists in both places', () => {
    const dir = makeProduct('conflict');
    const rel = path.join('runs', 'w-a0c6494bb7', 'the-change-it-made.change');
    const home = machineryPath(dir, rel);
    fs.mkdirSync(path.dirname(home), { recursive: true });
    fs.writeFileSync(home, 'the finished run');
    fs.utimesSync(home, new Date(1_000_000), new Date(1_000_000));

    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), 'the newer run');
    fs.utimesSync(path.join(dir, rel), new Date(2_000_000), new Date(2_000_000));

    machineryPath(dir, 'work-items.jsonl');

    expect(fs.readFileSync(home, 'utf8')).toBe('the newer run');
    const beside = fs.readdirSync(path.dirname(home)).filter((n) => n.includes('superseded'));
    expect(beside).toHaveLength(1);
    expect(fs.readFileSync(path.join(path.dirname(home), beside[0]), 'utf8')).toBe('the finished run');
    expect(fs.existsSync(path.join(dir, 'runs'))).toBe(false);
  });
});

// THE MOVE IS ONLY HALF DONE IF OUR OWN INSTRUCTIONS STILL POINT AT THE OLD
// PLACE, so the workers' instructions were fixed too.
//
// The writing rules told every product's workers that a title rewrite is "one
// line appended to the product's work-items.jsonl". After the move there is no
// such file, so a session that went hunting found the one beside the ACCOUNT
// folder, left from the era of one ledger per account. Nothing reads that file
// and nothing sweeps it. Within hours of the move, workers were appending title
// and body rewrites to it. Those workers happened to write the real ledger too,
// so no card was wrong; a worker that wrote only the dead one would have lost
// the rewrite and seen no error.
//
// So this pins the sentence rather than the behaviour. A brief is code here: it
// is the only thing standing between a session and the wrong file.
describe('the instructions sessions read point at the real ledger', () => {
  const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const brief = () => fs.readFileSync(path.join(REPO, 'briefs', 'writing-rules.md'), 'utf8');

  it('never sends a session to a ledger inside the product folder', () => {
    expect(brief()).not.toMatch(/product's `?work-items\.jsonl/);
  });

  it('says where the ledger actually is, in enough detail to find it', () => {
    const text = brief();
    expect(text).toContain('$ASTRAL_HOME/projects/');
    expect(text).toContain('work-items.jsonl');
    // and the trap it costs a session an hour to walk into
    expect(text).toContain('ACCOUNT folder');
  });
});

// HANDING THE MACHINERY BACK IN AS A PRODUCT FOLDER EMPTIED HER INBOX.
//
// 2026-09-23, 15:31:26, and every number here is off her own disk. A session
// wanted to count rows across every product, so it listed `<home>/projects` and
// passed each directory to `readWorkItems` as the product folder. Each of those
// IS the machinery, so each got a machinery directory of its own nested inside
// the home, and the sweep carried the ledger, the traces, the runs, the repeat
// rules and the parked writes down into it. Thirty eight products in two
// seconds. Her inbox read empty for twenty seven minutes.
//
// The session was doing the safe thing: it was READING. So the refusal belongs
// in the path helper rather than in anybody's good intentions, and this is what
// says so.
describe('a machinery directory handed back in is not a new product', () => {
  it('reads the ledger that is already there, and moves nothing', () => {
    const dir = makeProduct('rewind');
    const home = appHome();

    // A product in ordinary use: a ledger and a session trace, both already
    // carried into the home the way the first read does it.
    const ledger = machineryPath(dir, 'work-items.jsonl');
    fs.writeFileSync(ledger, '{"id":"w-1"}\n');
    const trace = machineryPath(dir, path.join('sessions', 'w-1'));
    fs.mkdirSync(trace, { recursive: true });
    fs.writeFileSync(path.join(trace, 'log.txt'), 'a real run');

    const machinery = machineryDir(dir);
    const before = fs.readdirSync(path.join(home, 'projects')).sort();

    // The mistake, exactly as it was made.
    const asked = machineryPath(machinery, 'work-items.jsonl');

    expect(asked).toBe(ledger);
    expect(fs.readFileSync(ledger, 'utf8')).toBe('{"id":"w-1"}\n');
    expect(fs.readFileSync(path.join(trace, 'log.txt'), 'utf8')).toBe('a real run');
    // No second directory, and the marker still names the product rather than
    // itself.
    expect(fs.readdirSync(path.join(home, 'projects')).sort()).toEqual(before);
    expect(fs.readFileSync(path.join(machinery, '.origin'), 'utf8').trim()).toBe(path.resolve(dir));
  });

  it('knows which directories are its own', () => {
    const home = appHome();
    expect(isMachineryDir(machineryDir(makeProduct('mine')))).toBe(true);
    expect(isMachineryDir(dirOf('mine'))).toBe(false);
    expect(isMachineryDir(path.join(home, 'projects'))).toBe(false);
  });
});
