// WHAT THE SCREEN IS ALLOWED TO KNOW ABOUT THE SECOND ENGINE, AND WHO DECIDES.
//
// Three surfaces in this slice need an answer to "is there a coding agent to
// choose between on this Mac": the word in the composer's sentence, the row in
// Settings, and the coding-agent slot in the byline. NONE of them may work it
// out. Whether a choice is real needs the capability gate
// (`ENGINE_CHOICE_ENABLED`) and the staleness rule (`engineChoiceOnRowIsStale`),
// and tests/a-codex-row-from-august-still-runs-on-claude.test.mjs pins both to
// exactly one file, main/supervisor.mjs. So the supervisor answers once and
// hands the answer over on the snapshot.
//
// THE HAZARD THIS FILE EXISTS FOR IS THE PICKER THAT LIES. shared/engines.mjs
// says it out loud about its own ungated helpers: "A future renderer could draw
// a picker out of them, and the gate would not stop it -- she would be offered
// a choice that `engineFor` then refuses, which is its own kind of lie." That is
// the first block below. `engineChoices` is the first caller those helpers have
// ever had, and it is written so the offer and the routing cannot come apart:
// the same three refusals answer both, because it is the same method asking.
//
// AND A CHOICE SHE CANNOT BE OFFERED IS ONE THE APP WILL NOT WRITE. `zero:compose`
// has accepted an `engine` field the whole time this branch has existed and
// `composeItem` silently dropped it, so nothing has ever been written. Now that
// something draws a picker, the field is written -- and refused, at the door,
// whenever there is no choice to have made. A ledger line naming an engine she
// was never offered is a line whose `wrote.engine.ts` is recent enough to be
// honoured the day she does open the gate.

import { describe, it, expect, vi, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// main/supervisor.mjs imports `spawn` at module scope; this is the only seam
// between the app's choice of executable and a real process, and it is the same
// one every sibling engine test uses.
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    spawn: () => ({ stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} }),
  };
});

import { foldWorkItems } from '../shared/work-items.mjs';
import { engineChoiceOnRowIsStale } from '../shared/engines.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const AUGUST = Date.parse('2026-08-26T11:00:00Z');
const OPENED = '2026-09-04T00:00:00Z';
const AFTER = Date.parse('2026-09-04T09:00:00Z');

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';

const dirs = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

// A row as it comes off her ledger: folded, so `wrote.engine.ts` is the fold's
// and not the assertion's. The staleness rule reads nothing else.
function ledgerRow(id, lines) {
  const item = foldWorkItems(lines.map((l) => ({ id, source: 'founder', ...l }))).get(id);
  return { ...item, product: 'agentbox' };
}

const codexRow = (id, ts) => ledgerRow(id, [
  { ts: ts - 1000, patch: { title: 'a row', status: 'open' } },
  { ts, patch: { engine: 'codex' } },
]);

const claudeRow = (id, ts) => ledgerRow(id, [
  { ts: ts - 1000, patch: { title: 'a row', status: 'open' } },
  { ts, patch: { engine: 'claude' } },
]);

const plainRow = (id) => ledgerRow(id, [{ ts: AFTER, patch: { title: 'a row', status: 'open' } }]);

function build(config = {}, items = []) {
  const dir = tempDir('engine-facts-');
  const product = { slug: 'agentbox', dir, repoPath: null };
  return new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      maxConcurrentSessions: 4,
      authProfiles: ['default'],
      ...config,
    },
    {
      listItems: () => items, listProducts: () => [product], isDue: () => true,
      settleAnswer() {}, recordSessionResult() {},
    },
    '/nonexistent-app',
  );
}

/* ==================== nothing new on a one-engine Mac ==================== */
// THE CASE THAT MUST NOT MATCH, asked three ways, because there are three
// separate ways to be a Mac with one coding agent on it.

