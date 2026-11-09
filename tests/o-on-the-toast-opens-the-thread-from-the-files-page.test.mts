// O ON THE TOAST OPENS THE THREAD FROM THE FILES PAGE.
//
// A tester on the Files page pressed N, wrote a Web app task and sent it. The
// toast said "Started in Web app · O Open · Z Undo", and O did nothing: the
// page stayed on Files with the toast still up. Measured on a live copy
// (verify-agentbox live.mjs) by sending from Files and pressing O while the
// toast was up: still on Files, toast unchanged. A click on the same toast
// opened the thread.
//
// The cause is in App.tsx's key handler. The Files page, like Connections and
// Teammates, keeps the keyboard to itself and returned on every key but N,
// above the line that answers the toast's O. The toast is drawn over those
// pages, so its O has to get past them.
//
// The rule is pure (renderer/src/toast-parts.ts); the wiring is checked by
// excerpt because there is no render harness for App.tsx.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { O_WAITS_MS, oIsTheToasts } from '../renderer/src/toast-parts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const goes = { product: 'web-app', id: 'w-1' };
const started = { text: 'Started in Web app · press Z to undo', goes };

describe('which presses are the toast’s O', () => {
  it('O and o, while a toast names its thread', () => {
    expect(oIsTheToasts('o', started, 0, 5_000)).toBe(true);
    expect(oIsTheToasts('O', started, 0, 5_000)).toBe(true);
  });

  it('an O pressed while the send is still in the air, which waits for its thread', () => {
    expect(oIsTheToasts('o', { text: 'Starting in Web app…' }, 1_000, 1_200)).toBe(true);
    expect(oIsTheToasts('o', { text: 'Starting in Web app…' }, 1_000, 1_000 + O_WAITS_MS + 1)).toBe(false);
  });

  it('not with no toast, or a toast that goes nowhere: the page keeps the key', () => {
    expect(oIsTheToasts('o', null, 0, 5_000)).toBe(false);
    expect(oIsTheToasts('o', { text: 'Priority: high' }, 0, 5_000)).toBe(false);
  });

  it('no other key', () => {
    for (const k of ['n', 'z', 'Z', 'p', 'Escape', 'Enter', '/']) expect(oIsTheToasts(k, started, 0, 5_000)).toBe(false);
  });
});

describe('the pages that keep the keyboard let the toast’s O through', () => {
  const at = app.indexOf('    const onKey = (e: KeyboardEvent) => {');
  const handler = app.slice(at, app.indexOf('      if (focused) {', at));
  const answered = handler.indexOf('const goesTo = opensTheToast(e.key, toast,');

  it('is worked out once, before the pages', () => {
    expect(handler).toContain('const toastsO = oIsTheToasts(e.key, toast, sentAt.current, Date.now());');
    expect(handler.indexOf('const toastsO =')).toBeLessThan(handler.indexOf('if (teammatesShown &&'));
  });

  for (const page of ['teammatesShown', 'connectionsShown', 'filesShown']) {
    it(`${page} steps aside for it, and the O is answered below`, () => {
      const guard = `if (${page} && e.key !== 'n' && e.key !== 'N' && !toastsO) {`;
      expect(handler).toContain(guard);
      expect(handler.indexOf(guard)).toBeLessThan(answered);
    });
  }

  // One branch of the handler, from its `if` to its closing brace.
  const branch = (start) => {
    const from = handler.indexOf(start);
    return handler.slice(from, handler.indexOf('\n      }', from) + 8);
  };

  it('the Files page still keeps every other key', () => {
    expect(branch('if (filesShown &&')).toMatch(/\n\s*return;\n\s*\}$/);
  });

  it('a room is left alone: a letter there goes to its chat box', () => {
    expect(branch('if (roomShown &&')).not.toContain('toastsO');
  });
});
