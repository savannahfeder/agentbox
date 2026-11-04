// A REPLY CAN WAIT FOR A TIME, the way a new thread already could.
//
// What broke (w-54cdf7c768, 2026-10-28): the reply box had one button, Send,
// and it went now. Someone with an answer written and a reason not to start
// the agent yet (a limit that resets in the morning, a day off) had to keep
// the words in the box and come back. The new thread card has had Send later
// since w-e731ca9376.
//
// Measured by reading the reply path end to end: the box's `onSend` carried no
// time, `answerWith` had no way to hold a reply, `zero:answer` had no field
// for one, the phone's reply command dropped anything it did not list, and
// `deliverMidflightReply` would start a run on a reply the moment the run
// before it ended, whatever time the row was set for.
//
// The store already holds the rule this leans on: a row whose `runAt` is ahead
// is not due, and nothing starts on it (shared/work-items.mjs isDue). So a
// reply that waits is the reply written now with the row set for its time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitReply } from '../main/live-replies.mts';
import { Supervisor } from '../main/supervisor.mts';
import { isDue } from '../shared/work-items.mjs';
import { applyThrough } from '../main/phone-inbox.mts';
import { commandFor, phoneSlug } from '../renderer/src/phone-rows';
import { phoneChoices } from '../shared/phone-snapshot.mjs';
import { clearDraft, readDraftWhen, restoreDraft, saveDraft, saveDraftWhen, readDraft } from '../renderer/src/drafts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SentLine } from '../renderer/src/components/SentLine.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('a reply set for later never reaches a running agent early', () => {
  const running = () => {
    const sent = [];
    const s = { sessions: new Map([['w', { product: 'p', child: { steer: async (t) => { sent.push(t); } } }]]), _handledAnswers: new Set(), _answerKey: (i) => i.answer, _saveState() {} };
    return { s, sent };
  };

  it('is written down and not handed to the session that is working', async () => {
    const { s, sent } = running();
    let saved = 0;
    await submitReply(s, { product: 'p', id: 'w', answer: 'carry on tomorrow', later: true }, () => { saved += 1; return { answer: 'carry on tomorrow' }; });
    expect(sent).toEqual([]);
    expect(saved).toBe(1);
    expect(s._handledAnswers.size).toBe(0);
  });

  it('a reply for now still goes straight in', async () => {
    const { s, sent } = running();
    await submitReply(s, { product: 'p', id: 'w', answer: 'carry on' }, () => ({ answer: 'carry on' }));
    expect(sent).toHaveLength(1);
  });
});

describe('the run before it ending does not start it early', () => {
  const NOW = Date.now();
  let reopened;
  const probe = (after) => {
    reopened = [];
    const s = Object.create(Supervisor.prototype);
    s.store = { listItems: () => [after], isDue, answerItem: (product, id, patch) => reopened.push([product, id, patch]) };
    s.sessions = new Map(); s._handledAnswers = new Set(); s._saveState = () => {}; s.spawned = [];
    s.spawnWorker = (item) => s.spawned.push(item);
    s.deliverMidflightReply({ id: 'w', product: 'p', answer: 'old', wrote: { answer: { ts: 1 } } }, 'old');
    return s.spawned;
  };
  const reply = { id: 'w', product: 'p', answer: 'start on the second layout', status: 'blocked', wrote: { answer: { ts: 2 } } };

  it('waits while the row is set for later', () => {
    expect(probe({ ...reply, runAt: NOW + 3_600_000 })).toHaveLength(0);
    expect(reopened).toEqual([]);
  });

  it('opens a row the run closed meanwhile, so its time still comes', () => {
    expect(probe({ ...reply, status: 'done', runAt: NOW + 3_600_000 })).toHaveLength(0);
    expect(reopened).toEqual([['p', 'w', { status: 'open' }]]);
  });

  it('starts once that time has come', () => {
    expect(probe({ ...reply, runAt: NOW - 1 })).toHaveLength(1);
  });

  it('starts at once when nothing is set, as it always did', () => {
    expect(probe(reply)).toHaveLength(1);
  });
});

