// THE NEW-TASK CARD CANNOT SEND AN ENGINE THIS MAC DOES NOT OFFER.
//
// What it never did was CLAMP that memory against what this Mac can actually
// offer.
//
// MEASURED BY RENDERING THE REAL CARD, 2026-09-05. `zero.lastEngine` = "codex",
// `zero.lastModel.codex` = "gpt-5.6-sol", `engineChoices` = one engine (which is
// every Mac with no Codex on it, and every Mac before she opens the gate). The
// card came back saying:
//
//     <button class="compose-word set" title="Which model picks this up">gpt-5.6-sol</button>
//
// A Codex slug, in the sentence, on a machine with no Codex. And there is
// nothing beside it to explain the word: `EnginePicker` refuses to draw below
// two engines on purpose (tests/one-coding-agent-draws-nothing-new.test.mjs), so
// there is no "With Codex." clause on screen. Worse, `codexModels` is empty
// there, so the drawer behind that word collapses to the one row and the whole
// Claude Code model list is gone from the card.
//
// THE FIX IS THE CLAMP AND NOT A NEW CONTROL. Nothing is drawn that was not
// drawn before: the remembered word is simply not held by a card that cannot
// honour it, and the model follows the engine exactly as `pickEngine` already
// makes it follow when she moves the word herself.
//
// AND THE OTHER END OF THE SAME BUG IS THE DOOR. `zero:compose` already gated
// `engine` through `Supervisor#engineOffered`, so a card left open across a
// config change could not mark a row for an engine she was never shown. It
// forwarded `model` RAW. So the corrected row was filed as
// `{ engine: undefined, model: "gpt-5.6-sol" }` -- no engine at all, and the
// other harness's slug still on it. That row is worse than the one the gate
// refused: with no `engine` on it, `modelForEngine` in shared/engines.mjs has
// nothing to compare against, so the cross-harness guard in `spawnWorker` cannot
// see it either and the row goes to `claude --model gpt-5.6-sol`. The door has
// to refuse the model the same way it refuses the engine, and for the same
// reason: the two fields are one choice.

import { afterAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINES } from '../shared/engines.mjs';
import { engineThisMacOffers, readLastEngine } from '../renderer/src/engines.ts';
import { Compose } from '../renderer/src/components/Compose.tsx';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ipc = readFileSync(join(ROOT, 'main', 'ipc.mjs'), 'utf8');
const compose = readFileSync(join(ROOT, 'renderer', 'src', 'components', 'Compose.tsx'), 'utf8');

const ONE = [ENGINES[0]];
const TWO = ENGINES;

/* ========================= the clamp, on its own ========================= */

describe('a remembered engine this Mac cannot offer', () => {
  it('is not held', () => {
    expect(engineThisMacOffers('codex', ONE)).toBe(null);
    expect(engineThisMacOffers('codex', [])).toBe(null);
    expect(engineThisMacOffers('codex', undefined)).toBe(null);
  });

  it('is held where the Mac really offers it', () => {
    expect(engineThisMacOffers('codex', TWO)).toBe('codex');
  });

  // Naming the default is not a choice (`enginePicked`), so it reads as null
  // whatever the list says -- which is what the card already means by null.
  it('reads Claude Code as no choice at all', () => {
    expect(engineThisMacOffers('claude', TWO)).toBe(null);
    expect(engineThisMacOffers('claude', ONE)).toBe(null);
    expect(engineThisMacOffers(null, TWO)).toBe(null);
  });

  // THE CASE THAT MUST NOT MATCH: a word nothing recognises is not smuggled
  // through by a choices list that happens to carry it.
  it('refuses a word that is not an engine', () => {
    expect(engineThisMacOffers('gpt-5.6-sol', TWO)).toBe(null);
    expect(engineThisMacOffers('CODEX', TWO)).toBe(null);
  });
});

/* ===================== the card she actually looks at ==================== */

const fakeStorage = (entries) => {
  const map = new Map(entries);
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return map;
};

const card = (engineChoices, { codexModels = [], codexModelDefault = null } = {}) =>
  renderToStaticMarkup(createElement(Compose, {
    products: [{ slug: 'agentbox', name: Name }],
    hidden: [],
    personal: [],
    onSend() {}, onReorder() {}, onHide() {}, onClose() {},
    engineChoices,
    codexModels,
    codexModelDefault,
  }));

const REMEMBERS_CODEX = [['zero.lastEngine', 'codex'], ['zero.lastModel.codex', 'gpt-5.6-sol']];

describe('the card on a Mac that offers one coding agent', () => {
  it('does not put the other harness\'s model in the sentence', () => {
    fakeStorage(REMEMBERS_CODEX);
    const html = card(ONE);

    expect(html).not.toContain('gpt-5.6-sol');
    expect(html).toContain('Opus 5');
  });

  it('draws no engine clause, because there is still nothing to choose', () => {
    fakeStorage(REMEMBERS_CODEX);
    const html = card(ONE);

    expect(html).not.toContain('Codex');
    expect(html).not.toContain('clause-engine');
  });

  // The word is not merely hidden: the memory itself still says codex, and the
  // clamp is what stands between the two. Without this the test above would
  // pass just as well if something had cleared her localStorage.
  it('leaves what she picked remembered, and simply does not honour it here', () => {
    fakeStorage(REMEMBERS_CODEX);
    card(ONE);
    expect(readLastEngine()).toBe('codex');
  });
});

