// THE NAMES IN HER MODEL PICKER FOLLOW THE CLAUDE CODE INSTALLED ON HER MAC.
//
// WHAT WAS ALREADY TRUE AND IS NOT WHAT BROKE. Agentbox spawns Claude Code with an
// ALIAS (`--model opus`), so the RUN has always been on whatever Opus is on the
// day it starts. Nothing here changes that and nothing here should.
//
// WHAT BROKE IS THE WORD ON THE SCREEN. The picker's labels came out of
// `shared/claude-models.generated.mjs`, written by
// `scripts/read-claude-models.mjs` while Agentbox was being BUILT. That file
// exists to stop a typed label drifting from the model that runs and it does,
// in one direction only: a table frozen at build time cannot see her run
// `claude update`.
//
// MEASURED 2026-09-22, and this is the fixture below. Her Claude Code was
// 2.1.270, whose catalog resolves `opus` to `claude-opus-5`. 2.1.280, published
// that week, resolves `opus` to `claude-opus-5-5`, display name "Opus 5.5". Her
// picker would have gone on saying "Opus 5" while her runs were on 5.5, which is
// the exact mix-up she asked us to make impossible.
//
// THE FIXTURE IS REAL, in the way tests/fixtures/codex-models-cache.json is
// real: `tests/fixtures/claude-catalog-2.1.280.txt` is carved verbatim out of
// @anthropic-ai/claude-code-darwin-arm64@2.1.280, every model record and the
// alias table, with the 198 MB of binary between them dropped. Nothing in it was
// typed by hand. The reader walks a file looking for those two shapes, so a file
// holding only those two shapes exercises it exactly.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeModels, claudeModelRows, forget, readAliases, rowsFrom, scan } from '../main/claude-models.mjs';
import { CLAUDE_MODELS } from '../shared/claude-models.generated.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_2_1_280 = fs.readFileSync(path.join(HERE, 'fixtures', 'claude-catalog-2.1.280.txt'), 'utf8');