describe('with one coding agent there is nothing for a screen to draw', () => {
  it('offers no choice on a Mac with no Codex on it', () => {
    const sup = build({ engineChoice: OPENED });
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['claude']);
    expect(sup.engineFacts([codexRow('w-1', AFTER)])).toEqual({
      choices: [{ id: 'claude', label: 'Claude Code', word: 'Claude Code' }],
      workspace: 'claude',
      byItem: {},
    });
  });

  // AND THIS IS THE ONE THE BRIEF ASKED TO BE ARGUED. Codex is installed, the
  // moment is not written, so `engineFor` would refuse every row. Drawing a
  // picker here would offer her something the supervisor is about to turn down,
  // and a choice that silently does nothing is worse than no choice at all. So
  // the offer is refused by exactly the thing that refuses the routing.
  it('offers no choice while Codex is installed but she has not opened the gate', () => {
    const sup = build({ codexBin: CODEX_BIN });
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['claude']);
    expect(sup.engineFacts([codexRow('w-1', AFTER)]).choices).toHaveLength(1);
    // The routing agrees, which is the point: one method answers both.
    expect(sup._engineFor(codexRow('w-1', AFTER))).toBe('claude');
  });

  // A workspace default of codex written by hand does not conjure a choice
  // either. It is the same file the moment would be in, so a config carrying
  // one and not the other is a config she edited halfway.
  it('offers no choice for a workspace default nobody may act on', () => {
    const sup = build({ codexBin: CODEX_BIN, engine: 'codex' });
    expect(sup.engineChoices()).toHaveLength(1);
    expect(sup.engineFacts([]).workspace).toBe('claude');
  });

  // The plainest machine there is, which is every machine today.
  it('offers no choice on a fresh install', () => {
    const sup = build();
    expect(sup.engineChoices()).toHaveLength(1);
    expect(sup.engineFacts([plainRow('w-1')])).toEqual({
      choices: [{ id: 'claude', label: 'Claude Code', word: 'Claude Code' }],
      workspace: 'claude',
      byItem: {},
    });
  });
});

/* ======================= once both halves are true ======================= */

describe('with Codex installed and the gate open, the screen is told', () => {
  const both = { codexBin: CODEX_BIN, engineChoice: OPENED };

  it('names both engines, Claude Code first', () => {
    expect(build(both).engineChoices().map((e) => e.id)).toEqual(['claude', 'codex']);
  });

  it('marks the row she chose Codex on since she opened the gate', () => {
    const sup = build(both);
    expect(sup.engineFacts([codexRow('w-1', AFTER)]).byItem).toEqual({ 'w-1': 'codex' });
  });

  // THE AUGUST ROW, which is the whole reason the opt-in is a moment. It is not
  // routed to Codex and it must not be DRAWN as Codex either: a byline saying
  // "It will run on Codex" over a row the supervisor is about to hand to Claude
  // Code is the same lie in a different place.
  it('does not mark an August row, because nothing is going to run it there', () => {
    const sup = build(both);
    expect(sup.engineFacts([codexRow('w-1', AUGUST)]).byItem).toEqual({});
    expect(sup._engineFor(codexRow('w-1', AUGUST))).toBe('claude');
  });

  // Sparse both ways: only a row that DIFFERS from the workspace answer is
  // listed, so the map is empty on her Mac today and stays small on any Mac.
  // The renderer reads `byItem[id] ?? workspace`.
  //
  // AND THE AUGUST ROW GOES WHEREVER THE WORKSPACE GOES, which is the half that
  // is easy to get backwards and was, in the first draft of this test. A stale
  // choice is not "runs on Claude Code": it is "names no choice at all", so the
  // workspace default answers, and the drawing has to follow the run rather
  // than the word on the row.
  it('lists only the rows that differ from the workspace answer', () => {
    const rows = [codexRow('w-1', AFTER), plainRow('w-2'), claudeRow('w-3', AFTER), codexRow('w-4', AUGUST)];
    expect(build(both).engineFacts(rows).byItem).toEqual({ 'w-1': 'codex' });

    const flipped = build({ ...both, engine: 'codex' });
    expect(flipped.engineFacts(rows).workspace).toBe('codex');
    expect(flipped.engineFacts(rows).byItem).toEqual({ 'w-3': 'claude' });
  });

  // A Mac that has Codex but whose binary went away between the choice and the
  // reading falls back and RUNS, and the drawing follows the run.
  it('falls back to what will really run when the binary is gone', () => {
    const sup = build({ engineChoice: OPENED, codexBin: null });
    expect(sup.engineFacts([codexRow('w-1', AFTER)]).byItem).toEqual({});
  });

  // AND THE LINE ABOUT AN AUGUST ROW NAMES WHAT WILL REALLY RUN IT. It said
  // "Claude Code" whatever happened, which is wrong on the one machine where
  // the fallback is not Claude Code -- and that machine is exactly the one
  // somebody reading this line is standing in front of.
  it('says which engine the stale row is actually going to', () => {
    const said = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((line) => { said.push(line); });
    try {
      build({ ...both, engine: 'codex' })._engineFor(codexRow('w-9', AUGUST));
      expect(said).toHaveLength(1);
      expect(said[0]).toMatch(/It is running on Codex;/);
      expect(said[0]).toMatch(/chosen 2026-08-26/);
    } finally { warn.mockRestore(); }
  });
});

