// THE CODING AGENT AND THE MODEL ARE ASKED ON THE CARD, AND NOWHERE ELSE
// (w-12081d32cc, 2026-09-23). Settings asked both questions, in a Coding agent
// row and in a Model row inside each engine's card, and the new task card had
// been asking them all along and remembering the answers. A first task opens on
// Claude Code and Opus, which is the standard the founder asked for.
//
// This file replaces tests/the-model-row-belongs-to-the-agent-named-above-it,
// which held the Settings row to the engine named in the row above it. Those
// rows are gone, so the strongest form of the same law is that neither question
// can be asked on that screen at all: a control that cannot be drawn cannot be
// drawn wrong. The list-per-engine rule itself still has a home and is
// unchanged (tests/the-model-list-belongs-to-the-engine.test.mjs); the
// composer's own clamp is tests/the-card-cannot-send-an-engine-this-mac-does-
// not-offer.
//
// THE HALF THAT IS NEW IS THAT THE WORD ON THE CARD IS NOW THE MODEL THAT RUNS.
// While Settings had a Model row, a card showing Opus sent nothing when nobody
// had touched it, and the run fell back to whatever `--model` was sitting in
// zero.config.json. That was survivable when a screen could correct it. With the
// screen gone it is a card that says one model and an agent that runs another,
// with nowhere to look, so Compose sends the default explicitly.
//
// CODEX IS DELIBERATELY NOT CHANGED. There the ABSENCE of the word is a real
// answer: it means the person's own ~/.codex/config.toml decides, and their
// terminal and their fleet go on following one file.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX_OWN, DEFAULT_MODEL, engineModelPicked } from '../renderer/src/models.ts';
import { DEFAULT_ENGINE } from '../shared/engines.mjs';
import { setModelArg } from '../main/settings.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const compose = read('renderer/src/components/Compose.tsx');

/* ===================== neither question is on that screen ================= */

describe('the Settings screen', () => {
  it('draws no Coding agent row and no Model row', () => {
    expect(settings).not.toContain('<div className="set-row-label">Coding agent</div>');
    expect(settings).not.toContain('<div className="set-row-label">Model</div>');
  });

  it('writes none of the three settings those rows wrote', () => {
    expect(settings).not.toMatch(/setWorkspace\('engine'/);
    expect(settings).not.toMatch(/setWorkspace\('model'/);
    expect(settings).not.toMatch(/setWorkspace\('codexModel'/);
  });

  // And it no longer carries either model list, in either engine's spelling, so
  // there is nothing left on that screen for a refactor to re-attach a control
  // to.
  it('carries no model list of its own', () => {
    expect(settings).not.toMatch(/claude-opus-5/);
    expect(settings).not.toMatch(/gpt-5/);
    expect(settings).not.toContain("label: 'The CLI default'");
  });
});

/* ================== the card answers it, and it is the fact =============== */

describe('the new task card', () => {
  // The two localStorage keys are what using what is already set means in
  // practice: the second card opens on what the first one ran on.
  it('remembers both choices between cards', () => {
    expect(compose).toContain('writeLastEngine');
    expect(compose).toContain('writeLastModel');
  });

  it('sends the model on every Claude Code card, default included', () => {
    expect(compose).toContain("...(engine === 'codex'");
    expect(compose).toContain('{ model: model ?? DEFAULT_MODEL }');
  });

  // And the first card of all lands on Claude Code and Opus, which is what the
  // founder asked the standard to be.
  it('starts on Claude Code and Opus', () => {
    expect(DEFAULT_ENGINE).toBe('claude');
    expect(DEFAULT_MODEL).toBe('opus');
  });

  // The Codex branch is untouched: a pick that IS Codex's own default reads as
  // no pick and sends nothing.
  it('still sends nothing for a Codex card left on its own default', () => {
    expect(compose).toContain('engineModelPicked(engine, model, codexModelDefault ?? null)');
    expect(engineModelPicked('codex', CODEX_OWN, null)).toBe(false);
    expect(engineModelPicked('codex', 'gpt-5.6-sol', 'gpt-5.6-sol')).toBe(false);
    expect(engineModelPicked('codex', 'gpt-5.5', 'gpt-5.6-sol')).toBe(true);
  });
});

/* ================ and the word reaches the command line =================== */
// The other end of it: a row carrying `opus` rewrites the workspace flag rather
// than landing beside it, which is the rule `spawnPlan` has always used.

describe('a row that names the default model', () => {
  it('replaces whatever --model the config was carrying', () => {
    expect(setModelArg(['--model', 'sonnet', '--verbose'], DEFAULT_MODEL))
      .toEqual(['--model', 'opus', '--verbose']);
    expect(setModelArg(['--model=sonnet', '--verbose'], DEFAULT_MODEL))
      .toEqual(['--model', 'opus', '--verbose']);
  });

  it('writes the flag on a config that had none', () => {
    expect(setModelArg(['--verbose'], DEFAULT_MODEL)).toEqual(['--model', 'opus', '--verbose']);
  });
});
