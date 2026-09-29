// THE MODELS CODEX OFFERS ARE READ OFF THIS MAC, NOT LISTED IN A FILE OF OURS.
//
// `shared/claude-models.generated.mjs` can be a committed file because Claude
// Code's `--model` takes an ALIAS: `opus` is whatever Opus is on the day the
// task runs, resolved by the CLI at spawn. Codex has no aliases. `-m` and
// `thread/start`'s `model` want the exact slug of one specific model, OpenAI
// ships new ones on their own schedule, and a hardcoded Codex list is a list
// that is wrong the week after it is written.
//
// So it is read, and the reading is what these tests hold.
//
// THE FIXTURE IS REAL. `tests/fixtures/codex-models-cache.json` is this Mac's
// own `~/.codex/models_cache.json` with the fields this module never reads
// stripped out; nothing in it was invented. Measured 2026-09-04 against
// codex-cli 0.148.0: 198,977 bytes, 8 models, `fetched_at`
// 2026-09-04T10:21:25.048219Z, six carrying `visibility: "list"` and two
// carrying `"hide"` -- `gpt-reserve` at priority 3 and `codex-auto-review` at
// priority 43, both internal.
//
// FOUR THINGS BROKE THE 2026-08-26 VERSION OF THIS AND ARE PINNED HERE:
//
//   A HIDDEN MODEL IS NOT AN UNKNOWN MODEL. The original had one question --
//   "which models are there" -- and answered it with the six. Two slugs are
//   therefore absent from the answer that Codex would nonetheless accept, and
//   the supervisor now uses that answer to decide whether to refuse a run. One
//   question would have made `gpt-reserve` on a row a refusal about a model
//   that exists.
//
//   THE `[projects."..."]` TABLES. Her real config.toml is 234 lines and 71 of
//   them open a project table. A regex over the whole file finds a `model =`
//   inside one of those and reports a project's model as hers.
//
//   `model_reasoning_effort`, which sits on the line directly BELOW `model` in
//   her real config and starts with the same eight characters.
//
//   THE `list[0]` FALLBACK. The original answered the top-priority model when
//   config.toml named none. That is our sort order's first row and not Codex's
//   default, and the two are only equal by luck.
//
// NOTHING HERE SPAWNS ANYTHING. `codex` has no subcommand that prints its
// models, and even if it did, a picker must never be the reason a login shell
// is spawned while she is typing.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexHome, codexModels, codexKnownSlugs, codexDefaultModel } from '../main/codex-models.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/codex-models-cache.json', import.meta.url));
const dirs = [];
let home;

