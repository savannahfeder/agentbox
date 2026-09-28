// A CHAT NEVER CROSSES FROM ONE HARNESS TO THE OTHER.
//
// A session id means nothing without the engine that issued it. Claude Code's
// is a UUID in a JSONL under `~/.claude/projects`; Codex's is a thread id whose
// rollout is at `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl`. The
// two are the same SHAPE and belong to different worlds, so nothing about a
// bare id says which of them wrote it.
//
// The slice that added the second engine wrote `engine` onto both maps that
// survive a restart, and then did not READ it in the two places that hand an id
// back to a spawn:
//
//   `rowSessionFor` checked the product, the transcript and the folder, and not
//   the engine. So a row whose last session was Codex handed its thread id to
//   `--resume` on the Claude CLI, which answers "No conversation found with
//   session ID" and exits in about a second -- which this file reads as a fast
//   exit, three of which strike her subscription and arm a fleet-wide cooldown
//   of up to thirty minutes. Her reply on that row does not merely fail, it
//   takes the fleet with it.
//
//   `_resumeInterrupted` HAD `rec.engine` in its hand, off the record it was
//   resuming, and passed the row to `spawnWorker` without it -- so the engine
//   was decided again from scratch by `_engineFor` and could disagree with the
//   session it was resuming. The wake sweep is the path that runs after every
//   restart and every lid close, which is the moment the most rows are waiting.
//
// The rule both of them now keep: THE ENGINE THAT WROTE A SESSION IS THE ENGINE
// THAT RESUMES IT, and if that engine cannot run on this Mac the row waits and
// says so rather than being handed to the other one. A continuation that dies
// on arrival tells her nothing about why, and CLAUDE.md's rule is that anything
// her words pass through either reaches a worker or says out loud that it did
// not.
//
// AND THE MODEL IS THE SAME MISTAKE ONE FIELD ALONG. `plan.model` is whatever
// she picked in the composer's model drawer, which is a CLAUDE model: an alias
// like `opus` or `sonnet`, or a full Claude slug. It was passed straight into
// `thread/start` as Codex's `model`, where none of those words exist. Every
// Codex run on a row with a model set would have failed, and the failure would
// have arrived as a refused thread rather than as anything naming the cause.
//
// THE FIRST FIX WENT TOO FAR AND HAS SINCE BEEN CORRECTED. It dropped EVERY
// model word, because with nothing to check a word against, "this is a Claude
// name" was the only guess available -- so `gpt-5.6-sol`, the model her own
// config.toml names, was thrown away as a Claude Code alias. main/codex-models
// .mjs reads the slugs this Mac's Codex publishes, so the word is now checked:
// one Codex knows is carried, one it does not know stops the run before
// `thread/start`, and a Mac with no list refuses nothing. The whole argument,
// and the measurement of why a dropped model reached nobody, is in
// tests/a-model-she-picked-for-codex-is-honoured-or-the-run-says-why.test.mjs.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const CODEX_BIN = '/nonexistent/codex/codex';
const dirs = [];

/**
 * A store root with a Claude transcript on disk for one id, so the transcript
 *  guard in `rowSessionFor` passes and the engine guard is what is under test. */
