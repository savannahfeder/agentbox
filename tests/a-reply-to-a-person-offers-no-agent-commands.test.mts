// A REPLY TO A PERSON OFFERS NO AGENT COMMANDS (w-f702d60afe, round eleven, 2026-11-20).
//
// A tester pressed / in the box of a task Sam had handed him, which said
// "Replying to Sam", and got Codex's list: /model, /review, /full-access and
// the rest. That reply goes to Sam, not to an agent, so none of them would do
// anything. The box knows who it reaches (`talkTo`); the menu now asks it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

describe('the slash menu in a reply box', () => {
  it('opens only when the reply reaches an agent', () => {
    expect(focus).toContain('const toAgent = !item.agent && !talkTo?.length;');
    expect(focus).toContain('const query = toAgent ? slashQuery(text) : null;');
  });
  it('holds no command in a reply to people', () => {
    expect(focus).toContain('const holding = toAgent ? commandBeingWritten(text, claudeCode, nativeNames) : null;');
  });
  it('does not ask Claude Code for its commands for a reply to people', () => {
    expect(focus).toMatch(/const discoveringCommands = !item\.agent && !talkTo\?\.length && /);
  });
});
