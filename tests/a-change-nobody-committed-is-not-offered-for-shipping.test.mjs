// "SHIP IT (RECOMMENDED)" WAS OFFERED ON WORK THAT WAS NEVER COMMITTED, AND
// ON WORK THAT HAD JUST BEEN THROWN AWAY.
//
// Two findings off the Linux QA box, Oct 26 2026 (F-79 and F-83 on
// w-ba5540ff74). A thread whose `git commit` approval went unanswered finished
// saying "Changes remain uncommitted", and under that sentence the app offered
// "1 Ship it (recommended)". `git log` on its branch held only the initial
// commit. A second thread was sent "Discard the change", came back saying "The
// working tree is clean", and offered "1 Ship it (recommended)" again.
//
// Both came from the same hole: the app's own offer was made off the saved
// change alone, which says what a run touched and never said whether any of it
// reached a commit. So the folder is read when the run ends, and the two facts
// it answers — a commit this branch holds that main does not, and anything
// still loose in the tree — are saved with the change and decide the offer.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotRepo, changeFromRepo, whereTheWorkStands } from '../main/git-change.mjs';
import { writeChangeForRun, changeFromTranscript, standsAcross } from '../main/code-change.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { changePath } from '../main/code-change.mjs';
import {
  COMMIT_FIRST_OFFER, NOT_COMMITTED_ASK, SHIP_ASK, SHIP_OFFER, shipOfferFor, standingFrom, UNREAD,
} from '../renderer/src/ship-offer.ts';
import { Name } from '../shared/product-name.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const run = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' });

describe('what the folder says a run left behind', () => {
  let dir;
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-stands-')));
    run(dir, 'git', ['init', '-q', '-b', 'main', '.']);
    run(dir, 'git', ['config', 'user.email', 'agent@agentbox.local']);
    run(dir, 'git', ['config', 'user.name', Name]);
    fs.writeFileSync(path.join(dir, 'strutils.py'), 'def reverse(s):\n    return s[::-1]\n');
    run(dir, 'git', ['add', '-A']);
    run(dir, 'git', ['commit', '-qm', 'base']);
    run(dir, 'git', ['checkout', '-q', '-b', 'agentbox/w-5b58a4d743']);
  });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  // The reported thread: the function and its test are written and pass, and
  // the commit never happened.
  it('says nothing is committed when the work is still loose in the tree', () => {
    fs.appendFileSync(path.join(dir, 'strutils.py'), '\ndef is_palindrome(s):\n    return True\n');
    expect(whereTheWorkStands(dir)).toEqual({ committed: false, uncommitted: true });
  });

  it('says the branch holds a commit of its own once one is made', () => {
    fs.appendFileSync(path.join(dir, 'strutils.py'), '\ndef is_palindrome(s):\n    return True\n');
    run(dir, 'git', ['commit', '-qam', 'palindrome']);
    expect(whereTheWorkStands(dir)).toEqual({ committed: true, uncommitted: false });
  });

  // The boundary on the other side of the reported one, and F-83 itself: the
  // change was discarded, so the tree is clean and the branch is where main is.
  it('says there is nothing at all after the change is thrown away', () => {
    fs.appendFileSync(path.join(dir, 'strutils.py'), '\ndef is_palindrome(s):\n    return True\n');
    run(dir, 'git', ['checkout', '-q', '--', '.']);
    expect(whereTheWorkStands(dir)).toEqual({ committed: false, uncommitted: false });
  });

  // A second round on the same thread commits nothing of its own; the first
  // round's commit is still sitting there unshipped, so this is about the
  // folder and never about the run.
  it('still says committed on a later run that committed nothing itself', () => {
    fs.appendFileSync(path.join(dir, 'strutils.py'), '\ndef is_palindrome(s):\n    return True\n');
    run(dir, 'git', ['commit', '-qam', 'palindrome']);
    const before = snapshotRepo(dir);
    expect(changeFromRepo(before).files).toHaveLength(0);
    expect(changeFromRepo(before).stands).toEqual({ committed: true, uncommitted: false });
  });

  // Where it cannot be read honestly it says so, and null is what makes the
  // offer fall back to the one it made before any of this existed.
  it('answers nothing it cannot read', () => {
    expect(whereTheWorkStands(null)).toEqual({ committed: null, uncommitted: null });
    expect(whereTheWorkStands(path.join(dir, 'gone'))).toEqual({ committed: null, uncommitted: null });
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-plain-'));
    try { expect(whereTheWorkStands(plain)).toEqual({ committed: null, uncommitted: null }); }
    finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });

  // A checkout sitting on the default branch has nothing to be ahead of, so
  // "committed" has no answer there and must not be guessed as no.
  it('does not answer for a checkout on the default branch itself', () => {
    run(dir, 'git', ['checkout', '-q', 'main']);
    fs.appendFileSync(path.join(dir, 'strutils.py'), '# a line\n');
    expect(whereTheWorkStands(dir)).toEqual({ committed: null, uncommitted: true });
  });

  it('reads one answer out of every checkout a run touched', () => {
    expect(standsAcross([])).toEqual({ committed: null, uncommitted: null });
    expect(standsAcross([{ stands: { committed: false, uncommitted: false } }, { stands: { committed: true, uncommitted: false } }]))
      .toEqual({ committed: true, uncommitted: false });
    expect(standsAcross([{ stands: { committed: null, uncommitted: null } }]))
      .toEqual({ committed: null, uncommitted: null });
  });
});