/* ==================== what the card is allowed to write =================== */

describe('a choice she was never offered is not written on a row', () => {
  it('refuses an engine on a Mac with no choice, however the call arrives', () => {
    const sup = build({ codexBin: CODEX_BIN });
    expect(sup.engineOffered('codex')).toBeNull();
    expect(sup.engineOffered('claude')).toBeNull();
  });

  it('takes the second engine once it is really on offer', () => {
    const sup = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup.engineOffered('codex')).toBe('codex');
  });

  // Claude Code is the default, so naming it is not a choice and writes
  // nothing. Same rule `enginePicked` follows for the composer's footer: a row
  // carrying the engine it would have run on anyway is a field with no news in
  // it, and every field written is one the fold has to carry for ever.
  it('writes nothing for the engine the row would have run on anyway', () => {
    const sup = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup.engineOffered('claude')).toBeNull();
    expect(sup.engineOffered(null)).toBeNull();
    expect(sup.engineOffered(undefined)).toBeNull();
  });

  it('refuses a word that is not an engine at all', () => {
    const sup = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup.engineOffered('gpt-5.6-sol')).toBeNull();
    expect(sup.engineOffered('CODEX')).toBeNull();
    expect(sup.engineOffered({ toString: () => 'codex' })).toBeNull();
  });
});

/* ================= and the choice really lands on the ledger ============= */
// The picker is only worth drawing if the word it writes survives to the fold,
// AND if the moment it was written survives with it: `engineChoiceOnRowIsStale`
// is the whole of what tells a choice she is making now from an August one, and
// it reads `wrote.engine.ts` and nothing else. A compose path that wrote the
// engine on system authority, or in a separate later line, would put a real
// choice of hers on the wrong side of her own opt-in.