describe('the card on the Mac that really offers two', () => {
  it('keeps the engine she picked and the model that goes with it', () => {
    fakeStorage(REMEMBERS_CODEX);
    const html = card(TWO, { codexModels: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }] });

    expect(html).toContain('Codex');
    expect(html).toContain('GPT-5.6 Sol');
    expect(html).not.toContain('Opus 5');
  });
});

/* ============================== and the door ============================= */

const dirs = [];
const build = (config) => {
  const dir = mkdtempSync(join(tmpdir(), 'compose-door-'));
  dirs.push(dir);
  return new Supervisor(
    {
      home: '/nonexistent-home', storeRoot: dir, claudeBin: '/nonexistent/claude',
      maxConcurrentSessions: 4, authProfiles: ['default'], ...config,
    },
    { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {} },
    '/nonexistent-app',
  );
};

const OPENED = '2026-09-04T00:00:00Z';
const CODEX_BIN = '/nonexistent/codex/codex';

describe('the door refuses the model of an engine it just refused', () => {
  it('drops a codex model when the codex choice could not be offered', () => {
    const sup = build({});
    expect(sup.engineOffered('codex')).toBe(null);
    expect(sup.modelOffered('codex', 'gpt-5.6-sol')).toBe(null);
  });

  it('keeps it on the Mac where the choice really stands', () => {
    const sup = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup.engineOffered('codex')).toBe('codex');
    expect(sup.modelOffered('codex', 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
  });

  // THE CASE THAT MUST NOT MATCH, AND IT IS EVERY CARD SHE HAS EVER SENT. No
  // engine on the payload means Claude Code, which is what the door files, so
  // the model rides exactly as it always did.
  it('carries a claude model through untouched, on every Mac', () => {
    for (const sup of [build({}), build({ codexBin: CODEX_BIN, engineChoice: OPENED })]) {
      expect(sup.modelOffered(null, 'opus')).toBe('opus');
      expect(sup.modelOffered(undefined, 'opus')).toBe('opus');
      expect(sup.modelOffered('claude', 'opus')).toBe('opus');
    }
  });

  // And an absent model stays absent rather than becoming a value.
  it('leaves an empty model exactly as it found it', () => {
    const sup = build({});
    expect(sup.modelOffered('codex', null)).toBe(null);
    expect(sup.modelOffered('codex', '')).toBe('');
    expect(sup.modelOffered(null, undefined)).toBe(undefined);
  });

  // The far side of the same fact: a Mac where the gate is open but Codex is
  // gone. The engine is refused, so the model must be too.
  it('drops it where the gate is open and the binary is not there', () => {
    const sup = build({ engineChoice: OPENED });
    expect(sup.engineOffered('codex')).toBe(null);
    expect(sup.modelOffered('codex', 'gpt-5.6-sol')).toBe(null);
  });
});

/* ===================== and the two ends are really wired ================= */
// `main/ipc.mjs` imports electron at module scope and cannot be loaded here, so
// the handler is asserted as source, the way the other door tests are. What is
// checked is that neither field is handed to the store on the door's own
// judgement.

describe('the handlers ask the supervisor rather than deciding', () => {
  // ASKED PER HANDLER, not over the file. A whole-file scan is satisfied by one
  // correct handler while another forwards the word raw, and there are two doors
  // that compose now (`zero:compose-repeat` joined on 2026-09-05).
  const handlerBody = (channel) => {
    const start = ipc.indexOf(`ipcMain.handle('${channel}'`);
    expect(start).toBeGreaterThan(-1);
    const next = ipc.indexOf('ipcMain.handle(', start + 1);
    return ipc.slice(start, next === -1 ? ipc.length : next);
  };

  it('passes every composed model through the offer test, in both doors', () => {
    for (const channel of ['zero:compose', 'zero:compose-repeat']) {
      const body = handlerBody(channel);
      expect(body).toMatch(/model:\s*supervisor\.modelOffered\(engine, model\)/);
      // And hands a model over no other way inside that handler. The
      // destructure on the handler's own signature is the one other mention,
      // which is why this counts lines that START with the word.
      const handed = body.match(/^\s*model[:,].*$/gm) ?? [];
      expect(handed.length).toBe(1);
    }
  });
});

describe('the card clamps what it remembered', () => {
  it('seeds the engine through the clamp rather than from storage directly', () => {
    expect(compose).toMatch(/engineThisMacOffers\(readLastEngine\(undefined, workspaceEngine\)/);
  });

  it('reconciles again when this Mac\'s answer changes under an open card', () => {
    expect(compose).toContain('engineThisMacOffers(engine, engineRows)');
  });
});

afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});
