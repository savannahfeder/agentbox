// Z RIGHT AFTER MAKING A TASK TAKES THAT TASK BACK, and a Z that cannot do
// what it says is never silent (w-c78d1e1607).
//
// What she saw: she made a new task, pressed Z and nothing happened, pressed Z
// again and the reply she had sent on an older task was withdrawn instead.
//
// Measured on 2026-10-04 against a throwaway store: `store.composeItem` handed
// back the new row with `product: undefined`, because it returned the raw fold
// of the ledger, which never carries its project (only `readItem` and
// `listItems` stamp one on). The undo pushed for the send withdraws with
// `api.answer({ product: made.product, ... })`, so it asked the store for
// "no such product: undefined" and threw. `undo` in App.tsx had already taken
// the entry off the pile before running it, and a throw from `run` skipped the
// toast, so the first Z dropped the new task's way back with no word on screen
// and the second Z reached the reply underneath it.
//
// Two halves, both guarded: the store answers with the project, and a Z whose
// undo fails puts the entry back and says so.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

let root, store;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  for (const slug of ['kestrel', 'other']) {
    const dir = path.join(root, slug);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug }));
  }
  store = await new Store({ accountRoot: root, products: [] }).init();
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the task a send hands back', () => {
  it('names the project it was made in, which is what the undo withdraws it from', () => {
    const made = store.composeItem('kestrel', { title: 'Look at the slow download button' });
    expect(made.id).toMatch(/^w-/);
    expect(made.product).toBe('kestrel');
  });

  it('names the right one of two projects, not merely some project', () => {
    const made = store.composeItem('other', { title: 'Another task' });
    expect(made.product).toBe('other');
  });

  it('can be withdrawn with exactly what it handed back, the way Z does it', () => {
    const made = store.composeItem('kestrel', { title: 'Take me back' });
    store.answerItem(made.product, made.id, { status: 'done' });
    expect(store.readItem('kestrel', made.id).status).toBe('done');
  });

  it('a withdraw with no project is still refused, so the store never guesses one', () => {
    const made = store.composeItem('kestrel', { title: 'Stay put' });
    expect(() => store.answerItem(undefined, made.id, { status: 'done' })).toThrow();
    expect(store.readItem('kestrel', made.id).status).toBe('open');
  });
});

describe('a Z whose undo fails', () => {
  const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');
  const undo = app.slice(app.indexOf('const undo = useCallback('), app.indexOf('/* ------------------------------- keyboard'));

  it('catches the failure rather than letting it end the press in silence', () => {
    expect(undo).toMatch(/try \{\s*\n\s*await last\.run\(\);\s*\n\s*\} catch \(err\) \{/);
  });

  it('puts the entry back on the pile, so the next Z does not reach past it', () => {
    const caught = undo.slice(undo.indexOf('} catch (err) {'));
    expect(caught).toMatch(/setUndoStack\(\(u\) => \[\.\.\.u, last\]\)/);
  });

  it('says out loud that it could not be undone', () => {
    const caught = undo.slice(undo.indexOf('} catch (err) {'));
    expect(caught).toMatch(/showToast\(`Could not undo that/);
    expect(caught.indexOf('return;')).toBeGreaterThan(-1);
  });
});
