// THE MODE THAT EXISTS FOR SEEING THINGS COULD NOT SEE THE SECOND ENGINE.
//
// This repo's design review runs on `?fixtures` screenshots (README, and the
// whole `scripts/shot-*.mjs` family, which serve `renderer/dist` and drive
// headless Chrome at a fixtures url). Until this file, `renderer/src/fixtures.ts`
// carried no engine facts at all: no `engines` key on `fixtureSnapshot`, and no
// `engine`, `engineChoices`, `codexModels`, `codexModelDefault` or `codex` on
// `fixtureSettings.workspace`. So the composer's engine clause, the byline's
// engine word, the per-engine model list, the Codex connection card and the
// engine-aware usage corner were all unphotographable.
//
// THE COST WAS MEASURED IN A SHIPPED BUG. Settings drew Claude Code's four
// model aliases directly under a picker reading "Coding agent: Codex" -- her own
// 2026-08-26 defect, "On Opus. With Codex.", back on a different row. A
// founder-side tester found it in ten minutes of using the real app. Nobody
// could have caught it in a screenshot, because no screenshot could contain it:
// `w.engine === 'codex'` is unreachable in a fixture world that never offers a
// second engine. `?engines=codex` below is that exact screen.
//
// AND THE OTHER DIRECTION IS A FOUNDER RULE, NOT AN IMPLEMENTATION DETAIL.
// tests/one-coding-agent-draws-nothing-new.test.mjs holds it: on every Mac she
// has, the screen must be exactly the screen it is today. A two-engine fixture
// world that was the ONLY world would make that rule unphotographable, which is
// the same defect pointing the other way. So the second engine is a MODIFIER on
// the url, the way `?shelf=on`, `?working=3` and `?rest=off` already are, and
// the DEFAULT world is the Mac she runs: one coding agent, nothing new drawn.
// Passing no `?engines` at all is what records the rule, because that is the
// world every existing shot script already photographs.
//
// FOUR MACHINES, WHICH IS ALL OF THEM:
//
//   (absent)            one coding agent, gate shut. Every Mac she has.
//   ?engines=missing    gate open, Codex not on this Mac. Still one agent, so
// still no picker: the connection card is the whole of
// what is new, and that Mac is the one it was built for
// (Settings.tsx: "its answer is NO on precisely the Mac
// this card is for").
//   ?engines=claude     two agents, workspace still on Claude Code. The state a
// Mac is in the moment she opens the gate.
//   ?engines=codex      two agents, workspace moved to Codex. The screen the
// shipped bug was on.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EnginePicker } from '../renderer/src/components/EnginePicker.tsx';
import { ENGINES } from '../shared/engines.mjs';
import { codexModels as readCodexModels } from '../main/codex-models.mjs';
import { engineModelChoices } from '../renderer/src/models.ts';
import {
  fixtureSnapshot,
  fixtureSettings,
  fixtureCodexModels,
  fixtureCodexModelDefault,
} from '../renderer/src/fixtures.ts';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const source = (p) => readFileSync(join(ROOT, p), 'utf8');

// api.ts reads `location.search` ONCE, at module scope, so a world is chosen by
// importing the module with that url in place. Nothing else about the module is
// stubbed: `window` stays undefined, which is what puts it in fixtures mode in
// the first place.
async function apiAt(search) {
  vi.resetModules();
  globalThis.location = { search };
  const mod = await import('../renderer/src/api.ts');
  return mod.api;
}

afterEach(() => { delete globalThis.location; });

describe('the default fixture world is the Mac she has', () => {
  it('offers one coding agent on the snapshot', () => {
    expect(fixtureSnapshot.engines.choices).toEqual([ENGINES[0]]);
    expect(fixtureSnapshot.engines.workspace).toBe('claude');
    expect(fixtureSnapshot.engines.byItem).toEqual({});
  });

  it('offers one coding agent in settings, and says nothing about Codex', () => {
    const w = fixtureSettings.workspace;
    expect(w.engineChoices).toEqual([ENGINES[0]]);
    expect(w.engine).toBe('claude');
    expect(w.codex).toBe(null);
    expect(w.codexModels).toEqual([]);
    expect(w.codexModelDefault).toBe(null);
  });

  // The corner names an agent only where there are two to tell apart, and it is
  // absent entirely until a reading lands. The default world has no reading, so
  // the corner is exactly as absent as it has always been.
  it('has no usage reading, so the corner is unchanged', () => {
    expect(fixtureSnapshot.usage ?? null).toBe(null);
  });

  it('is what a page with no ?engines in its url gets', async () => {
    const api = await apiAt('?fixtures');
    const snap = await api.snapshot();
    expect(snap.engines.choices).toHaveLength(1);
    expect((await api.settings()).workspace.codex).toBe(null);
  });

  // The boundary the other side of the parser: a word nothing recognises is not
  // a second engine. A typo in a shot script must not quietly change the world.
  it('is what an ?engines value nothing recognises gets', async () => {
    const api = await apiAt('?fixtures&engines=banana');
    expect((await api.snapshot()).engines.choices).toHaveLength(1);
    expect((await api.settings()).workspace.codex).toBe(null);
  });
});