function build({ codexBin = CODEX_BIN, items = [], config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zero-provenance-'));
  dirs.push(dir);
  const home = join(dir, 'home');
  const product = { slug: 'agentbox', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home,
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin,
      maxConcurrentSessions: 3,
      authProfiles: ['default'],
      codexHome: join(dir, 'codex-home'),
      ...config,
    },
    {
      listItems: () => items,
      listProducts: () => [product],
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  sup.product = product;
  sup.root = dir;
  sup.claudeProfile = join(dir, 'her-second-claude');
  return sup;
}

/**
 * Put this Mac's real (trimmed) Codex model list into a supervisor's codex
 *  home, so the model rule is exercised against facts rather than against an
 *  empty directory, which refuses nothing by design. */
function withModelList(sup) {
  mkdirSync(sup.config.codexHome, { recursive: true });
  copyFileSync(
    fileURLToPath(new URL('./fixtures/codex-models-cache.json', import.meta.url)),
    join(sup.config.codexHome, 'models_cache.json'),
  );
  return sup;
}

/**
 * Put a Claude Code transcript where `transcriptFile` looks for one. A
 * 'default' profile resolves against the real `os.homedir`, so the fixture
 * names a second-login folder instead: that path IS the home for that record.
 * */
const claudeTranscript = (sup, sessionId, cwd) => {
  const slug = String(cwd).replace(/[^a-zA-Z0-9]/g, '-');
  const dir = join(sup.claudeProfile, 'projects', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sessionId}.jsonl`), '{}\n');
};

/** And a Codex rollout where the other half of `transcriptFile` looks. */
const codexRollout = (sup, sessionId) => {
  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const dir = join(sup.config.codexHome, 'sessions', y, m, d);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `rollout-${y}-${m}-${d}T00-00-00-${sessionId}.jsonl`), '{}\n');
};

afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const row = (extra = {}) => ({ id: 'w-595f3ccad4', product: 'agentbox', status: 'open', title: 'a row with a chat', ...extra });

/* =============== the row's own chat, and which harness wrote it =========== */

describe('the chat a row goes back to', () => {
  let sup;
  beforeEach(() => { sup = build(); });

  it('is handed back when the engine that wrote it is the engine that will run', () => {
    claudeTranscript(sup, 'SESSION-CLAUDE', sup.root);
    sup._rowSessions = {
      'w-595f3ccad4': {
        sessionId: 'SESSION-CLAUDE', product: 'agentbox', cwd: sup.root, profile: sup.claudeProfile,
        engine: 'claude', lastUsedAt: Date.now(),
      },
    };
    expect(sup.rowSessionFor(row(), sup.product)?.sessionId).toBe('SESSION-CLAUDE');
  });

  // AN ENTRY WITH NO ENGINE IS CLAUDE CODE, which is right for every record
  // written before the second engine existed: they were all Claude Code.
  it('reads a record written before there was a second engine as claude', () => {
    claudeTranscript(sup, 'SESSION-OLD', sup.root);
    sup._rowSessions = {
      'w-595f3ccad4': {
        sessionId: 'SESSION-OLD', product: 'agentbox', cwd: sup.root, profile: sup.claudeProfile,
        lastUsedAt: Date.now(),
      },
    };
    expect(sup.rowSessionFor(row(), sup.product)?.sessionId).toBe('SESSION-OLD');
  });

  // THE BUG. `_engineFor` answers Claude Code for every row on this Mac, so a
  // Codex chat on that row is an id the Claude CLI has never heard of.
  it('is refused when a codex thread would be handed to claude', () => {
    codexRollout(sup, 'SESSION-CODEX');
    sup._rowSessions = {
      'w-595f3ccad4': {
        sessionId: 'SESSION-CODEX', product: 'agentbox', cwd: sup.root, profile: 'default',
        engine: 'codex', lastUsedAt: Date.now(),
      },
    };
    expect(sup.rowSessionFor(row(), sup.product)).toBe(null);
  });

  // AND THE OTHER WAY ROUND, which is the half that arrives once anything can
  // route to Codex: a Claude UUID must never reach `thread/resume`.
  it('is refused when a claude session would be handed to codex', () => {
    sup._engineFor = () => 'codex';
    claudeTranscript(sup, 'SESSION-CLAUDE', sup.root);
    sup._rowSessions = {
      'w-595f3ccad4': {
        sessionId: 'SESSION-CLAUDE', product: 'agentbox', cwd: sup.root, profile: sup.claudeProfile,
        engine: 'claude', lastUsedAt: Date.now(),
      },
    };
    expect(sup.rowSessionFor(row(), sup.product)).toBe(null);
  });
});

/* ================== the wake sweep, which knew and did not say ============ */

describe('putting the session that was interrupted back on its row', () => {
  let sup; let spawns;
  beforeEach(() => {
    sup = build();
    spawns = [];
    sup.spawnWorker = (item, options) => { spawns.push({ id: item.id, ...options }); };
  });

  it('forces the engine the record says, not the one the rule would pick', () => {
    sup._resumeInterrupted(row(), { sessionId: 'SESSION-CODEX', profile: 'default', engine: 'codex' });
    expect(spawns).toHaveLength(1);
    expect(spawns[0].engine).toBe('codex');
    expect(spawns[0].resumeSessionId).toBe('SESSION-CODEX');
  });

  it('forces claude for a record that names it, and for one that names nothing', () => {
    sup._resumeInterrupted(row(), { sessionId: 'S1', profile: 'default', engine: 'claude' });
    sup._resumeInterrupted(row(), { sessionId: 'S2', profile: 'default' });
    expect(spawns.map((s) => s.engine)).toEqual(['claude', 'claude']);
  });

  // THE CASE THAT MATTERS MOST AND THE ONE THAT COULD ONLY GO WRONG SILENTLY.
  // She marked the row Codex on her laptop; this Mac has no Codex on it. The
  // old code would have run the thread id through Claude Code's `--resume`.
  it('refuses to cross harnesses when the recorded engine cannot run here', () => {
    const noCodex = build({ codexBin: null });
    const tried = [];
    noCodex.spawnWorker = (item, options) => { tried.push({ id: item.id, ...options }); };
    noCodex._resumeInterrupted(row(), { sessionId: 'SESSION-CODEX', profile: 'default', engine: 'codex' });
    expect(tried).toEqual([]);
  });

  it('says so on the row rather than leaving it silent', () => {
    const said = [];
    const noCodex = build({ codexBin: null });
    noCodex.store.recordSessionResult = (product, id, patch) => said.push({ product, id, ...patch });
    noCodex.spawnWorker = () => { throw new Error('must not spawn'); };
    noCodex._resumeInterrupted(row(), { sessionId: 'SESSION-CODEX', profile: 'default', engine: 'codex' });
    expect(said).toHaveLength(1);
    expect(said[0].result).toMatch(/Codex/);
    expect(said[0].status).toBe('open');
  });
});

/* ========= and the sweep that really runs after a restart reaches it ====== */
// THE TWO TESTS ABOVE CALL `_resumeInterrupted` DIRECTLY, AND THAT IS WHY THEY
// PASSED WHILE THE ROW STAYED SILENT (2026-09-05).
//
// In the app nothing calls that method except `recoverInterrupted`, and it used
// to ask about a SLOT first:
//
// if (!this._hasSlotFor(engineOf(rec.engine))) { out.queued += 1; }
// this._resumeInterrupted(item, rec);
//
// `_capacityFor` answers zero for an engine `engineChoices` does not offer, and
// a Mac with no Codex offers none -- so a stranded Codex row failed the slot
// test, was counted `queued`, re-armed the sweep, and the line that writes
// "install Codex and the same session picks up where it stopped" was never
// reached. The row sat in her In Progress list forever with nothing on it, and
// `_recoverPending` kept the sweep coming back every fifteen seconds to decide
// the same nothing again.
//
// "NO ROOM RIGHT NOW" AND "CANNOT RUN HERE" ARE DIFFERENT FACTS, and only one
// of them changes on its own. The harness is asked about first, and a row whose
// harness is missing is not queued -- it is told, once, and left alone.

describe('the wake sweep, on a Mac that does not have the harness', () => {
  const stranded = (sup, engine = 'codex') => {
    sup.transcriptFile = () => '/nonexistent/transcript.jsonl';
    sup._liveSessions = {
      'w-595f3ccad4': { sessionId: 'S-1', product: 'agentbox', cwd: sup.root, profile: 'default', engine },
    };
  };

  it('says so on the row, through the path the app actually takes', () => {
    const said = [];
    const sup = build({ codexBin: null, items: [row()] });
    sup.store.recordSessionResult = (product, id, patch) => said.push({ product, id, ...patch });
    sup.spawnWorker = () => { throw new Error('must not spawn'); };
    stranded(sup);

    const out = sup.recoverInterrupted('wake');

    expect(said).toHaveLength(1);
    expect(said[0].result).toMatch(/Codex/);
    expect(out).toMatchObject({ missing: 1, queued: 0, resumed: 0 });
    expect(out.missingIds).toEqual(['w-595f3ccad4']);
  });

  // AND IT IS NOT A ROW WAITING FOR A SLOT, so the sweep is not re-armed to
  // come back in fifteen seconds and write the same sentence again. That is the
  // banner problem this codebase already paid for once.
  it('does not queue it, and does not ask again on every tick', () => {
    const sup = build({ codexBin: null, items: [row()] });
    sup.spawnWorker = () => { throw new Error('must not spawn'); };
    stranded(sup);

    sup.recoverInterrupted('wake');

    expect(sup._recoverPending).toBe(false);
  });

  // AND THE RECORD IS KEPT, which is what makes the sentence true: install
  // Codex and the same session really does pick up where it stopped.
  it('keeps the session, so the resume happens the day the harness is back', () => {
    const sup = build({ codexBin: null, items: [row()] });
    sup.spawnWorker = () => { throw new Error('must not spawn'); };
    stranded(sup);
    sup.recoverInterrupted('wake');
    expect(sup._liveSessions['w-595f3ccad4']).toBeTruthy();

    const back = build({ items: [row()], config: { engineChoice: '2026-09-04T00:00:00Z' } });
    const spawns = [];
    back.spawnWorker = (item, options) => { spawns.push({ id: item.id, ...options }); };
    stranded(back);

    expect(back.recoverInterrupted('wake')).toMatchObject({ resumed: 1, missing: 0 });
    expect(spawns[0].engine).toBe('codex');
  });

  // THE CASE THAT MUST NOT MATCH, and it is the whole reason the two facts are
  // kept apart: a harness that IS here and simply has no free slot is queued
  // and silent, exactly as it always was. Nothing is written on the row,
  // because nothing is wrong with it.
  it('still queues a row whose harness is here and busy, and says nothing', () => {
    const said = [];
    const sup = build({ items: [row()], config: { engineChoice: '2026-09-04T00:00:00Z' } });
    sup.store.recordSessionResult = (product, id, patch) => said.push({ product, id, ...patch });
    sup.spawnWorker = () => { throw new Error('must not spawn'); };
    stranded(sup);
    for (let i = 0; i < 3; i += 1) {
      sup.sessions.set(`w-busy-${i}`, { itemId: `w-busy-${i}`, product: 'other', engine: 'codex' });
    }

    expect(sup.recoverInterrupted('wake')).toMatchObject({ queued: 1, missing: 0 });
    expect(said).toEqual([]);
    expect(sup._recoverPending).toBe(true);
  });

  it('still queues a claude row behind a full claude fleet, on every Mac', () => {
    const said = [];
    const sup = build({ codexBin: null, items: [row()] });
    sup.store.recordSessionResult = (product, id, patch) => said.push({ product, id, ...patch });
    sup.spawnWorker = () => { throw new Error('must not spawn'); };
    stranded(sup, 'claude');
    for (let i = 0; i < 3; i += 1) {
      sup.sessions.set(`w-busy-${i}`, { itemId: `w-busy-${i}`, product: 'other', engine: 'claude' });
    }

    expect(sup.recoverInterrupted('wake')).toMatchObject({ queued: 1, missing: 0 });
    expect(said).toEqual([]);
  });

  // AND THE ORDINARY RESUME IS UNTOUCHED, which is every row on her Mac.
  it('puts a claude session back when there is room, exactly as it did', () => {
    const sup = build({ codexBin: null, items: [row()] });
    const spawns = [];
    sup.spawnWorker = (item, options) => { spawns.push({ id: item.id, ...options }); };
    stranded(sup, 'claude');

    expect(sup.recoverInterrupted('wake')).toMatchObject({ resumed: 1, missing: 0 });
    expect(spawns[0].engine).toBe('claude');
  });
});

/* A personal thread had a session map of its own, and three cases here proved
   it remembered which harness held it. Personal projects are deleted
   (w-d19d6d387c, 2026-09-22): `_rowSessions` is the one map now, and the blocks
   above already pin it for both engines. */

/* ================== and the model is a word codex knows ================== */
//
// THIS BLOCK USED TO ASSERT THAT EVERY MODEL WORD WAS DROPPED, and that was
// only ever right because the app had no way to tell one word from another.
// `main/codex-models.mjs` reads the slugs this Mac's Codex publishes, so the
// question is now answerable and the rule is: carried, or the run does not
// happen. The whole of it, and the argument for stopping rather than running on
// Codex's own default, is in
// tests/a-model-she-picked-for-codex-is-honoured-or-the-run-says-why.test.mjs;
// what stays here is the half this file is about, which is that a Claude Code
// word never reaches Codex's `model`.

describe('the model a codex thread is started with', () => {
  it('is never one of Claude Code aliases: the run stops instead', () => {
    const sup = withModelList(build());
    expect(() => sup.codexThreadParamsFor({ model: 'opus' }, '/tmp/p', [], null)).toThrow(/opus/);
  });

  it('is her own word when codex knows it', () => {
    const sup = withModelList(build());
    expect(sup.codexThreadParamsFor({ model: 'gpt-5.6-sol' }, '/tmp/p', [], null).model).toBe('gpt-5.6-sol');
  });

  it('says on the run why the model she picked was not carried', () => {
    const sup = withModelList(build());
    expect(sup.codexModelRefusal('opus')).toMatch(/opus/);
    // AND NO LONGER CLAIMS TO KNOW WHERE THE WORD CAME FROM. `opus` is a Claude
    // Code alias, but `gpt-5.6-slo` is a typo and the old sentence called that
    // one a Claude Code model name too, which sent her looking in the wrong
    // place. What she can act on is the list, so the list is what is said.
    expect(sup.codexModelRefusal('opus')).toMatch(/gpt-5\.6-sol/);
  });

  // THE CASE THAT MUST NOT MATCH: a row with no model of its own is not carrying
  // anything to refuse, and says nothing about it.
  it('says nothing at all when no model was picked', () => {
    const sup = withModelList(build());
    expect(sup.codexModelRefusal(null)).toBe(null);
    expect(sup.codexThreadParamsFor({ model: null }, '/tmp/p', [], null).model).toBeUndefined();
  });

  // AND THE OTHER CASE THAT MUST NOT MATCH: a Mac whose Codex has published no
  // list cannot say a word is wrong, so it refuses nothing and lets Codex
  // answer for its own slugs.
  it('refuses nothing at all on a mac with no model list', () => {
    const sup = build(); // its codex home has no models_cache.json in it
    expect(sup.codexModelRefusal('opus')).toBe(null);
    expect(sup.codexThreadParamsFor({ model: 'opus' }, '/tmp/p', [], null).model).toBe('opus');
  });
});