describe('the window\'s handler', () => {
  const ipc = src('main/ipc.mts');
  const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:answer'"), ipc.indexOf('ipcMain.handle(', ipc.indexOf("ipcMain.handle('zero:answer'") + 10));

  it('takes a time with the reply', () => {
    expect(handler).toMatch(/runAt[,\s}]/);
  });

  // Two power testers on 2026-11-04 set a reply for later and watched the
  // agent start on it at once. Main had learned that a word said after a
  // thread's moment runs now (shared/answers.mjs, wordWaits), and this handler
  // wrote the moment first and the words after it. The reply's own time is
  // written after its words now, in the same synchronous step.
  it('writes the words, then their time, with nothing between them', () => {
    const commit = handler.slice(handler.indexOf('submitReply('), handler.indexOf('\n    });', handler.indexOf('submitReply(')));
    const words = commit.indexOf('store.answerItem(');
    const time = commit.indexOf('store.scheduleItem(product, id, Number(runAt))');
    expect(words).toBeGreaterThan(-1);
    expect(time).toBeGreaterThan(words);
    expect(commit.slice(words, time)).not.toMatch(/await/);
  });

  it('so a reply with its own time waits, and a word said after a moment still runs now', () => {
    const ahead = Date.now() + 3_600_000;
    const row = (answerTs, runAtTs) => ({
      status: 'open', answer: 'carry on tomorrow', runAt: ahead,
      wrote: { answer: { ts: answerTs, source: 'founder' }, runAt: { ts: runAtTs, source: 'founder' } },
    });
    expect(isDue(row(1_000, 1_001))).toBe(false);
    expect(isDue(row(1_000, 1_000))).toBe(false);
    expect(isDue(row(61_000, 1_000))).toBe(true);
  });

  it('tells the live path to leave it alone', () => {
    expect(handler).toMatch(/submitReply\(supervisor,\s*\{[^}]*later[^}]*\}/);
  });
});

describe('from the phone', () => {
  const A = phoneSlug('a1b2c3d4e5f6', 'alpha');
  const AT = Date.now() + 86_400_000;

  it('the reply carries its time', () => {
    expect(commandFor('zero:answer', { product: A, id: 'w-1', answer: 'go', runAt: AT }).payload).toEqual({ text: 'go', runAt: AT });
  });

  it('only a time of the right shape', () => {
    expect(phoneChoices('reply', { runAt: 'tomorrow' })).toEqual({});
    expect(phoneChoices('reply', { runAt: -5 })).toEqual({});
  });

  it('reaches the window\'s handler with it, and leaves the row set for that time', async () => {
    const calls = [];
    const channels = new Map(['zero:answer', 'zero:schedule'].map((c) => [c, async (_e, args) => { calls.push([c, args]); return { ok: true }; }]));
    await applyThrough(channels)({ id: 'c9', kind: 'reply', project: 'alpha', item: 'w-1', payload: { text: 'go', runAt: AT, unschedule: true } });
    expect(calls).toEqual([['zero:answer', { product: 'alpha', id: 'w-1', answer: 'go', fromPhone: 'c9', runAt: AT }]]);
  });

  it('the phone does not mark a reply that waits as one that clears the schedule', () => {
    expect(src('renderer/src/phone-send.ts')).toMatch(/scheduled\(payload\) && !\(Number\(payload\?\.runAt\) > Date\.now\(\)\)/);
  });
});

describe('the box keeps the time with the words', () => {
  const item = { product: 'p', id: 'w-1' };
  const AT = Date.now() + 86_400_000;

  it('saves it and reads it back', () => {
    const store = memoryStore();
    saveDraftWhen(item, AT, store);
    expect(readDraftWhen(item, store)).toBe(AT);
  });

  it('forgets a time that has gone by', () => {
    const store = memoryStore();
    saveDraftWhen(item, Date.now() - 1, store);
    expect(readDraftWhen(item, store)).toBe(0);
  });

  it('goes when the draft goes', () => {
    const store = memoryStore();
    saveDraft(item, 'words', store);
    saveDraftWhen(item, AT, store);
    clearDraft(item, store);
    expect(readDraftWhen(item, store)).toBe(0);
  });

  it('Z on a reply set for later puts the words back with the time', () => {
    const store = memoryStore();
    expect(restoreDraft(item, 'Go with the second layout', [], store, AT)).toBe(true);
    expect(readDraft(item, store)).toBe('Go with the second layout');
    expect(readDraftWhen(item, store)).toBe(AT);
  });

  it('a reply for now comes back with no time', () => {
    const store = memoryStore();
    restoreDraft(item, 'Go', [], store);
    expect(readDraftWhen(item, store)).toBe(0);
  });
});

