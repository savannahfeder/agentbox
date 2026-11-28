// On the Nov 26 onboarding call a person typed "/" on a thread that was a
// Claude Code session in their terminal, and nothing came up: a message to
// those sessions reaches the terminal as words, so the box offered no
// commands. The first fix put Continue in Agentbox beside the box and moved a
// session in only when a slash command was sent. The founder's call after
// seeing it: any reply from here moves the session in, with no button. Measured
// by reading the send path, which handed every non-command reply to the
// terminal.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { canMoveIn } from '../renderer/src/outside-agents.ts';

const claude = { engine: 'claude', product: 'shop', sessionId: 'abc' };
const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

it('a Claude Code terminal session with a project and a session id can move in', () => {
  expect(canMoveIn(claude)).toBe(true);
});

it('a session that cannot become a thread here is answered where it runs', () => {
  expect(canMoveIn({ ...claude, engine: 'codex' })).toBe(false);
  expect(canMoveIn({ ...claude, product: null })).toBe(false);
  expect(canMoveIn({ ...claude, sessionId: null })).toBe(false);
  expect(canMoveIn(null)).toBe(false);
});

it('every reply sent to such a session moves it in and is sent on its new thread', () => {
  const app = read('App.tsx');
  expect(app).toMatch(/if \(canMoveIn\(focused\.agent\)\) void bringIn\(focused, \{ send: text \}\);\n\s*else replyToAgent\(focused, text\);/);
  expect(app).not.toMatch(/movesInWithCommand/);
});

it('the reply box is the way in: no button beside it, and its footer says where the reply goes', () => {
  const focus = read('components/Focus.tsx');
  expect(focus).toMatch(/const movesIn = !!bringIn && canMoveIn\(agent\)/);
  expect(focus).not.toContain('dock-pill-in');
  expect(focus).toContain("{movesIn ? `Moves this session into ${Name} and runs it here.` : `Goes straight into ${item.agent.name}.`}");
  // The menu offers commands there; a permission mode would be dropped by the move.
  expect(focus).toMatch(/const toAgent = \(!item\.agent \|\| movesIn\)/);
  expect(focus).toMatch(/\.filter\(\(row\) => canSetMode \|\| row\.kind === 'command'\)/);
});
