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

  // A chat opened from Needs you answers keys as a thread does, Z included; one
  // opened anywhere else sends its letters to the chat box.
  it('a room outside Needs you is left alone: a letter there goes to its chat box', () => {
    const body = branch('if (roomShown &&');
    const inbox = body.indexOf('if (roomsUi.inInbox');
    expect(inbox).toBeGreaterThan(-1);
    const fromInbox = body.slice(inbox, body.indexOf('\n        }', inbox));
    expect(fromInbox).toContain("else if (k === 'z') { e.preventDefault(); undo(); }");
    expect(body.replace(fromInbox, '')).not.toContain('undo()');
  });
});
