// A thread begun on one coding agent could not be moved to the other.
//
// The reply box's drawer lists the models of the engine the row is already on,
// so from a Claude Code thread there was no road to Codex anywhere in the app,
// and ⌘K — where both power testers looked — had no model rows at all
// (power-test-2, issues 39 and 40). "That is what I'd reach for when Claude
// runs out."
//
// `engine` was already on the row: `composeItem` writes it and the supervisor
// reads it per run. The answer path was simply dropping it on the floor, the
// way it once dropped it from compose.

import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';

let store, item;

beforeEach(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-switch-'));
  const dir = path.join(root, 'p');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Example' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
  item = store.composeItem('p', { title: 'Diff two eval result files', engine: 'claude', model: 'opus' });
});

describe('a reply that names the other engine', () => {
  it('moves the thread to it', () => {
    store.answerItem('p', item.id, { engine: 'codex', model: 'gpt-6.1-sol' });
    const row = store.readItem('p', item.id);
    expect(row.engine).toBe('codex');
    expect(row.model).toBe('gpt-6.1-sol');
  });

  it('is written on your authority, so a worker cannot put it back', () => {
    store.answerItem('p', item.id, { engine: 'codex' });
    expect(store.readItem('p', item.id).wrote.engine.source).toBe('founder');
  });

  it('leaves the engine alone when the drawer was never opened', () => {
    store.answerItem('p', item.id, { answer: 'carry on' });
    expect(store.readItem('p', item.id).engine).toBe('claude');
  });

  it('clears it back to the workspace default when asked to', () => {
    store.answerItem('p', item.id, { engine: null });
    expect(store.readItem('p', item.id).engine).toBe('');
  });

});

describe('where the engine is written', () => {
  // A reply on an idle row starts a run, and the run reads the engine off the
  // item; written after the answer it is a race the run can win, and you would
  // pick Codex and watch Claude Code take the thread. The model has sat above
  // the answer for that reason since launch week; the engine joins it there.
  it('is above the answer, where the model already is', () => {
    const source = fs.readFileSync(new URL('../main/store.mjs', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('answerItem(slug, id,'), source.indexOf('composeItem(slug,'));
    const engine = body.indexOf("{ engine: engine ?? '' }");
    expect(engine).toBeGreaterThan(-1);
    expect(engine).toBeLessThan(body.indexOf("{ model: model ?? '' }"));
    expect(engine).toBeLessThan(body.indexOf('if (answer) item ='));
  });
});