describe('the change saved for a thread carries it', () => {
  let dir;
  let docs;
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-saved-')));
    docs = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-docs-'));
    run(dir, 'git', ['init', '-q', '-b', 'main', '.']);
    run(dir, 'git', ['config', 'user.email', 'agent@agentbox.local']);
    run(dir, 'git', ['config', 'user.name', Name]);
    fs.writeFileSync(path.join(dir, 'strutils.py'), 'def reverse(s):\n    return s[::-1]\n');
    run(dir, 'git', ['add', '-A']);
    run(dir, 'git', ['commit', '-qm', 'base']);
    run(dir, 'git', ['checkout', '-q', '-b', 'agentbox/w-5b58a4d743']);
  });
  afterEach(() => {
    for (const d of [dir, docs]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  });

  const saved = () => JSON.parse(fs.readFileSync(machineryPath(docs, changePath('w-5b58a4d743')), 'utf8'));
  const endRun = (before) => writeChangeForRun({
    transcript: path.join(dir, 'no-such-session.jsonl'),
    docsDir: docs,
    itemId: 'w-5b58a4d743',
    roots: [dir],
    repos: [changeFromRepo(before)],
  });

  it('writes down that the change was never committed', () => {
    const before = snapshotRepo(dir);
    fs.appendFileSync(path.join(dir, 'strutils.py'), '\ndef is_palindrome(s):\n    return True\n');
    expect(endRun(before)).toBeTruthy();
    expect(saved().committed).toBe(false);
    expect(saved().uncommitted).toBe(true);
  });

  // The run that answers "Discard the change" writes a change of its own —
  // the work coming back out — and that one says the folder is empty.
  it('writes down that there is nothing left once it is discarded', () => {
    const first = snapshotRepo(dir);
    fs.appendFileSync(path.join(dir, 'strutils.py'), '\ndef is_palindrome(s):\n    return True\n');
    endRun(first);
    const second = snapshotRepo(dir);
    run(dir, 'git', ['checkout', '-q', '--', '.']);
    endRun(second);
    expect(saved().committed).toBe(false);
    expect(saved().uncommitted).toBe(false);
  });

  // A RUN THAT CHANGED NOTHING STILL MOVES THE GROUND UNDER THE LAST ONE. It
  // writes no change of its own, so without this the offer would go on
  // answering the question the earlier run left.
  it('corrects the saved change when a later run commits the work', () => {
    const first = snapshotRepo(dir);
    fs.appendFileSync(path.join(dir, 'strutils.py'), '\ndef is_palindrome(s):\n    return True\n');
    endRun(first);
    expect(saved().committed).toBe(false);
    const second = snapshotRepo(dir);
    run(dir, 'git', ['commit', '-qam', 'palindrome']);
    expect(endRun(second)).toBe(null);
    expect(saved().committed).toBe(true);
    expect(saved().uncommitted).toBe(false);
    // And the change itself is untouched: she can still read what was done.
    expect(saved().files).toHaveLength(1);
  });

  // A product with no repository has nothing here to read, and that is most of
  // them. Its change says neither thing and the offer is the one it always was.
  it('says neither thing for a run with no checkout to read', () => {
    const out = writeChangeForRun({
      transcript: path.join(dir, 'no-such-session.jsonl'),
      docsDir: docs,
      itemId: 'w-5b58a4d743',
      roots: ['/repo'],
      change: changeFromTranscript(JSON.stringify({
        type: 'assistant',
        timestamp: '2026-10-26T08:00:00Z',
        message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/repo/notes.md', content: 'one\n' } }] },
      }), { roots: ['/repo'] }),
    });
    expect(out).toBeTruthy();
    expect(saved().committed).toBe(null);
    expect(saved().uncommitted).toBe(null);
  });
});

