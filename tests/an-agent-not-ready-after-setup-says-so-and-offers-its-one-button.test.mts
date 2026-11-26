// AN AGENT THAT IS NOT READY AFTER SETUP SAYS SO, AND OFFERS ITS ONE BUTTON.
//
// Setup has shown a card per agent that is not ready since Nov 24, but every
// customer so far was already past setup. On the Nov 26 call the founder
// noted again that Claude Code was not always found, and asked for "a clear way
// to set up both w/o being too automatic".
//
// Measured on stand-in homes against main/engine-setup.mts and the finder
// (scripts/scratch/measure-agents.mjs, 2026-11-26), for someone past setup
// with Codex signed in:
//   - Claude Code 2.1.30, signed in: the launch sign-in check says signed out
//     ("unknown option '--json'"), so every thread goes to Codex. Settings ›
//     Claude Code shows it found and healthy, with nothing to press.
//   - Claude Code 2.1.80, signed out: every thread goes to Codex. Settings shows
//     only "Finish signing in to use it" on its account tile, with no button.
//   - Claude Code gone but its ~/.claude.json left: the search is unsure, and
//     nothing outside Settings says a word.
//   - Only in the VS Code extension: found, ready. Nothing to say.
// Nothing outside Settings named any of them.
//
// Now the setup's card is one component, drawn on the agent's Settings page
// and as a card in the sidebar's foot, where "New version ready" goes. Nothing
// runs until its button is pressed, and its × puts it away.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { agentNotReady, sidebarAgent } from '../renderer/src/setup-split.ts';
import { AgentTile } from '../renderer/src/components/AgentCards.tsx';
import { SidebarAgent } from '../renderer/src/components/SidebarUpdate.tsx';

const ready = { engine: 'codex', found: true, signedIn: true, certain: true };

describe('which agent is worth a word', () => {
  it('one found but signed out', () => {
    expect(agentNotReady({ engine: 'claude', found: true, signedIn: false, certain: true })).toBe(true);
  });
  it('one too old to run threads', () => {
    expect(agentNotReady({ engine: 'claude', found: true, signedIn: false, certain: true, tooOld: true, version: '2.1.30' })).toBe(true);
  });
  it('one missing with its traces left, so the search was unsure', () => {
    expect(agentNotReady({ engine: 'claude', found: false, signedIn: false, certain: false })).toBe(true);
  });
  it('not one never set up here, which is someone who does not use it', () => {
    expect(agentNotReady({ engine: 'claude', found: false, signedIn: false, certain: true })).toBe(false);
  });
  it('not one that is ready', () => {
    expect(agentNotReady(ready)).toBe(false);
  });
});

describe('the sidebar card', () => {
  it('names the agent and says where threads run meanwhile', () => {
    const r = sidebarAgent([{ engine: 'claude', found: true, signedIn: false, certain: true }, ready]);
    expect(r).toEqual({ engine: 'claude', title: 'Claude Code is not signed in', say: 'Threads run on Codex until it is.', act: 'Sign in' });
  });
  it('says Update for one too old', () => {
    const r = sidebarAgent([{ engine: 'claude', found: true, signedIn: false, certain: true, tooOld: true, version: '2.1.30' }, ready]);
    expect(r).toEqual({ engine: 'claude', title: 'Claude Code needs an update', say: 'Threads run on Codex until it is.', act: 'Update' });
  });
  it('says nothing about where threads run when the other agent is not ready either', () => {
    const r = sidebarAgent([{ engine: 'claude', found: true, signedIn: false, certain: true }, { engine: 'codex', found: false, signedIn: false, certain: true }]);
    expect(r?.say).toBe(null);
  });
  it('is not drawn when every agent someone uses is ready', () => {
    expect(sidebarAgent([ready, { engine: 'claude', found: false, signedIn: false, certain: true }])).toBe(null);
    expect(sidebarAgent([ready, { engine: 'claude', found: true, signedIn: true, certain: true }])).toBe(null);
  });
  it('is not drawn for one put away with its ×, until its state changes', () => {
    const out = { engine: 'claude', found: true, signedIn: false, certain: true };
    expect(sidebarAgent([out, ready], ['claude:Sign in'])).toBe(null);
    expect(sidebarAgent([{ ...out, tooOld: true }, ready], ['claude:Sign in'])?.act).toBe('Update');
  });
  it('draws a title, a line and one button', () => {
    const html = renderToStaticMarkup(createElement(SidebarAgent, {
      note: { engine: 'claude', title: 'Claude Code is not signed in', say: 'Threads run on Codex until it is.', act: 'Sign in' },
      sub: null, act: 'Sign in', collapsed: false, onPress: () => {}, onClose: () => {},
    }));
    expect(html).toContain('Claude Code is not signed in');
    expect(html).toContain('Threads run on Codex until it is.');
    expect(html).toContain('>Sign in</button>');
  });
});

describe('one card, everywhere', () => {
  it('draws the setup card, with its one button', () => {
    const html = renderToStaticMarkup(createElement(AgentTile, { engine: 'claude', card: { ready: false, sub: 'Not signed in', act: 'Sign in' }, onPress: () => {} }));
    expect(html).toContain('Claude Code');
    expect(html).toContain('Not signed in');
    expect(html).toContain('>Sign in</button>');
  });
  it('is the component setup, Settings and the sidebar all draw', () => {
    const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
    expect(read('components/SetupSplit.tsx')).toMatch(/<AgentTile\b/);
    expect(read('components/SetupSplit.tsx')).not.toMatch(/className="ss-tile"/);
    expect(read('components/Settings.tsx')).toMatch(/<AgentSettingsCard\b/);
    expect(read('components/AgentCards.tsx')).toMatch(/function AgentSettingsCard[\s\S]*<AgentTile\b/);
    expect(read('components/WorkspaceNavigation.tsx')).toMatch(/<SidebarAgentSlot\b/);
  });
  // A chosen path draws the status box under the card, which said "Claude Code
  // is connected ... nothing for you to set up" under "Version 2.1.30 is too old".
  it('leaves out "is connected" under a card saying the agent is not ready', () => {
    const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
    expect(read('components/AgentCards.tsx')).toMatch(/function AgentSettingsCard\(\{ engine, below \}/);
    const settings = read('components/Settings.tsx');
    expect(settings).toMatch(/<AgentSettingsCard engine=\{engine\} below=\{\(ready\) =>/);
    expect(settings).toMatch(/\{!\(notReady && state === 'connected'\) && \(\n\s*<Row label=\{label\} desc=\{say\}>/);
  });
});
