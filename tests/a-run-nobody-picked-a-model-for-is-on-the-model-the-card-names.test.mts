// A RUN NOBODY PICKED A MODEL FOR IS ON THE MODEL THE CARD NAMES.
//
// The owner, on a film a teammate made: "one of the worst videos i've seen. why
// is it that whenever i prompt an agent with the prompt i gave you from zero it
// turns out great but whenever i try to use an employee it does something very
// low quality?" The prompt was the same prompt. The model was not.
//
// MEASURED off a worker this app spawned, 2026-11-04, by reading the command
// line of the run itself (/proc/<pid>/cmdline on the cloud machine):
//
//   claude -p ... --model claude-opus-5 --allowedTools mcp__agentbox ...
//
// The row carried no model, so `spawnPlan` left the `--model` sitting in
// sessionArgs alone, and that flag says `claude-opus-5` -- Opus 5, a generation
// behind the `opus` alias, which shared/claude-models.generated.mjs resolves to
// claude-opus-5-5. Nothing in the app can draw that flag: Settings has had no
// Model row since 2026-09-23 (tests/the-card-is-the-only-place-the-model-is-
// asked), so it is a fossil from an older build that no screen shows and no
// control changes.
//
// AND ONE PATH ALREADY KNEW. The new task card sends DEFAULT_MODEL on every
// Claude Code card, default included, for exactly this reason: "sending nothing
// let a `--model` flag in zero.config.json win" (renderer/src/components/
// Compose.tsx). So a thread she starts from the card ran Opus 5.5 and every
// other way a run starts -- her reply on a thread, a teammate's duty, a
// hand-off, a fork, a cloud run -- ran Opus 5. A teammate is woken ONLY those
// ways, so no teammate had ever run on the model her card names.
//
// The reply box meanwhile labels an untouched row with the engine's default
// (`engineModelLabel(engine, pickOnTheRow(item).model)` -> "Opus 5.5"), so the
// screen named one model and the run was another, which is the failure
// `effectivePermission` exists to stop for the permission mode: "a chip that
// says Manual over a session running in bypass is worse than no chip".
//
// SO THE RESOLUTION IS THE CARD'S, EVERYWHERE: the row's model wins, and when
// no row names one a Claude Code run is pinned to the same alias the card
// sends. A `--model` left in sessionArgs no longer decides a run.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { DEFAULT_CLAUDE_MODEL } from '../shared/engines.mjs';
import { DEFAULT_MODEL } from '../renderer/src/models.ts';
import { CLAUDE_MODELS } from '../shared/claude-models.generated.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FOSSIL = ['--model', 'claude-opus-5', '--allowedTools', 'mcp__agentbox', '--permission-mode', 'bypassPermissions'];

const supervisor = (sessionArgs) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'which-model-runs-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: dir, maxConcurrentSessions: 1, ...(sessionArgs ? { sessionArgs } : {}) }, store, REPO, REPO, dir);
};
const product = { slug: 'p', dir: os.tmpdir(), repoPath: null };
const row = (patch = {}) => ({ id: 'w-1a2b3c4d5e', product: 'p', title: 'Make the film', body: 'Do it.', labels: ['founder'], ...patch });
const flagIn = (args) => (args.indexOf('--model') >= 0 ? args[args.indexOf('--model') + 1] : null);
const modelOf = (item, { engine = 'claude', sessionArgs = FOSSIL } = {}) =>
  flagIn(supervisor(sessionArgs).spawnPlan(row(item), product, { engine }).args);

/* ============== the two ends of it name the same model =================== */
// The card's constant and the spawn's are one constant, so the word on the
// screen and the word on the command line cannot drift apart again.

