// FIVE OF SIX SESSIONS RACING FOR ONE FOLDER GOT A RAW GIT ERROR (w-36c51443df).
//
// MEASURED 2026-10-09, git 2.39.5, six separate processes calling
// `ensureTaskFolder` for the SAME item id at once. Exactly one won, which is
// correct. The five losers THREW:
//
//   Could not make a folder for w-same: Preparing worktree (checking out 'agentbox/w-same')
//   fatal: '.../.claude/worktrees/.building-w-same' already exists
//
// rather than the refusal main/task-folders.mjs documents for exactly this case:
// "building -- another live process is part way through making it".
//
// WHY THE DOCUMENTED PATH WAS UNREACHABLE. `clearUnfinished` produces `building`
// only when the staging folder is already REGISTERED AND LOCKED by a live pid.
// The window is between it answering "nothing there" and `git worktree add`
// registering staging: every process gets past the check, and then git's own
// "already exists" wins before there is a lock for anyone to see. So the reason
// existed, was tested, and could not fire in the one situation it was written
// for -- which is the worst shape a guard can have, because the test passing
// says nothing.
//
// IT WAS ALREADY SAFE, AND THAT IS WHY THIS IS NOT A CRASH FIX. The throw reaches
// `_couldNotGetAFolder`, the row is told in plain words and waits, and there is
// no fall-back to the shared checkout. What was wrong is the WORDING: a git
// fatal about a path nobody recognises, where "another session is building this
// folder, it will be along in a moment" is both true and actionable.
//
// AND THE SAME SHAPE AGAIN ON THE OTHER HALF OF THE QUESTION, 2026-10-19. This
// file turned main red on GitHub with "expected [ 'building', 'held', 'locked' ]
// to include 'refused'": a loser's refusal reached the row as "its folder is
// refused", which is not a word anybody can act on. The guard above reads a
// failed `worktree add`; `whoEndedUpInTheLock` now reads the LOCK the same way,
// because the race does not end at the add. Reproduced here by racing twenty
// processes for one id instead of six -- once in about 250 racers -- and gone
// across 960 racers after the fix.
//
// RE-MEASURED 2026-10-17 ON A BUSY MACHINE, which showed two things one run at
// a time never did. Git has a fifth wording, and on a slow enough loser the
// winner has already FINISHED -- the folder is at its own path and nobody is
// building anything, so "building" is the wrong word and asking again is the
// right move. Both are in main/task-folders.mjs now, and the guard no longer
// calls a branch checked out in somebody's finished work a race.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, fork } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureTaskFolder, buildingFolderPath, taskFolderPath, somebodyIsBuilding, whoEndedUpInTheLock,
} from '../main/task-folders.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-race-'));
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  git(dir, 'config', 'user.email', 'qa@example.com');
  git(dir, 'config', 'user.name', 'QA');
  fs.writeFileSync(path.join(dir, 'README.md'), '# qa\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/* ===== the classifier, which is the whole of the fix and is decidable ===== */

describe('reading a failed `worktree add` for what it actually means', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  // The two wordings git uses when something is already at the path. Taken from
  // the measured run and from `git worktree add` on a path it already knows.
  it('calls it building when git says the staging path already exists', () => {
    const staging = buildingFolderPath(dir, 'w-x');
    const out = `Preparing worktree (checking out 'agentbox/w-x')\nfatal: '${staging}' already exists`;
    expect(somebodyIsBuilding(out)).toBe(true);
  });

  it('calls it building when git says the staging path is already registered', () => {
    expect(somebodyIsBuilding(`fatal: '${buildingFolderPath(dir, 'w-x')}' is already registered`)).toBe(true);
  });

  // THE OTHER TWO WORDINGS, FOUND BY RUNNING THE RACE FIVE TIMES rather than
  // once. The winner's `worktree add -b` checks the branch out into its staging
  // copy, so a loser's attach is refused about the BRANCH instead of the path.
  // The first measurement only ever showed `already exists`, which is exactly
  // how a one-phrase guard would have shipped half-working.
  it('calls it building when the branch is already checked out somewhere', () => {
    expect(somebodyIsBuilding(`Preparing worktree (checking out 'agentbox/w-x')\nfatal: 'agentbox/w-x' is already checked out at '${buildingFolderPath(dir, 'w-x')}'`)).toBe(true);
  });

  it('calls it building when the branch is already used by another worktree', () => {
    expect(somebodyIsBuilding(`fatal: 'agentbox/w-x' is already used by worktree at '${buildingFolderPath(dir, 'w-x')}'`)).toBe(true);
  });

  // A FIFTH WORDING, AND IT TOOK A BUSY MACHINE TO SHOW IT. Measured 2026-10-17
  // on git 2.39.5: the race test run on its own passed five times out of five,
  // and the same test run beside twenty-four others failed with this. Git's
  // bookkeeping for staging is mid-flight -- registered by the winner, gone
  // from the disk -- and the loser's second add says so.
  it('calls it building when git says the staging path is not a working tree', () => {
    expect(somebodyIsBuilding(`fatal: '${buildingFolderPath(dir, 'w-x')}' is not a working tree`)).toBe(true);
  });

  // AND THE CASES THAT MUST NOT MATCH, which is the half that makes this worth
  // having: a full disk or a missing ref is NOT somebody else building, and
  // reporting it as "another session has this" would send whoever reads the row
  // looking for a session that does not exist.
  it('does not call a full disk somebody else building', () => {
    expect(somebodyIsBuilding('fatal: could not write file: No space left on device')).toBe(false);
  });

  it('does not call a missing ref somebody else building', () => {
    expect(somebodyIsBuilding("fatal: invalid reference: refs/heads/nope")).toBe(false);
  });

  it('does not call a branch collision somebody else building', () => {
    // A branch that exists is handled on its own road (`hasBranch()` then
    // attach), and it is a different failure with a different answer.
    expect(somebodyIsBuilding("fatal: a branch named 'agentbox/w-x' already exists")).toBe(false);
  });

  // THE ONE THIS GUARD GOT WRONG, caught by a test main gained on 2026-10-15
  // (tests/a-task-folder-is-made-when-the-repository-has-a-failing-post-checkout-hook).
  // The branch wordings above are only about a race when the path git names is a
  // STAGING folder. Named anywhere else, the branch is checked out in somebody's
  // finished work and nobody is building anything: that is a real failure with a
  // real answer, and swallowing it as "building" leaves the row waiting for a
  // session that will never arrive.
  it('does not call a branch checked out in a finished folder somebody else building', () => {
    const elsewhere = path.join(dir, 'elsewhere');
    expect(somebodyIsBuilding(`fatal: 'agentbox/w-x' is already checked out at '${elsewhere}'`)).toBe(false);
    expect(somebodyIsBuilding(`fatal: 'agentbox/w-x' is already used by worktree at '${elsewhere}'`)).toBe(false);
  });

  it('says nothing about an empty or missing message', () => {
    expect(somebodyIsBuilding('')).toBe(false);
    expect(somebodyIsBuilding(null)).toBe(false);
    expect(somebodyIsBuilding(undefined)).toBe(false);
  });
});