/** A file with a catalog in it, written somewhere a test may write. */
function binWith(text, { name = 'claude' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-models-'));
  const at = path.join(dir, name);
  fs.writeFileSync(at, text);
  return at;
}

beforeEach(() => { forget(); });

describe('the models she is offered come off the Claude Code she has', () => {
  it('says Opus 5.5 when the installed CLI resolves opus to Opus 5.5', () => {
    const { models, source } = claudeModels({ bin: binWith(CATALOG_2_1_280) });
    expect(source).toBe('cli');
    expect(models.find((m) => m.alias === 'opus')).toEqual({
      alias: 'opus', id: 'claude-opus-5-5', label: 'Opus 5.5', defaultLevel: 'medium',
    });
  });

  // HER ORDER, AND EACH ONE FOLLOWED BY THE MODEL BEFORE IT. 'Lets go with
  // this option, for both Claude and Codex (shows the viable options).'
  //
  // The newest row sends the ALIAS, so a card set to it never goes stale. The
  // row under it sends the EXACT id, which is the only way to pin a version.
  it('keeps her order, each with the one before it', () => {
    const { models } = claudeModels({ bin: binWith(CATALOG_2_1_280) });
    expect(models.map((m) => [m.alias, m.label])).toEqual([
      ['opus', 'Opus 5.5'], ['claude-opus-5', 'Opus 5'],
      ['sonnet', 'Sonnet 5'], ['claude-sonnet-4-6', 'Sonnet 4.6'],
      ['haiku', 'Haiku 4.5'], ['claude-3-5-haiku', 'Haiku 3.5'],
      ['fable', 'Fable 5.1'], ['claude-fable-5', 'Fable 5'],
    ]);
  });

  it('never invents a name: an alias the catalog does not name is left out', () => {
    // Everything 2.1.280 says, except that `opus` now points somewhere with no
    // display_name of its own. A row reading "claude-opus-6" is a guess wearing
    // a label, which is the failure was filed about.
    const text = CATALOG_2_1_280.replace('opus:"claude-opus-5-5"', 'opus:"claude-opus-6"');
    const { models } = claudeModels({ bin: binWith(text) });
    expect(models.map((m) => m.alias)).not.toContain('opus');
    expect(models.map((m) => m.label)).not.toContain('claude-opus-6');
  });

  it('OFFERS A FAMILY THAT DID NOT EXIST WHEN AGENTBOX WAS BUILT, after hers', () => {
    // This is the auto-update half of her question. `WANTED` in the build script
    // is a typed list of four families, so a fifth one could never appear on its
    // own. Here every alias the CLI resolves is offered; hers stay first.
    //
    // Mythos is in 2.1.280's catalog already and is NOT in its alias table, which
    // is why this adds one rather than asserting on Mythos: an unaliased model is
    // correctly absent.
    const text = CATALOG_2_1_280.replace('latest_per_family:{', 'latest_per_family:{mythos:"claude-mythos-5",');
    const { models } = claudeModels({ bin: binWith(text) });
    expect(models.filter((m) => !m.alias.startsWith('claude-')).map((m) => m.alias))
      .toEqual(['opus', 'sonnet', 'haiku', 'fable', 'mythos']);
        // Mythos 5 is the first of its family in the catalog, so it has nothing
    // before it and contributes one row rather than a duplicate.
    expect(models.at(-1)).toEqual({ alias: 'mythos', id: 'claude-mythos-5', label: 'Mythos 5', defaultLevel: null });
  });
});

describe('the committed table is the floor, never an empty picker', () => {
  const built = CLAUDE_MODELS.map((m) => ({ alias: m.alias, id: m.id, label: m.label }));

  it('falls back on a Mac with no Claude Code', () => {
    expect(claudeModels({ bin: null })).toMatchObject({ models: built, source: 'built' });
  });

  it('falls back when the path is gone', () => {
    expect(claudeModels({ bin: '/no/such/claude' })).toMatchObject({ models: built, source: 'built' });
  });

  it('falls back when the binary carries no catalog this can read', () => {
    // A future Claude Code that keeps its models somewhere else. The picker is
    // then a release behind, which is survivable; an empty picker is not, because
    // she cannot send a task at all.
    expect(claudeModels({ bin: binWith('nothing in here looks like a model catalog') }))
      .toMatchObject({ models: built, source: 'built' });
  });
});

describe('it is cached against the binary, not against a clock', () => {
  it('re-reads after the file changes, which is what `claude update` does', () => {
    const at = binWith(CATALOG_2_1_280);
    expect(claudeModelRows({ bin: at }).find((m) => m.alias === 'opus').label).toBe('Opus 5.5');
    // The same call again is the cached one.
    expect(claudeModelRows({ bin: at }).find((m) => m.alias === 'opus').label).toBe('Opus 5.5');
    // Now the CLI is replaced in place, as an update does.
    fs.writeFileSync(at, CATALOG_2_1_280.replace('opus:"claude-opus-5-5"', 'opus:"claude-opus-5"'));
    fs.utimesSync(at, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    expect(claudeModelRows({ bin: at }).find((m) => m.alias === 'opus').label).toBe('Opus 5');
  });
});

describe('the reading itself', () => {
  it('reads the alias table', () => {
    expect(readAliases(CATALOG_2_1_280)).toEqual({
      fable: 'claude-fable-5-1', opus: 'claude-opus-5-5',
      sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5',
    });
  });

  it('answers null rather than a guess when there is no alias table', () => {
    expect(rowsFrom(scan(binWith('id:"claude-opus-5-5",family:"opus",display_name:"Opus 5.5"')))).toBe(null);
  });

  it('finds a catalog that straddles a chunk boundary', () => {
    // The real binary is ~200 MB and is walked in 8 MB chunks with an overlap
    // longer than any record. A record split across two reads would otherwise be
    // the one record missed, so the walk is driven here at a chunk size small
    // enough to put the split inside the catalog on purpose.
    const at = binWith('x'.repeat(600) + CATALOG_2_1_280);
    const rows = rowsFrom(scan(at, { chunk: 128 }));
    expect(rows.map((m) => m.label))
      .toEqual(['Opus 5.5', 'Opus 5', 'Sonnet 5', 'Sonnet 4.6', 'Haiku 4.5', 'Haiku 3.5', 'Fable 5.1', 'Fable 5']);
  });
});