describe('a choice she made on the card is on the row afterwards', () => {
  it('writes the engine, stamped as hers, at the moment she composed', async () => {
    const tmp = tempDir('engine-compose-');
    const accountRoot = join(tmp, 'accounts', 'test-account');
    const dir = join(accountRoot, 'agentbox');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'agentbox', name: Name, repoPath: null,
    }));
    const { Store } = await import('../main/store.mjs');
    const store = await new Store({ storeRoot: tmp, accountId: 'test-account', accountRoot, products: [] }).init();

    const before = Date.now();
    const made = store.composeItem('agentbox', { title: 'try the second engine', engine: 'codex' });

    expect(made.engine).toBe('codex');
    expect(made.wrote?.engine?.source).toBe('founder');
    expect(made.wrote?.engine?.ts).toBeGreaterThanOrEqual(before);

    // AND THE ROW READS AS A CHOICE SHE IS MAKING NOW, which is the only thing
    // the stamp is for. Against an opt-in written before this second, it is
    // honoured; against one written after it, it is not.
    const item = { ...made, product: 'agentbox' };
    expect(engineChoiceOnRowIsStale(item, { engineChoice: '2026-09-04' })).toBe(false);
    expect(engineChoiceOnRowIsStale(item, { engineChoice: '2099-01-01' })).toBe(true);
  });

  // The case that must not match, one layer lower than `engineOffered`: no
  // engine, no field, so an ordinary task carries nothing new for the fold.
  it('writes no engine at all on an ordinary task', async () => {
    const tmp = tempDir('engine-compose-plain-');
    const accountRoot = join(tmp, 'accounts', 'test-account');
    const dir = join(accountRoot, 'agentbox');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'agentbox', name: Name, repoPath: null,
    }));
    const { Store } = await import('../main/store.mjs');
    const store = await new Store({ storeRoot: tmp, accountId: 'test-account', accountRoot, products: [] }).init();

    const made = store.composeItem('agentbox', { title: 'an ordinary task', engine: null });
    expect(made.engine).toBeUndefined();
    expect(made.wrote?.engine).toBeUndefined();
  });
});

/* ============== and the model names reach the card, per engine ============ */

describe('what the settings payload says about the second engine', () => {
  const codexHomeWith = (models, toml) => {
    const home = tempDir('engine-codex-home-');
    writeFileSync(join(home, 'models_cache.json'), JSON.stringify({ models }));
    if (toml !== null) writeFileSync(join(home, 'config.toml'), toml);
    return home;
  };

  const payload = async (config) => {
    const { readSettings } = await import('../main/settings.mjs');
    const sup = build(config);
    return readSettings({
      config: {
        ...sup.config,
        accountRoot: sup.config.storeRoot,
        appDir: sup.config.storeRoot,
        sessionArgs: [],
        claudeFound: true,
        claudeCertain: true,
      },
      supervisor: sup,
      store: { listProducts: () => [] },
    }).workspace;
  };

  const MODELS = [
    {
      slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', visibility: 'list', priority: 1,
      default_reasoning_level: 'low',
      supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'ultra' }],
    },
    { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', priority: 2 },
    { slug: 'gpt-reserve', display_name: 'Reserve', visibility: 'hide', priority: 3 },
  ];

  it('offers Codex\'s own names, in Codex\'s own order, once there is a choice', async () => {
    const home = codexHomeWith(MODELS, 'model = "gpt-5.6-sol"\n');
    const w = await payload({ codexBin: CODEX_BIN, engineChoice: OPENED, codexHome: home });
    expect(w.engineChoices.map((e) => e.id)).toEqual(['claude', 'codex']);
    // AND EACH MODEL'S OWN REASONING LEVELS RIDE BESIDE ITS NAME: the strip in
    // the model drawer draws the picked model's list, and a model that
    // advertises none carries an empty one rather than a guess.
    expect(w.codexModels).toEqual([
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', levels: ['low', 'high', 'ultra'], defaultLevel: 'low' },
      { id: 'gpt-5.5', label: 'GPT-5.5', levels: [], defaultLevel: null },
    ]);
    // Her own config.toml, so the card's word and her terminal cannot disagree.
    expect(w.codexModelDefault).toBe('gpt-5.6-sol');
    expect(w.engine).toBe('claude');
  });

  // The hidden ones are Codex's internals and a person who picked one would get
  // a session that behaves nothing like a coding agent (main/codex-models.mjs).
  it('never offers the models Codex hides from its own picker', async () => {
    const home = codexHomeWith(MODELS, 'model = "gpt-5.6-sol"\n');
    const w = await payload({ codexBin: CODEX_BIN, engineChoice: OPENED, codexHome: home });
    expect(w.codexModels.map((m) => m.id)).not.toContain('gpt-reserve');
  });

  // Null is a real answer and the card says "Codex's own" for it rather than
  // printing our sort order as her default (renderer/src/models.ts).
  it('says nothing rather than guessing when her Codex names no model', async () => {
    const home = codexHomeWith(MODELS, null);
    const w = await payload({ codexBin: CODEX_BIN, engineChoice: OPENED, codexHome: home });
    expect(w.codexModelDefault).toBeNull();
    expect(w.codexModels).toHaveLength(2);
  });

  // AND THE ONE THAT MUST NOT MATCH: a Mac with no choice does not read the
  // cache at all, even when the cache is sitting right there. Codex installed,
  // gate shut.
  it('does not even open Codex\'s cache where nothing would draw the answer', async () => {
    const home = codexHomeWith(MODELS, 'model = "gpt-5.6-sol"\n');
    const w = await payload({ codexBin: CODEX_BIN, codexHome: home });
    expect(w.engineChoices).toHaveLength(1);
    expect(w.codexModels).toEqual([]);
    expect(w.codexModelDefault).toBeNull();
  });
});