/* ===== the lock read back, which is the other half of the same question ==== */

describe('reading the lock back after writing our own', () => {
  const ours = 4242;
  const lock = (pid) => `agentbox pid=${pid}`;
  const wrote = { ok: true, out: '' };
  const wouldNotWrite = {
    ok: false,
    out: "fatal: could not open '.git/worktrees/w-x/locked' for writing: Permission denied",
  };

  it('is ours when our own pid is in it', () => {
    expect(whoEndedUpInTheLock({ pid: ours, locked: wrote, after: lock(ours), triesLeft: 4 }))
      .toEqual({ taken: true, heldBy: ours });
  });

  it('names the other session when its pid is in it', () => {
    expect(whoEndedUpInTheLock({ pid: ours, locked: wrote, after: lock(99), triesLeft: 4 }))
      .toEqual({ taken: false, reason: 'held', heldBy: 99 });
  });

  it('says locked for a lock with no pid to find, worded or bare', () => {
    expect(whoEndedUpInTheLock({ pid: ours, locked: wrote, after: 'mine, do not touch', triesLeft: 4 }))
      .toEqual({ taken: false, reason: 'locked', heldBy: null });
    expect(whoEndedUpInTheLock({ pid: ours, locked: wrote, after: '', triesLeft: 4 }))
      .toEqual({ taken: false, reason: 'locked', heldBy: null });
  });

  // THE ONE MAIN WENT RED ON. Measured by racing twenty processes for one id
  // until it happened: our `worktree lock` returned 0, and a moment later the
  // folder carried no lock at all, because the other taker's `unlock` ran
  // between the two. Nobody is in the lock yet, so there is nobody to name.
  it('asks again when the lock we just wrote is gone and nobody is named', () => {
    expect(whoEndedUpInTheLock({ pid: ours, locked: wrote, after: undefined, triesLeft: 4 }))
      .toEqual({ again: true });
  });

  it('ends with held, nobody named, once asking again has run out', () => {
    expect(whoEndedUpInTheLock({ pid: ours, locked: wrote, after: undefined, triesLeft: 0 }))
      .toEqual({ taken: false, reason: 'held', heldBy: null });
  });

  // AND THE CASE THAT MUST NOT MATCH, which is why the question is about our
  // own `lock` as well as the read-back. A lock git would not write is this
  // machine failing, and calling it "another session has this" would send
  // whoever reads the row hunting for a session that does not exist.
  it('does not call a lock git would not write another session holding it', () => {
    const said = whoEndedUpInTheLock({ pid: ours, locked: wouldNotWrite, after: undefined, triesLeft: 4 });
    expect(said.taken).toBe(false);
    expect(said.reason).toBe('unlockable');
    expect(said.again).toBe(undefined);
    expect(said.detail).toContain('Permission denied');
  });

  it('still names the other session when git refused us because of their lock', () => {
    const already = { ok: false, out: "fatal: '/w/x' is already locked" };
    expect(whoEndedUpInTheLock({ pid: ours, locked: already, after: lock(99), triesLeft: 4 }))
      .toEqual({ taken: false, reason: 'held', heldBy: 99 });
  });

  // FOUND BY RUNNING THE RACE TWENTY WIDE AFTER THE FIRST FIX, which is the
  // only way this one shows up: git refuses our lock BECAUSE another session
  // locked it a moment before, and the read-back then lands in that session's
  // own unlock-and-lock gap, so git has named them and the lock has not. The
  // first fix called that this machine failing and threw git's words at the row.
  it('asks again when git says another session locked it first', () => {
    const already = { ok: false, out: "fatal: '/w/x' is already locked, reason: agentbox pid=99" };
    expect(whoEndedUpInTheLock({ pid: ours, locked: already, after: undefined, triesLeft: 4 }))
      .toEqual({ again: true });
  });

  it('names the session git named, once asking again has run out', () => {
    const already = { ok: false, out: "fatal: '/w/x' is already locked, reason: agentbox pid=99" };
    expect(whoEndedUpInTheLock({ pid: ours, locked: already, after: undefined, triesLeft: 0 }))
      .toEqual({ taken: false, reason: 'held', heldBy: 99 });
  });

  it("says locked when the lock git saw is a person's own", () => {
    const already = { ok: false, out: "fatal: '/w/x' is already locked, reason: mine, do not touch" };
    expect(whoEndedUpInTheLock({ pid: ours, locked: already, after: undefined, triesLeft: 0 }))
      .toEqual({ taken: false, reason: 'locked', heldBy: null });
  });
});

