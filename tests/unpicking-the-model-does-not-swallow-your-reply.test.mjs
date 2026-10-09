// THE MOST COMMON CRASH OF LAUNCH WEEK, AND IT ATE THE MESSAGE.
//
// Measured in PostHog on 2026-10-08, every `crash_report` since the Oct 6
// launch: 5 of the 14 real crashes are one renderer error, on two installs, one
// of them five times. Scrubbed, it reads
//
//   Error invoking remote method '<str>': Error: patch had no recognized
//   work item fields
//
// which is `buildLine` in shared/work-items.mjs refusing a patch that
// `pickFields` emptied.
//
// HOW IT HAPPENS, from the reply box. The drawer hands its pick back as `null`
// for "nothing chosen" (ModelPicker's `onChange(id === fallback ? null : id)`,
// and `onEffortChange(e.id === effort ? null : e.id)`), and Focus.tsx sends
// `{ model, effort }` whenever the drawer was TOUCHED at all. `answerItem`
// turns a null into `''` on purpose — that is how "no model" is said
// everywhere else, because `modelForEngine` reads the empty string as nothing
// chosen. But `coerceField` ran both through `str()`, which drops an empty
// string, so `pickFields({ effort: '' })` was null and `buildLine` threw.
//
// So it fires on the ORDINARY case, not an exotic one: open the drawer, pick
// any model, and `effort` goes out as null beside it. And because `answerItem`
// writes the model first, deliberately, the throw lands BEFORE the answer is
// written. The reply is gone. The person typed a message, pressed send, and the
// app told them nothing.
//
// Why no test caught it: changing-the-model-of-a-conversation.test.mjs already
// pins "clears it back to the engine's own choice when she unpicks", and passes,
// because its fake `updateWorkItem` spreads the fields straight onto the item.
// The one layer that throws is the one the fake stands in for. So this file
// drives the REAL writer against a real ledger on disk.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import * as workItemsDisk from '../main/store/work-items.mjs';
import { buildLine, foldWorkItems, pickFields } from '../shared/work-items.mjs';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-unpick-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

// `answerItem` over the real on-disk writer, which is the layer that threw.
function answer(start, patch) {
  const item = workItemsDisk.createWorkItem(dir, { title: 'a row', ...start });
  const store = { modules: { workItemsDisk }, productDir: () => dir };
  Store.prototype.answerItem.call(store, 'p', item.id, patch);
  return workItemsDisk.readWorkItem(dir, item.id);
}

describe('the empty string is a real value for the two fields that are cleared', () => {
  // THE BOUNDARY ON THE BUG'S SIDE. These two are cleared by writing '' and so
  // an empty string has to survive `pickFields`.
  it('keeps a cleared model', () => {
    expect(pickFields({ model: '' })).toEqual({ model: '' });
  });

  it('keeps a cleared level', () => {
    expect(pickFields({ effort: '' })).toEqual({ effort: '' });
  });

  it('keeps a cleared model beside a real answer', () => {
    expect(pickFields({ answer: 'carry on', model: '' })).toEqual({ answer: 'carry on', model: '' });
  });

  // Whitespace is somebody holding the space bar, not a value, and it clears
  // for the same reason '' does rather than being stored as ' '.
  it('treats whitespace as a clear, not as a model called space', () => {
    expect(pickFields({ model: '   ' })).toEqual({ model: '' });
  });

  it('does not throw when the whole patch is a clear', () => {
    expect(() => buildLine({ id: 'w-abcdef', patch: { effort: '' }, source: 'founder' })).not.toThrow();
  });

  // THE BOUNDARY ON THE OTHER SIDE, and the reason this is not a change to
  // `str`: every other text field still treats empty as nothing said. A blank
  // title is not a row called '' and a blank note is not a note.
  it('still drops an empty title, note, body, answer and result', () => {
    expect(pickFields({ title: '' })).toBe(null);
    expect(pickFields({ note: '  ' })).toBe(null);
    expect(pickFields({ body: '' })).toBe(null);
    expect(pickFields({ answer: '' })).toBe(null);
    expect(pickFields({ result: '' })).toBe(null);
  });

  // AND THE CASE THAT MUST STILL FAIL. A patch with nothing in it that this
  // module recognises is still a caller's bug, and still says so.
  it('still refuses a patch that recognises nothing at all', () => {
    expect(pickFields({})).toBe(null);
    expect(pickFields({ nonsense: 'x' })).toBe(null);
    expect(() => buildLine({ id: 'w-abcdef', patch: { nonsense: 'x' }, source: 'founder' }))
      .toThrow(/no recognized work item fields/);
  });

  // Non-strings are not a clear. `null` reaching this module at all would be a
  // caller that skipped `answerItem`, and it is dropped rather than guessed at.
  it('does not read a null or a number as a clear', () => {
    expect(pickFields({ model: null })).toBe(null);
    expect(pickFields({ effort: 7 })).toBe(null);
  });
});

describe('a reply sent from a touched drawer still lands', () => {
  // THE REPORTED ONE, in the shape the reply box actually sends it: open the
  // drawer, pick a model, and `effort` rides along as null.
  it('keeps the answer when a model is picked and no level is', () => {
    const item = answer({}, { answer: 'carry on', model: 'opus', effort: null });
    expect(item.answer).toBe('carry on');
    expect(item.model).toBe('opus');
    expect(item.effort).toBe('');
  });

  // Unpicking the model back to the engine's own choice.
  it('keeps the answer when the model is unpicked', () => {
    const item = answer({ model: 'opus' }, { answer: 'carry on', model: null, effort: null });
    expect(item.answer).toBe('carry on');
    expect(item.model).toBe('');
  });

  // And the level toggled off on its own, which is the other null the drawer
  // can produce.
  it('keeps the answer when only the level is unpicked', () => {
    const item = answer({ model: 'opus', effort: 'high' }, { answer: 'carry on', model: 'opus', effort: null });
    expect(item.answer).toBe('carry on');
    expect(item.model).toBe('opus');
    expect(item.effort).toBe('');
  });

  // THE CASE THAT MUST NOT CHANGE: an untouched drawer still writes neither,
  // so a box that is merely displaying a model does not overwrite the row's.
  it('leaves both alone when the drawer was never opened', () => {
    const item = answer({ model: 'opus', effort: 'high' }, { answer: 'carry on' });
    expect(item.answer).toBe('carry on');
    expect(item.model).toBe('opus');
    expect(item.effort).toBe('high');
  });
});

describe('a cleared field reads back as cleared, not as the old value', () => {
  // The fold holds one value per field and the newest writer owns it. A clear
  // that folded away would leave the row running on a model the picker is no
  // longer showing, which is the same lie from the other direction.
  it('folds a later clear over an earlier pick', () => {
    const lines = [
      buildLine({ id: 'w-abcdef', patch: { title: 'a row', model: 'opus' }, source: 'founder', now: 1000 }),
      buildLine({ id: 'w-abcdef', patch: { model: '' }, source: 'founder', now: 2000 }),
    ];
    expect(foldWorkItems(lines, 3000).get('w-abcdef').model).toBe('');
  });
});
