// On the Nov 26 onboarding call a person typed "/" on a thread that was a
// Claude Code session in their terminal, and nothing came up: the reply box
// switched its menu off for those sessions, because a message reaches them as
// words and a command typed there would never run. Continue in Agentbox was in
// the ⋯ menu and ⌘K only. Measured on a live copy with a stand-in terminal
// session: no menu, no button. Now the button sits beside the reply box, and
// a command sent from the box moves the session in and runs on its new thread.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { canMoveIn, movesInWithCommand } from '../renderer/src/outside-agents.ts';

const claude = { engine: 'claude', product: 'shop', sessionId: 'abc' };

it('a slash command to a Claude Code terminal session moves it in', () => {
  expect(movesInWithCommand(claude, '/release-checklist')).toBe(true);
  expect(movesInWithCommand(claude, '  /code-review the retry change')).toBe(true);
  expect(movesInWithCommand(claude, '/plugin:skill')).toBe(true);
});

it('words, paths and a bare slash still go to the terminal', () => {
  expect(movesInWithCommand(claude, 'yes, run the checklist')).toBe(false);
  expect(movesInWithCommand(claude, '/Users/me/notes.md has the list')).toBe(false);
  expect(movesInWithCommand(claude, '/')).toBe(false);
});

it('a session that cannot become a thread here is never moved', () => {
  expect(canMoveIn(claude)).toBe(true);
  expect(movesInWithCommand({ ...claude, engine: 'codex' }, '/review')).toBe(false);
  expect(movesInWithCommand({ ...claude, product: null }, '/review')).toBe(false);
  expect(movesInWithCommand({ ...claude, sessionId: null }, '/review')).toBe(false);
});

it('the reply box offers the move beside it and the command menu on those sessions', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  expect(focus).toMatch(/const movesIn = !!bringIn && canMoveIn\(agent\)/);
  expect(focus).toMatch(/const toAgent = \(!item\.agent \|\| movesIn\)/);
  // A permission mode would be thrown away by a message to a terminal, so the menu offers commands only there.
  expect(focus).toMatch(/\.filter\(\(row\) => canSetMode \|\| row\.kind === 'command'\)/);
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/if \(movesInWithCommand\(focused\.agent, text\)\) void bringIn\(focused, \{ send: text \}\)/);
});