/** A Codex home on disk with whatever files a case needs in it. */
function makeHome({ cache = FIXTURE, config = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-models-'));
  dirs.push(dir);
  if (cache === FIXTURE) copyFileSync(FIXTURE, join(dir, 'models_cache.json'));
  else if (typeof cache === 'string') writeFileSync(join(dir, 'models_cache.json'), cache);
  if (config != null) writeFileSync(join(dir, 'config.toml'), config);
  return dir;
}

beforeEach(() => { home = makeHome(); });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* ========================= what she may be offered ======================== */

describe('the models a picker may offer', () => {
  it('is the six visible ones, in the order codex ranks them', () => {
    expect(codexModels({ home }).map((m) => m.id)).toEqual([
      'gpt-5.6-sol',   // priority 6
      'gpt-5.6-terra', // 7
      'gpt-5.6-luna',  // 8
      'gpt-5.5',       // 12
      'gpt-5.4',       // 16
      'gpt-5.4-mini',  // 23
    ]);
  });

  // SORTED, NOT MERELY FILTERED. The fixture is in the cache's own order, which
  // is already ascending, so a `sort` that did nothing would pass the test
  // above. This one shuffles it so only a real sort can answer.
  it('sorts by priority rather than trusting the order the file happens to be in', () => {
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const shuffled = makeHome({ cache: JSON.stringify({ ...raw, models: [...raw.models].reverse() }) });
    expect(codexModels({ home: shuffled }).map((m) => m.id)).toEqual(codexModels({ home }).map((m) => m.id));
  });

  it('carries the name and the blurb codex wrote, so nothing has to be typed here', () => {
    const [first] = codexModels({ home });
    expect(first).toMatchObject({
      id: 'gpt-5.6-sol',
      label: 'GPT-5.6-Sol',
      description: 'Reliable agentic workhorse for everyday tasks.',
    });
  });

  // THE CASE THAT MUST NOT MATCH, and the whole reason `visibility` is read.
  // `gpt-reserve` and `codex-auto-review` exist for Codex's own internal use.
  // A person who chose one would get a session that behaves nothing like a
  // coding agent, and neither is a thing she has ever asked for.
  it('never offers a model codex marked hidden', () => {
    const offered = codexModels({ home }).map((m) => m.id);
    expect(offered).not.toContain('gpt-reserve');
    expect(offered).not.toContain('codex-auto-review');
    expect(offered).toHaveLength(6);
  });
});

/* ===================== and what codex nonetheless knows =================== */

describe('the slugs codex would actually accept', () => {
  // THE OTHER HALF OF THE SAME FILE, AND IT IS DELIBERATELY A DIFFERENT
  // ANSWER. "What may she be offered" and "what would Codex take" are two
  // questions, and the supervisor asks the second one before it refuses a run.
  // Answering it with the first would refuse a slug Codex accepts.
  it('is all eight, hidden ones included', () => {
    const known = codexKnownSlugs({ home });
    expect(known.size).toBe(8);
    for (const id of codexModels({ home })) expect(known.has(id.id)).toBe(true);
    expect(known.has('gpt-reserve')).toBe(true);
    expect(known.has('codex-auto-review')).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH: a word Codex has never heard of.
  it('does not contain a claude alias or a near miss', () => {
    const known = codexKnownSlugs({ home });
    expect(known.has('opus')).toBe(false);
    expect(known.has('claude-opus-5')).toBe(false);
    expect(known.has('gpt-5.6-slo')).toBe(false); // the typo, one transposition away
    expect(known.has('gpt-5.6')).toBe(false);     // a prefix is not a slug
  });
});

/* ===================== reasoning levels, per model ======================= */

describe('the reasoning levels a model reaches', () => {
  // MEASURED, AND THEY DIFFER, which is the whole reason they are carried per
  // model rather than as one list beside the picker. `gpt-5.6-sol` reaches
  // `ultra`; `gpt-5.5` stops at `xhigh`. One fixed list would offer her a
  // level half these models cannot run.
  it('is the model own list and not one shared list', () => {
    const by = Object.fromEntries(codexModels({ home }).map((m) => [m.id, m]));
    expect(by['gpt-5.6-sol'].levels.map((l) => l.id)).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
    expect(by['gpt-5.5'].levels.map((l) => l.id)).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(by['gpt-5.6-sol'].levels).not.toEqual(by['gpt-5.5'].levels);
  });

  it('carries each level own blurb and the model own default, which also differ', () => {
    const by = Object.fromEntries(codexModels({ home }).map((m) => [m.id, m]));
    expect(by['gpt-5.6-sol'].defaultLevel).toBe('low');
    expect(by['gpt-5.5'].defaultLevel).toBe('medium');
    expect(by['gpt-5.6-sol'].levels[0]).toEqual({ id: 'low', description: 'Fast responses with lighter reasoning' });
  });
});

/* ===================== a cache that is not there, or is junk ============== */

describe('a cache this mac cannot read', () => {
  // NOT A GUESS. An empty list is what makes the supervisor pass her word
  // through to Codex untouched rather than refuse it, which is the honest
  // answer when we have nothing to check it against.
  it('answers with nothing at all when there is no cache file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'codex-models-none-'));
    dirs.push(empty);
    expect(codexModels({ home: empty })).toEqual([]);
    expect(codexKnownSlugs({ home: empty }).size).toBe(0);
  });

  // A 199KB file the CLI rewrites whenever an etag changes is a file that can
  // be read halfway through a write. It must not take the app with it.
  it.each([
    ['truncated mid-write', readFileSync(FIXTURE, 'utf8').slice(0, 400)],
    ['not json at all', 'models_cache'],
    ['json with no models key', '{"fetched_at":"2026-09-04T10:21:25Z"}'],
    ['models as a string', '{"models":"gpt-5.6-sol"}'],
    ['models as a list of junk', '{"models":[null,3,"gpt-5.6-sol",{"display_name":"no slug"}]}'],
    ['empty file', ''],
  ])('reads %s as nothing rather than throwing', (_what, text) => {
    const broken = makeHome({ cache: text });
    expect(() => codexModels({ home: broken })).not.toThrow();
    expect(codexModels({ home: broken })).toEqual([]);
    expect(codexKnownSlugs({ home: broken }).size).toBe(0);
  });
});

/* ========================= her own default model ========================== */

describe('what codex runs on when nobody picks', () => {
  it('is the bare model line at the top of her config', () => {
    const dir = makeHome({ config: 'personality = "pragmatic"\nmodel = "gpt-5.6-sol"\nmodel_reasoning_effort = "medium"\n' });
    expect(codexDefaultModel({ home: dir })).toBe('gpt-5.6-sol');
  });

  // THE CASE THAT MUST NOT MATCH, AND IT IS THE ONE HER REAL FILE PRODUCES.
  // Her config.toml is 234 lines with 71 `[projects."..."]` tables under those
  // three; a regex over the whole file reads a project's model as hers.
  it('never reads a model out of a project table below it', () => {
    const dir = makeHome({
      config: [
        'personality = "pragmatic"',
        'model = "gpt-5.6-sol"',
        '',
        '[projects."/Users/sam/Desktop/astral"]',
        'trust_level = "trusted"',
        'model = "gpt-5.4-mini"',
        '',
        '[projects."/Users/sam/Zero"]',
        'model = "gpt-reserve"',
        '',
      ].join('\n'),
    });
    expect(codexDefaultModel({ home: dir })).toBe('gpt-5.6-sol');
  });

  it('finds nothing rather than a project model when she set no top-level one', () => {
    const dir = makeHome({
      config: '[projects."/Users/sam/Desktop/astral"]\ntrust_level = "trusted"\nmodel = "gpt-5.4-mini"\n',
    });
    expect(codexDefaultModel({ home: dir })).toBe(null);
  });

  // THE BOUNDARY EITHER SIDE OF THE KEY. `model_reasoning_effort` sits on the
  // line directly below `model` in her real file and shares its first eight
  // characters; `default_model` ends with the key rather than starting with it.
  it.each([
    ['model_reasoning_effort = "medium"'],
    ['model_provider = "openai"'],
    ['default_model = "gpt-5.4"'],
    ['# model = "gpt-5.4"'],
  ])('does not read %s as the model', (line) => {
    expect(codexDefaultModel({ home: makeHome({ config: `${line}\n` }) })).toBe(null);
  });

  // NULL IS A REAL ANSWER: pass no model at all and let Codex decide, which is
  // exactly what happens today. NOT the top-priority model, which is our sort
  // order's first row and not Codex's default; printing that as "hers" would be
  // wrong every time the two differ and there is nothing here that could tell.
  it('answers nothing rather than guessing the first model in the list', () => {
    expect(codexDefaultModel({ home })).toBe(null);
    expect(codexModels({ home })[0].id).toBe('gpt-5.6-sol');
  });

  it('answers nothing when there is no config at all', () => {
    const bare = mkdtempSync(join(tmpdir(), 'codex-models-nocfg-'));
    dirs.push(bare);
    expect(codexDefaultModel({ home: bare })).toBe(null);
  });
});

/* ============================ which home ================================= */

describe('which codex home is read', () => {
  it('is ~/.codex when nothing says otherwise', () => {
    expect(codexHome({ env: {}, home: '/Users/you' })).toBe('/Users/you/.codex');
  });

  // The installer's own line, read 2026-09-04:
  // `CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"`. Same precedence, and
  // main/codex-bin.mjs already looks under it for signs of an install.
  it('is CODEX_HOME when the environment sets one', () => {
    expect(codexHome({ env: { CODEX_HOME: '/opt/codex-home' }, home: '/Users/you' })).toBe('/opt/codex-home');
  });

  it('is her own setting ahead of both, because that one is a choice', () => {
    expect(codexHome({ configured: '/her/codex', env: { CODEX_HOME: '/opt/codex-home' }, home: '/Users/you' }))
      .toBe('/her/codex');
  });

  // THE CASE THAT MUST NOT MATCH. `${VAR:-default}` in the installer falls back
  // on an empty string too, so an exported-but-blank CODEX_HOME must not become
  // a read of `/models_cache.json` at the root of the disk.
  it.each([[''], [undefined], [null]])('ignores a CODEX_HOME of %p', (value) => {
    expect(codexHome({ env: { CODEX_HOME: value }, home: '/Users/you' })).toBe('/Users/you/.codex');
  });

  it('defaults to this machine own home when asked with no arguments at all', () => {
    expect(codexHome({ env: {} })).toBe(join(homedir(), '.codex'));
  });

  // AND THE HOME IS REALLY WHAT IS READ, rather than a value computed and then
  // ignored: the cache under the CODEX_HOME is the one that answers.
  it('reads the cache out of the home it picked', () => {
    expect(codexModels({ home: codexHome({ env: { CODEX_HOME: home } }) }).map((m) => m.id)[0]).toBe('gpt-5.6-sol');
  });
});
