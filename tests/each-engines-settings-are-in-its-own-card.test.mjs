// A SETTING CANNOT BE ABOUT THE OTHER ENGINE IF IT IS INSIDE THIS ENGINE'S CARD.
//
// This file was `the-model-row-lives-in-its-engines-card.test.mjs`, and before
// that `the-model-row-belongs-to-the-agent-named-above-it.test.mjs`. The history
// is worth keeping, because the same defect was reported three times and fixed
// twice badly. A row labelled "Model" under a picker labelled "Coding agent" is
// ambiguous no matter how the sentence beneath it is worded, because the
// ambiguity is positional; the answer on 2026-09-23 was one card per engine,
// with each engine's controls inside it.
//
// AND THEN THE MODEL WENT OFF THE PAGE ALTOGETHER (w-12081d32cc, the same day).
// The new task card asks which coding agent and which model a run goes out on,
// keeps both answers between cards, and is the only place either is asked now,
// so the rows this file used to locate no longer exist anywhere. What is left of
// the law is the half that still has controls under it: Codex's modes and Claude
// Code's permissions live in their own cards, and nothing engine-specific is
// loose on the page where position can lie about it again.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

/**
 * The `settings` slot handed to the cards, which is where every engine-specific
 *  control lives, and its two halves. Slicing it rather than the whole file is
 *  what makes "inside the card" a claim a test can fail.
 */
const cards = settings.slice(
  settings.indexOf("settings={a.engine === 'codex' ? ("),
  settings.indexOf('{/* THE CODING AGENT IS CHOSEN ON THE CARD'),
);
const SEP = ') : (\n                    <>';
const codexSide = cards.slice(0, cards.indexOf(SEP));
const claudeSide = cards.slice(cards.indexOf(SEP));

/** Everything drawn OUTSIDE the cards, for the claims about what is not loose. */
const loose = settings.slice(settings.indexOf('{/* THE CODING AGENT IS CHOSEN ON THE CARD'));

/* ===================== the controls are inside the cards ================= */

describe('each engine\'s settings are in its own card', () => {
  it('hands the card a settings slot, chosen by the engine the card is for', () => {
    expect(settings).toContain("settings={a.engine === 'codex' ? (");
    // And the card only draws it where the engine is actually installed.
    expect(settings).toContain('{agent.found && settings && <div className="ac-settings">{settings}</div>}');
  });

  it('puts Codex\'s modes on the Codex side only', () => {
    expect(codexSide).toContain('options={CODEX_MODE_OPTIONS}');
    expect(codexSide).not.toContain('options={PERMISSION_OPTIONS}');
  });

  it('puts Claude Code\'s six modes on the Claude Code side only', () => {
    expect(claudeSide).toContain('options={PERMISSION_OPTIONS}');
    expect(claudeSide).not.toContain('options={CODEX_MODE_OPTIONS}');
  });

  // THE POINT OF THE WHOLE MOVE. Nothing engine-specific is left on the page
  // where being next to something can imply whose it is.
  it('leaves no engine-specific control loose on the page', () => {
    expect(loose).not.toContain('options={PERMISSION_OPTIONS}');
    expect(loose).not.toContain('options={CODEX_MODE_OPTIONS}');
  });

  // And the branch that used to make one row mean two things is gone, rather
  // than left behind unreferenced.
  it('no longer switches one row on the chosen engine', () => {
    expect(settings).not.toContain("w.engine !== 'codex' ? (");
  });
});

/* =============== and neither model row came back with them =============== */

describe('the model is asked on the card and not in either card here', () => {
  it('draws no model row on either side', () => {
    expect(cards).not.toContain('<div className="set-row-label">Model</div>');
    expect(codexSide).not.toContain('codexModelRows');
    expect(claudeSide).not.toContain('modelOptions(w.model)');
  });

  it('writes neither model setting from this screen', () => {
    expect(settings).not.toMatch(/setWorkspace\('model'/);
    expect(settings).not.toMatch(/setWorkspace\('codexModel'/);
  });
});

/* ================= the mode picker never depended on a cache ============= */

describe('a Codex this Mac has no model list for', () => {
  // The model row used to be behind a count of what this Mac could offer. The
  // mode picker never was, because its three choices exist wherever Codex does,
  // and that is still true with the model row gone.
  it('still draws the mode picker unconditionally', () => {
    expect(codexSide).toContain('options={CODEX_MODE_OPTIONS}');
    expect(codexSide).not.toContain('codexModelRows.length > 1 &&');
  });
});
