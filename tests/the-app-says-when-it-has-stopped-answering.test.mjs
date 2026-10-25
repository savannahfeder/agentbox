// THE APP SAYS WHEN IT HAS STOPPED ANSWERING.
//
// What broke (power test 2). The app's own process was frozen for 135 seconds
// with the window still drawing, which is what a hung main process looks like.
// Three screens waited on it and none of them said so:
//
//   - a thread opened during the freeze sat on "Reading this conversation…"
//     across several looks (issue 25);
//   - a reload on top of it drew the boot screen, which is the app's name in
//     the faintest grey there is, for 90 seconds, and was reported as a blank
//     screen with nothing to press (issue 7);
//   - a new thread's send closed the card and went quiet for 2 to 3 minutes,
//     so the same task was sent twice and ran twice (issue 2).
//
// Nothing was lost in any of them. What was missing was a sentence. The words
// and the one number that decides when they are said are in
// renderer/src/not-answering.ts; this holds them, and holds the three screens
// to using them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME } from '../shared/product-name.mjs';
import { NOT_ANSWERING, NOT_ANSWERING_MS, RESTART_IT, RESTART_IT_MS, SEND_NOT_TAKEN } from '../renderer/src/not-answering';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');
const thread = src('components', 'Thread.tsx');
const itemThread = src('components', 'ItemThread.tsx');

describe('the sentences', () => {
  it('name the app, in plain words, at the length a glance takes', () => {
    for (const line of [NOT_ANSWERING, RESTART_IT, SEND_NOT_TAKEN]) {
      expect(line).toContain(NAME);
      expect(line.length).toBeLessThanOrEqual(80);
      // The house style for anything a person reads (CLAUDE.md, unslop).
      expect(line).not.toMatch(/—|…|:/);
      expect(line.trim()).toMatch(/\.$/);
    }
  });

  it('tells a send that is still going from one that is lost', () => {
    // The expensive mistake was sending the task again. The line has to say
    // the send is still happening, not merely that something is slow.
    expect(SEND_NOT_TAKEN).toMatch(/not lost/);
  });
});

describe('when they are said', () => {
  it('waits longer than any answer takes, and less than a person does', () => {
    // The slowest door is a phone through the relay, under two seconds.
    expect(NOT_ANSWERING_MS).toBeGreaterThanOrEqual(3_000);
    expect(NOT_ANSWERING_MS).toBeLessThanOrEqual(10_000);
  });

  it('offers the restart only once waiting has plainly failed', () => {
    // A freeze of two minutes ended with everything intact, so telling anybody
    // to quit the app after six seconds would cost them work the app was about
    // to hand back.
    expect(RESTART_IT_MS).toBeGreaterThan(NOT_ANSWERING_MS * 4);
  });
});

describe('the three screens say it', () => {
  it('the boot screen, which is otherwise the app name in the faintest grey', () => {
    expect(app).toMatch(/function Booting\(\)/);
    expect(app).toMatch(/setTimeout\(\(\) => setSaid\(NOT_ANSWERING\), NOT_ANSWERING_MS\)/);
    expect(app).toMatch(/setTimeout\(\(\) => setSaid\(RESTART_IT\), RESTART_IT_MS\)/);
    // Both the restore wait and the first snapshot draw the same component, so
    // the timer is not restarted by the step between them.
    expect(app).toMatch(/if \(restoring\) return <Booting \/>;\n\s*if \(!snap\) return <Booting \/>;/);
  });

  it('the conversation, which otherwise reads as still loading for ever', () => {
    expect(itemThread).toMatch(/<ThreadWaiting head="Reading this conversation…" \/>/);
    expect(thread).toMatch(/NOT_ANSWERING_MS/);
    expect(thread).toMatch(/\{late \? NOT_ANSWERING : head\}/);
  });

  it('the send, which otherwise closes the card and goes quiet', () => {
    const sending = app.slice(app.indexOf('onSending={walkCard'), app.indexOf('onSent={async'));
    expect(sending).toMatch(/waitingOnSend\.current = window\.setTimeout\(\(\) => showToast\(SEND_NOT_TAKEN\), NOT_ANSWERING_MS\)/);
    // And stops saying it the moment the send lands, either way.
    expect(app).toMatch(/onFailed=\{\(said, back\) => \{\n\s*doneSending\(\);/);
    expect(app).toMatch(/onSent=\{async \(made, how\) => \{\n\s*doneSending\(\);/);
  });
});