describe('the line above the reply box after a send', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(SentLine, { title: 'Everything Else page redesign', undoes: true, onBack: () => {}, onUndo: () => {}, onClose: () => {}, ...props }));

  it('says when a reply set for later goes', () => {
    const html = draw({ at: 'Thu 8:00' });
    expect(html).toContain('Sends Thu 8:00 to');
    expect(html).not.toContain('Sent to');
  });

  it('still says Sent to for a reply that went now', () => {
    expect(draw({})).toContain('Sent to');
    expect(draw({ at: null })).toContain('Sent to');
  });
});

describe('the reply box and the app', () => {
  const focus = src('renderer/src/components/Focus.tsx');
  const app = src('renderer/src/App.tsx');
  const answerWith = app.slice(app.indexOf('const answerWith = useCallback'), app.indexOf('answerWithRef.current = answerWith'));

  it('the box hands its time to the send', () => {
    expect(focus).toMatch(/onSend\([^;]*sendAt[^;]*\);/);
  });

  it('a reply set for later is not handed to a running agent', () => {
    expect(answerWith).toMatch(/const later = /);
    expect(answerWith).toMatch(/const isRunning = running && !later;\s*const runStays = later && running;\s*if \(isRunning\) \{/);
  });

  it('it writes the time with the words, and does not clear it the way a reply for now does', () => {
    expect(answerWith).toMatch(/\.\.\.\(later \? \{ runAt \} : \{\}\)/);
    expect(answerWith).toMatch(/if \(wasScheduled && !later\)/);
  });

  it('Z puts back the time the row had before', () => {
    expect(answerWith).toMatch(/if \(later \|\| waiting\) await api\.schedule\(\{ product: item\.product, id: item\.id, runAt: priorRunAt \}\)/);
  });

  // A reply for later started nothing, so its Z has nothing of its own to stop.
  it('Z on a reply set for later leaves an agent already working on the thread running', () => {
    const undo = answerWith.slice(answerWith.indexOf('pushUndo({'));
    expect(undo).toMatch(/if \(!runStays\) await \(window\.zero as any\)\?\.stopSession\?\./);
    expect(undo).toMatch(/\.\.\.\(runStays \? \{ answer: '\(withdrawn\)' \} : withdrawReply\(item\.status\)\)/);
  });

  it('the line that says where it went names the time it goes', () => {
    expect(answerWith).toMatch(/\{ product: item\.product, id: item\.id, \.\.\.\(later \? \{ at: laterHint\(runAt!\) \} : \{\}\) \}, undid/);
    const drawn = app.slice(app.indexOf('<SentLine'), app.indexOf('/>', app.indexOf('<SentLine')));
    expect(drawn).toContain('at={toast.goes.at}');
  });

  it('Z on a reply for now still stops the agent it started', () => {
    const undo = answerWith.slice(answerWith.indexOf('pushUndo({'));
    expect(undo).toMatch(/stopSession\?\.\(\{ product: item\.product, id: item\.id, withdraw: true \}\)/);
  });
});

// A power tester on 2026-11-04 picked Opus in the reply box, set Fri 9:00,
// sent, and pressed Z: the words and the time came back, the model did not,
// and Send would have gone on Sonnet.
describe('Z after Send brings back the model picked for the reply too', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const item = { product: 'p', id: 'w-1' };

  it('keeps the pick with the words', async () => {
    const { readDraftPick } = await import('../renderer/src/drafts');
    const s = store();
    expect(restoreDraft(item, 'redo all three', [], s, 0, { model: 'opus', effort: 'high', engine: 'claude' })).toBe(true);
    expect(readDraftPick(item, s)).toEqual({ model: 'opus', effort: 'high', engine: 'claude' });
  });

  it('leaves the pick alone when none was made', async () => {
    const { readDraftPick } = await import('../renderer/src/drafts');
    const s = store();
    restoreDraft(item, 'redo all three', [], s);
    expect(readDraftPick(item, s)).toBeNull();
  });

  it('the undo hands the pick over, and an open box reads it back', () => {
    expect(src('renderer/src/App.tsx')).toMatch(/wordsBackInTheBox\(item, sent\?\.words \?\? text, sent\?\.attachments \?\? \[\], keepsTime, pick\)/);
    const focus = src('renderer/src/components/Focus.tsx');
    const from = focus.indexOf('const restored = (event: Event)');
    const restored = focus.slice(from, focus.indexOf("window.addEventListener('zero:reply-restored'", from));
    expect(restored).toMatch(/replyOpensOn\(item, readDraftPick\(item\)\)/);
  });
});