describe('?engines=missing is the Mac the connection card was built for', () => {
  it('still offers one coding agent, so no picker is drawn anywhere', async () => {
    const api = await apiAt('?fixtures&engines=missing');
    expect((await api.snapshot()).engines.choices).toEqual([ENGINES[0]]);
    expect((await api.settings()).workspace.engineChoices).toEqual([ENGINES[0]]);
  });

  it('draws the card, saying Codex is not here', async () => {
    const api = await apiAt('?fixtures&engines=missing');
    const w = (await api.settings()).workspace;
    expect(w.codex.found).toBe(false);
    expect(w.codex.certain).toBe(true);
    expect(w.codex.url).toMatch(/^https:\/\//);
    expect(w.codexModels).toEqual([]);
  });
});

describe('?engines=claude is the Mac the moment she opens the gate', () => {
  it('offers both agents, in the order shared/engines.mjs draws them', async () => {
    const api = await apiAt('?fixtures&engines=claude');
    const snap = await api.snapshot();
    expect(snap.engines.choices).toEqual(ENGINES);
    expect(snap.engines.workspace).toBe('claude');
  });

  // `byItem` names ONLY the rows that differ from the workspace, which is what
  // the renderer's read (`byItem[id] ?? workspace`) is built on. A map that
  // named a row already on the workspace engine would be a map the app has to
  // ignore, and a key that is not a real row is a fact about nothing.
  it('puts real rows on the second engine, and only rows that differ', async () => {
    const api = await apiAt('?fixtures&engines=claude');
    const snap = await api.snapshot();
    const ids = new Set(snap.items.map((i) => i.id));
    const marked = Object.entries(snap.engines.byItem);
    expect(marked.length).toBeGreaterThan(0);
    for (const [id, engine] of marked) {
      expect(ids.has(id)).toBe(true);
      expect(engine).toBe('codex');
      expect(snap.items.find((i) => i.id === id).engine).toBe('codex');
    }
  });

  // What is RUNNING beats what would run (byline.ts), so a live session on the
  // second engine has to say so itself or the byline reads off the wrong fact.
  it('marks the live session on the second engine too', async () => {
    const api = await apiAt('?fixtures&engines=claude');
    const snap = await api.snapshot();
    const running = snap.supervisor.running.filter((r) => snap.engines.byItem[r.itemId]);
    expect(running.length).toBeGreaterThan(0);
    for (const r of running) expect(r.engine).toBe(snap.engines.byItem[r.itemId]);
  });

  it('gives the corner a reading to name an agent with', async () => {
    const api = await apiAt('?fixtures&engines=claude');
    const snap = await api.snapshot();
    expect(snap.usage.engine).toBe('claude');
    expect(snap.usage.limits.length).toBeGreaterThan(0);
    expect(Number.isFinite(snap.usage.at)).toBe(true);
  });

  it('connects Codex in settings, with the models this Mac would really offer', async () => {
    const api = await apiAt('?fixtures&engines=claude');
    const w = (await api.settings()).workspace;
    expect(w.engineChoices).toEqual(ENGINES);
    expect(w.engine).toBe('claude');
    expect(w.codex.found).toBe(true);
    expect(w.codex.trouble).toBe(null);
    expect(w.codexModels).toEqual(fixtureCodexModels);
    expect(w.codexModelDefault).toBe(fixtureCodexModelDefault);
  });
});

describe('?engines=codex is the screen the shipped bug was on', () => {
  it('has the workspace on Codex in both places, which cannot disagree', async () => {
    const api = await apiAt('?fixtures&engines=codex');
    expect((await api.snapshot()).engines.workspace).toBe('codex');
    expect((await api.settings()).workspace.engine).toBe('codex');
  });

  // THE BUG ITSELF, as a photograph: the Model row under "Coding agent: Codex"
  // draws `engineModelChoices('codex', ...)`, and it has to be able to draw more
  // than one row or the row refuses itself and the screen is never seen.
  it('draws Codex model rows under the Codex picker, and no Claude alias', async () => {
    const api = await apiAt('?fixtures&engines=codex');
    const w = (await api.settings()).workspace;
    const rows = engineModelChoices('codex', w.codexModel ?? w.codexModelDefault, {
      codexModels: w.codexModels,
      codexDefault: w.codexModelDefault,
    });
    expect(rows.length).toBeGreaterThan(1);
    for (const alias of ['opus', 'sonnet', 'haiku', 'fable']) {
      expect(rows.some((m) => m.id === alias)).toBe(false);
    }
  });

  it('puts the rows that differ back on Claude Code', async () => {
    const api = await apiAt('?fixtures&engines=codex');
    const snap = await api.snapshot();
    const marked = Object.entries(snap.engines.byItem);
    expect(marked.length).toBeGreaterThan(0);
    for (const [, engine] of marked) expect(engine).toBe('claude');
  });

  it('names Codex in the corner', async () => {
    const api = await apiAt('?fixtures&engines=codex');
    expect((await api.snapshot()).usage.engine).toBe('codex');
  });
});

// THE DATA BEING RIGHT IS NOT THE SAME AS THE PICTURE HAVING SOMETHING IN IT,
// and the composer's clause is the one surface that refuses ITSELF below two
// engines rather than being held by an outer guard. So both fixture worlds are
// put through the real component: the default has to come back empty, and the
// two-engine one has to come back with words in it. That is the whole of what
// "photographable" means here, asked of the thing that draws.
describe('the fixture worlds are the shapes the picker really takes', () => {
  const draw = (choices, value = null) => renderToStaticMarkup(
    createElement(EnginePicker, { choices, value, onChange() {} }),
  );

  it('draws nothing off the world she runs', () => {
    expect(draw(fixtureSnapshot.engines.choices)).toBe('');
  });

  it('draws the clause off a two-engine world', async () => {
    const api = await apiAt('?fixtures&engines=codex');
    const snap = await api.snapshot();
    const html = draw(snap.engines.choices, snap.engines.workspace);
    expect(html).not.toBe('');
    expect(html).toContain('Codex');
  });
});

describe('the two worlds compose with the worlds that already existed', () => {
  it('leaves ?fixtures=empty an empty inbox while still offering two agents', async () => {
    const api = await apiAt('?fixtures=empty&engines=claude');
    const snap = await api.snapshot();
    expect(snap.items).toEqual([]);
    expect(snap.approvals).toEqual([]);
    expect(snap.engines.choices).toEqual(ENGINES);
  });

  it('leaves ?fixtures=crowded its crowded picker while offering two agents', async () => {
    const api = await apiAt('?fixtures=crowded&engines=claude');
    const snap = await api.snapshot();
    expect(snap.products.length).toBeGreaterThan(20);
    expect(snap.engines.choices).toEqual(ENGINES);
  });
});

describe('the words are read off the app rather than typed here twice', () => {
  it('takes the engine ids and labels from shared/engines.mjs', () => {
    expect(source('renderer/src/fixtures.ts')).toContain("from '../../shared/engines.mjs'");
  });

  // The models are the shapes main/codex-models.mjs really produces: the six
  // marked `visibility: "list"`, in the CLI's own ascending `priority` order,
  // as `{ id, label }` and nothing else.
  //
  // MEASURED AGAINST THE SAME CACHE THE REST OF THE CODEX SUITE MEASURES
  // AGAINST, tests/fixtures/codex-models-cache.json, which is a trimmed copy of
  // the real file codex-cli wrote on her Mac -- both hidden models included, and
  // the priorities as it really numbers them (6, 7, 8, 12, 16, 23, which are not
  // 1..6). A hand-typed list cannot pass this: it would have to guess the order
  // and drop exactly the two the reader drops.
  it('holds what main/codex-models.mjs would read off her Mac', () => {
    const cache = JSON.parse(source('tests/fixtures/codex-models-cache.json'));
    const read = readCodexModels({ home: '/nowhere', read: () => cache })
      .map(({ id, label }) => ({ id, label }));
    expect(read.length).toBeGreaterThan(1);
    expect(fixtureCodexModels).toEqual(read);
  });

  // And her own config.toml's default is one of them rather than a word of ours.
  it('runs on a model that is really in the list', () => {
    expect(fixtureCodexModels.some((m) => m.id === fixtureCodexModelDefault)).toBe(true);
  });

  // The install link is the one the button really opens. It is typed into
  // fixtures.ts rather than imported, because the renderer never imports from
  // main/, so this is what holds the two in step. The link has moved once
  // already (main/codex-bin.mjs: developers.openai.com answers 308 now), and a
  // fixture pointing at a redirect is a screenshot of a link she cannot trust.
  it('sends the card at the install link main really hands over', async () => {
    const { INSTALL_URL } = await import('../main/codex-bin.mjs');
    const api = await apiAt('?fixtures&engines=missing');
    expect((await api.settings()).workspace.codex.url).toBe(INSTALL_URL);
  });
});

describe('composing in fixtures can produce a row on the second engine', () => {
  // The fixtures branch rebuilds the item by hand, and it dropped `engine` on
  // the floor: `compose`'s param type had no `engine` key at all, so a card
  // that visibly picked Codex made a row that had never heard of it, and the
  // one mode this app has for looking at things could not produce the row it
  // was supposed to be looking at.
  it('keeps the engine she picked on the card', async () => {
    const api = await apiAt('?fixtures&engines=claude');
    const item = await api.compose({ product: 'kestrel', title: 'Ship the build menu', engine: 'codex' });
    expect(item.engine).toBe('codex');
  });

  // The case that must NOT match: a card that picked nothing writes no engine,
  // which is every row she has ever composed.
  it('writes no engine on a card that picked none', async () => {
    const api = await apiAt('?fixtures&engines=claude');
    const item = await api.compose({ product: 'kestrel', title: 'Ship the build menu' });
    expect('engine' in item).toBe(false);
  });
});