/* ============ the refusal the documented reason always promised =========== */

describe('a folder somebody else is part way through making', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  it('is refused as building, with no folder handed back', () => {
    // The road that already worked, kept here so the fix below cannot break it:
    // staging registered and locked by another LIVE process.
    const staging = buildingFolderPath(dir, 'w-mid');
    fs.mkdirSync(path.dirname(staging), { recursive: true });
    git(dir, 'worktree', 'add', '--no-checkout', '-q', staging, '-b', 'agentbox/w-mid', 'refs/heads/main');
    git(dir, 'worktree', 'lock', '--reason', `agentbox pid=${process.pid}`, staging);

    const asked = ensureTaskFolder(dir, 'w-mid', { pid: process.pid + 1 });
    expect(asked.taken).toBe(false);
    expect(asked.reason).toBe('building');
    expect(asked.path).toBe(null);
  });

  it('is refused as building when git refuses the add instead, not thrown', () => {
    // THE WINDOW ITSELF, forced rather than raced. Staging is registered under
    // ANOTHER repository, so this repo's `clearUnfinished` sees nothing of its
    // own to clear and walks straight into an add that git refuses with
    // "already exists" -- which is byte for byte what the five losers hit.
    const staging = buildingFolderPath(dir, 'w-wedged');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, 'half-built.txt'), 'someone is mid-build\n');
    // Make it undeletable by `clearUnfinished`, the way a live build is: the
    // directory is there and is not ours to remove.
    fs.chmodSync(path.dirname(staging), 0o500);
    try {
      const asked = ensureTaskFolder(dir, 'w-wedged');
      expect(asked.taken).toBe(false);
      expect(asked.reason).toBe('building');
      expect(asked.path).toBe(null);
    } finally {
      fs.chmodSync(path.dirname(staging), 0o700);
    }
  });
});