describe('the offer the app makes off it', () => {
  // A third fact joined these two for F-139, and it is read the same way
  // (tests/the-first-commit-is-not-offered-before-git-knows-who-you-are).
  it('reads the two facts off a saved change, and nothing else as either', () => {
    expect(standingFrom({ committed: true, uncommitted: false }))
      .toEqual({ committed: true, uncommitted: false, knowsYou: null });
    expect(standingFrom({})).toEqual(UNREAD);
    expect(standingFrom(null)).toEqual(UNREAD);
    expect(standingFrom({ committed: 'yes' })).toEqual(UNREAD);
  });

  it('offers shipping when the branch holds a commit nothing has shipped', () => {
    const offer = shipOfferFor({ committed: true, uncommitted: false });
    expect(offer?.ask).toBe(SHIP_ASK);
    expect(offer?.options).toBe(SHIP_OFFER);
    expect(SHIP_OFFER.map((o) => o.text)).toEqual(['Ship it', 'Discard the change']);
    // A run that ended on "Ship the conversion and test?" would have carried
    // "Ship this change?" under it, which is the same question twice.
    expect(offer?.headed).toBe(false);
  });

  // F-79. The recommended press on work that was never committed is now the
  // one that commits it, and the sentence over it says why.
  it('offers to commit first when nothing is committed', () => {
    const offer = shipOfferFor({ committed: false, uncommitted: true });
    expect(offer?.ask).toBe(NOT_COMMITTED_ASK);
    expect(NOT_COMMITTED_ASK).toBe('This change was never committed.');
    expect(offer?.options.map((o) => o.text)).toEqual(['Commit it and ship', 'Discard the change']);
    expect(offer?.options.filter((o) => o.recommended).map((o) => o.n)).toEqual([1]);
    expect(COMMIT_FIRST_OFFER.map((o) => o.n)).toEqual([1, 2]);
    // And the sentence is drawn, because nothing on the page says it.
    expect(offer?.headed).toBe(true);
  });

  // F-83. Nothing committed and nothing loose: the work is gone, and there is
  // no question left to ask about it.
  it('offers nothing at all once the change has been discarded', () => {
    expect(shipOfferFor({ committed: false, uncommitted: false })).toBe(null);
  });

  // Unchanged where the folder could not be read, which is every product with
  // no repository and every run whose checkout has already been let go.
  it('offers shipping as it always did where the folder could not be read', () => {
    expect(shipOfferFor(UNREAD)?.options).toBe(SHIP_OFFER);
    expect(shipOfferFor({ committed: null, uncommitted: true })?.options).toBe(SHIP_OFFER);
  });
});

// AND THE DIFF SAID NOTHING EITHER (the second half of F-79). "View code
// changes shows the same layout as a committed thread, with nothing saying the
// change is uncommitted", so there was no way to tell from the diff whether a
// press would ship a commit or loose edits.
describe('the change pane says it too', () => {
  it('marks a change that never reached a commit, and marks nothing else', async () => {
    const { standingLabel } = await import('../renderer/src/code-artifact.ts');
    expect(standingLabel({ files: [], plus: 0, minus: 0, committed: false, uncommitted: true })).toBe('not committed');
    expect(standingLabel({ files: [], plus: 0, minus: 0, committed: true, uncommitted: false })).toBe('');
    expect(standingLabel({ files: [], plus: 0, minus: 0 })).toBe('');
  });
});

describe('where the app draws it', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  const app = read('renderer/src/App.tsx');

  it('reads the standing out of the same file it reads the figures from', () => {
    expect(focus).toContain('setStanding(r?.ok ? standingFrom(r.change) : UNREAD)');
    expect(focus).toContain('const shipAsk = shipOfferLive(item, { change: !!figures, running: !!session || !!agent }) ? shipOfferFor(standing) : null;');
  });

  it('draws the offer that fits what the folder holds, not one fixed pair', () => {
    expect(focus).toContain('const options = showOptions ? itemOptions(item) : shipAsk ? shipAsk.options : [];');
    expect(focus).toContain('const ask = shipAsk ? shipAsk.ask : askLine;');
  });

  // The keys answer what the page drew. A number that answered SHIP_OFFER
  // while the page drew "Commit it and ship" would send the wrong sentence.
  // One at a time draws the strip with no heading, because the agent's
  // question is the page's own headline. The app's question is written nowhere
  // on the page, and under that rule it was drawn nowhere either.
  it('keeps the strip\'s heading when the app is the one asking', () => {
    expect(focus).toContain('bare={!shipAsk?.headed}');
  });

  it('answers with the options the page reported, not with a constant', () => {
    expect(app).toContain(': openShows?.ship && openShows.key === keyOf(item) ? openShows.ship : []');
  });

  it('says in the change itself that it was never committed', () => {
    const artifact = read('renderer/src/components/CodeArtifact.tsx');
    expect(artifact).toContain('{stands && <span className="code-tree-stands">{stands}</span>}');
  });
});