/* ========================= and it reaches the door ======================= */
// The two handlers are asserted as source because `main/ipc.mjs` imports
// electron at module scope and cannot be loaded here. What is checked is the
// only thing worth checking: that neither handler makes its own decision.

describe('the door asks the supervisor rather than deciding', () => {
  const ipc = readFileSync(join(ROOT, 'main', 'ipc.mjs'), 'utf8');

  // IT WAS `engines: supervisor.engineFacts(...)` ON THE LITERAL UNTIL
  // 2026-09-05, and the value is now bound a few lines above it because the
  // corner's own rule needs the same answer (`usageEngine`, shared/usage.mjs):
  // deriving the workspace engine a second time inside the snapshot would be a
  // second copy of exactly the rule this describe block exists to keep in one
  // place. The claim is unchanged and is asserted in two halves -- the answer
  // comes from the supervisor, and it is that answer that rides the snapshot.
  it('puts the supervisor\'s own answer on the snapshot', () => {
    expect(ipc).toMatch(/const engines = supervisor\.engineFacts\(items\);/);
    expect(ipc).toMatch(/^\s*engines,$/m);
    // And nothing in the door works one out for itself.
    expect(ipc).not.toMatch(/engineFor\(/);
  });

  // THIS COUNTED THE WORD AND NOW READS THE SHAPE, 2026-09-05. It asserted that
  // `engine` appeared at most four times in the whole file, which was true while
  // exactly one handler wrote one, and said nothing at all about WHERE the other
  // three were. `zero:compose-repeat` now writes one too -- a repeating task
  // dropped both the engine and the model on the way from her card, so every
  // occurrence ran on the workspace default (main/repeats.mjs) -- and a budget
  // is the wrong guard for that: it goes red on a correct second door and stays
  // green on an incorrect first one.
  //
  // What the count was reaching for is written out instead: EVERY `engine:` this
  // file hands to the store is `supervisor.engineOffered(engine)`, and there is
  // at least one. A new door that forwards the word raw fails this whatever the
  // file's length, which is what the line was always trying to say.
  // AND IT IS ASKED PER HANDLER, not over the file. A file-wide scan is
  // satisfied by ONE correct handler while another forwards the word raw, which
  // is precisely the failure this is guarding: `zero:compose-repeat` gained an
  // engine on 2026-09-05 and a whole-file match would have covered for either
  // of the two going wrong.
  const handlerBody = (channel) => {
    const start = ipc.indexOf(`ipcMain.handle('${channel}'`);
    expect(start).toBeGreaterThan(-1);
    const next = ipc.indexOf('ipcMain.handle(', start + 1);
    return ipc.slice(start, next === -1 ? ipc.length : next);
  };

  it('passes every composed engine through the offer test, and none any other way', () => {
    for (const channel of ['zero:compose', 'zero:compose-repeat']) {
      const body = handlerBody(channel);
      expect(body).toMatch(/engine:\s*supervisor\.engineOffered\(engine\)/);
      // Nothing in that handler may hand an engine over any other way.
      const handed = body.match(/^\s*engine[:,].*$/gm) ?? [];
      expect(handed.length).toBe(1);
    }
  });
});
