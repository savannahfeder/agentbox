// Z UNDOES FROM THE FILES PAGE, AND FROM CONNECTIONS AND TEAMMATES.
//
// On the Files page someone pressed N, wrote a task and sent it. The toast said
// "Started in Agentbox Team · O Open · Z Undo", and Z did nothing. The Files
// page keeps the keyboard to itself and returned on every key but N (and the
// toast's O) before the undo was reached; Connections and Teammates did the
// same. Measured by reading App.tsx's key handler: none of those three
// branches named Z, and each ends in a bare return.
//
// Checked by excerpt because there is no render harness for App.tsx.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const at = app.indexOf('    const onKey = (e: KeyboardEvent) => {');
const handler = app.slice(at, app.indexOf('      if (focused) {', at));

const branch = (start: string) => {
  const from = handler.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  return handler.slice(from, handler.indexOf('\n      }', from) + 8);
};

describe('a page that keeps the keyboard still lets Z undo', () => {
  for (const page of ['filesShown', 'connectionsShown', 'teammatesShown']) {
    it(`${page}: Z and z run the undo`, () => {
      const body = branch(`if (${page} &&`);
      expect(body).toContain("if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); return; }");
    });

    it(`${page}: the Z comes after the text-field guard, so a z typed into a box stays a letter`, () => {
      const body = branch(`if (${page} &&`);
      expect(body.indexOf('inInput')).toBeGreaterThan(-1);
      expect(body.indexOf('inInput')).toBeLessThan(body.indexOf("e.key === 'z'"));
    });
  }

  it('a room is left alone: a letter there goes to its chat box', () => {
    expect(branch('if (roomShown &&')).not.toContain('undo()');
  });
});