/* ===== a lock that cannot be written is not a folder somebody else has ==== */

describe('a lock this git will not write', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  it('reaches the row as git words, not as another session', () => {
    const made = ensureTaskFolder(dir, 'w-nolock', { dependencies: false });
    expect(made.taken).toBe(true);
    // Unlocked so the next asker is offered the folder rather than told who has
    // it, and git's own bookkeeping made read-only so its lock cannot land.
    git(dir, 'worktree', 'unlock', made.path);
    const admin = path.join(dir, '.git', 'worktrees');
    const books = fs.readdirSync(admin);
    for (const book of books) fs.chmodSync(path.join(admin, book), 0o500);
    try {
      expect(() => ensureTaskFolder(dir, 'w-nolock', { pid: process.pid + 1, dependencies: false }))
        .toThrow(/Permission denied/);
    } finally {
      for (const book of books) fs.chmodSync(path.join(admin, book), 0o700);
    }
  });
});

/* ====================== and the real race, end to end ===================== */

describe('six sessions wanting the same folder at once', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  // A RACE, SO IT CAN ONLY PASS VACUOUSLY AND NEVER FAIL SPURIOUSLY. If the
  // processes happen to serialise, every one of them gets the folder in turn and
  // the assertions below hold trivially. The failure this guards against -- a
  // loser throwing a git fatal -- needs the collision to happen, and in the
  // measured run it happened five times out of five.
  it('gives it to exactly one of them, and tells the rest who has it', async () => {
    const child = (id) => new Promise((resolve) => {
      const code = `
        import { ensureTaskFolder } from ${JSON.stringify(path.resolve('main/task-folders.mjs'))};
        let out;
        try {
          const made = ensureTaskFolder(${JSON.stringify(dir)}, ${JSON.stringify(id)}, { dependencies: false });
          out = { taken: !!made?.taken, reason: made?.reason ?? null };
        } catch (err) { out = { threw: String(err.message) }; }
        process.send(out);
      `;
      const p = fork('--input-type=module', [], { execArgv: ['--input-type=module'], stdio: ['pipe', 'ignore', 'ignore', 'ipc'] });
      let said = null;
      p.on('message', (m) => { said = m; });
      p.on('exit', () => resolve(said ?? { crashed: true }));
      p.stdin.end(code);
    });

    const all = await Promise.all(Array.from({ length: 6 }, () => child('w-same')));
    const threw = all.filter((r) => r.threw);
    const reasons = all.filter((r) => !r.taken && !r.threw).map((r) => r.reason);

    // NOBODY SEES A GIT FATAL. That is the fix.
    expect(threw, threw.map((t) => t.threw).join(' / ')).toEqual([]);
    expect(all.filter((r) => r.crashed)).toEqual([]);
    // Every refusal names something a person can act on.
    for (const reason of reasons) expect(['building', 'held', 'locked']).toContain(reason);
    // And somebody got it.
    expect(all.some((r) => r.taken)).toBe(true);
  }, 60_000);

  it('still gives six different items six different folders', async () => {
    // The half that already worked and must keep working: eight concurrent
    // calls for eight different ids all succeeded in the measured run.
    const ids = ['w-p0', 'w-p1', 'w-p2', 'w-p3', 'w-p4', 'w-p5'];
    for (const id of ids) {
      const made = ensureTaskFolder(dir, id, { dependencies: false });
      expect(made.taken, id).toBe(true);
      expect(made.path).toBe(taskFolderPath(dir, id));
      expect(git(made.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe(`agentbox/${id}`);
    }
    expect(new Set(ids.map((id) => taskFolderPath(dir, id))).size).toBe(6);
  }, 60_000);
});