describe('the model the app names when nobody has picked one', () => {
  it('is one constant, read by the card and by the spawn', () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe('opus');
    expect(DEFAULT_MODEL).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('is an alias the CLI resolves, never a version', () => {
    const row = CLAUDE_MODELS.find((m) => m.alias === DEFAULT_CLAUDE_MODEL);
    expect(row.alias).not.toBe(row.id);
    expect(row.id).toBe('claude-opus-5-5');
  });
});

/* ===================== the run, however it started ======================= */

describe('a claude code run on a row that names no model', () => {
  it('is on the app\'s own alias even when the config pins an older version', () => {
    expect(modelOf({})).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('is on it for a teammate, which is woken no other way', () => {
    expect(modelOf({ labels: ['founder', 'teammate:t-abc123'] })).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('is on it when the config carries no --model at all', () => {
    expect(modelOf({}, { sessionArgs: ['--permission-mode', 'bypassPermissions'] })).toBe(DEFAULT_CLAUDE_MODEL);
  });

  // The boundary either side of "there is a model on the row": an empty string
  // is no model, and a word is honoured.
  it('is on it when the row\'s model is empty', () => {
    expect(modelOf({ model: '' })).toBe(DEFAULT_CLAUDE_MODEL);
  });
});

describe('a row that names its own model', () => {
  it('still wins over both the config and the default', () => {
    expect(modelOf({ model: 'sonnet' })).toBe('sonnet');
    expect(modelOf({ model: 'claude-opus-5' })).toBe('claude-opus-5');
  });

  // The owner, 2026-11-04: "if the user selects a model, that should
  // definitely be the one that gets applied." A reply goes back to the session
  // that wrote what it answers, so the pick has to ride that resume too.
  it('reaches a reply that resumes the thread\'s own session', () => {
    const plan = supervisor(FOSSIL).spawnPlan(row({ model: 'sonnet', answer: 'make it faster' }), product, { engine: 'claude', continuation: true, resumeSessionId: 'session-abc' });
    expect(plan.args).toContain('--resume');
    expect(flagIn(plan.args)).toBe('sonnet');
  });

  it('is sent once, rewriting the config\'s flag rather than landing beside it', () => {
    const args = supervisor(FOSSIL).spawnPlan(row({ model: 'sonnet' }), product, { engine: 'claude' }).args;
    expect(args.filter((a) => a === '--model' || String(a).startsWith('--model=')).length).toBe(1);
  });
});

/* ============== and whoever pinned one by hand is told once =============== */
// A config that is quietly overruled is a behaviour nobody can account for
// later, which is the rule the two warnings in `defaultSessionArgs` follow.

describe('a config that pins a model of its own', () => {
  it('is told once which model runs instead, and where to pick one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sup = supervisor(FOSSIL);
    sup.spawnPlan(row(), product, { engine: 'claude' });
    sup.spawnPlan(row(), product, { engine: 'claude' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('--model claude-opus-5');
    expect(warn.mock.calls[0][0]).toContain('runs on opus');
    warn.mockRestore();
  });

  it('says nothing when the config pins the same model, or none', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supervisor(['--model', 'opus']).spawnPlan(row(), product, { engine: 'claude' });
    supervisor(['--permission-mode', 'auto']).spawnPlan(row(), product, { engine: 'claude' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('says nothing when the row picked the model, because nothing was overruled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supervisor(FOSSIL).spawnPlan(row({ model: 'sonnet' }), product, { engine: 'claude' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

/* ===================== and the case that must not match =================== */
// CODEX HAS NO ALIASES AND NO ARGV. `opus` is a meaningless word there, and a
// Claude alias reaching a Codex run is refused outright
// (tests/a-model-she-picked-for-codex-never-runs-on-claude-code), so a Codex
// run with nothing on its row goes on resolving against
// ~/.codex/config.toml exactly as it did.

describe('a codex run on a row that names no model', () => {
  it('is handed no model at all', () => {
    const plan = supervisor(FOSSIL).spawnPlan(row({ engine: 'codex' }), product, { engine: 'codex' });
    expect(plan.model).toBe(null);
  });

  it('still carries its own model when the row names one', () => {
    const plan = supervisor(FOSSIL).spawnPlan(row({ engine: 'codex', model: 'gpt-5.6-sol' }), product, { engine: 'codex' });
    expect(plan.model).toBe('gpt-5.6-sol');
  });
});
