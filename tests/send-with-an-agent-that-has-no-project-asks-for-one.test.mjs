// SEND WITH AN AGENT THAT HAS NO PROJECT ASKS FOR ONE, IT IS NEVER GREYED OUT.
//
// A reply in a chat with a teammate read "@Claude Code are you able to help
// with this?" and Send was dead. The only clue was a grey line in the footer,
// "Pick a project for @Claude Code: click it to choose.", which was missed: the
// person pressed Send, nothing happened, and they filed it as a bug from a
// screenshot. Measured by reading Focus.tsx and ThreadPanel.tsx: both boxes
// disabled Send on `chat.block` and printed it as a footer line.
//
// Now Send stays live. Pressing it with an agent that has no project opens that
// mention's project list, and picking one sends the message.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findMentions, looseMention } from '../renderer/src/team/agent-mentions.ts';

const PROJECTS = [{ slug: 'agentbox', name: 'Agentbox' }, { slug: 'agentbox-team', name: 'Agentbox Team' }];
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('which mention Send asks about', () => {
  it('is the first agent with no project, as in the screenshot', () => {
    expect(looseMention(findMentions('@Claude Code are you able to help with this?', PROJECTS))).toBe(0);
  });

  it('skips an agent that already has a project for the next one that has none', () => {
    expect(looseMention(findMentions('@Codex in Agentbox look, and @Claude Code check', PROJECTS))).toBe(1);
  });

  it('is none when every agent has a project, or there is no agent', () => {
    expect(looseMention(findMentions('@Codex in Agentbox Team look', PROJECTS))).toBe(-1);
    expect(looseMention(findMentions('And @Margarette, no need to ever mention hyperfocus', PROJECTS))).toBe(-1);
  });
});

describe('the reply boxes', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  const panel = read('renderer/src/team/ThreadPanel.tsx');
  const hook = read('renderer/src/team/ChatAgents.tsx');

  it('never grey out Send or print a footer line for a mention without a project', () => {
    for (const src of [focus, panel]) expect(src).not.toMatch(/chat\.block/);
    expect(read('renderer/src/team/agent-mentions.ts')).not.toMatch(/click it to choose/);
  });

  it('open the project list when Send is pressed, and send once a project is picked', () => {
    for (const src of [focus, panel]) {
      expect(src).toMatch(/if \(chat\.askForProject\(\)\) return;/);
      expect(src).toMatch(/chat\.readyToSend/);
    }
    expect(hook).toMatch(/askForProject/);
  });
});
