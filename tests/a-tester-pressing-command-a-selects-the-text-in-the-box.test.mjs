// A TESTER PRESSING COMMAND-A SELECTS THE TEXT IN THE BOX (w-3d0fa23ffb, 2026-10-21).
//
// The power tester in the founder's room saw her reply glued to an option's
// label, pressed Cmd+A and typed it again. The send carried both copies, and she
// logged it as broken: "cmd+A didn't replace the box". The app leaves Cmd+A
// alone in a text box (App.tsx checks inInput). The tester's tool sent Cmd+A as
// a bare key event, and Chrome on a Mac only selects, undoes or redoes when the
// event names the editing command, as a real keyboard's does. It names them now.
import { it, expect } from 'vitest';
import { editingCommands } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

it('Cmd+A selects everything, Cmd+Z undoes and Cmd+Shift+Z redoes', () => {
  expect(editingCommands('a', ['meta'])).toEqual(['selectAll']);
  expect(editingCommands('z', ['meta'])).toEqual(['undo']);
  expect(editingCommands('z', ['meta', 'shift'])).toEqual(['redo']);
});

it('the same letters without Command, or with Control, are only keys', () => {
  expect(editingCommands('a', [])).toEqual([]);
  expect(editingCommands('a', ['ctrl'])).toEqual([]);
  expect(editingCommands('a', ['meta', 'shift'])).toEqual([]);
});

it('Command with any other key names no command', () => {
  expect(editingCommands('Enter', ['meta'])).toEqual([]);
  expect(editingCommands('k', ['meta'])).toEqual([]);
});
