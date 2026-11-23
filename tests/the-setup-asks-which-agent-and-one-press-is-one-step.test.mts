// THE SETUP ASKS WHICH AGENT, AND ONE PRESS IS ONE STEP (2026-11-12).
//
// The founder opened the first run in a test window on her own Mac. It read
// "Codex ready" beside a Claude Code she uses every day, went from Get
// started to "You're set up" with nothing between, and started her first
// thread on Codex: "It didn't even give me a choice of which agent to use."
//
// Measured on throwaway copies:
// - Enter held on Get started for a second and a half ran every setup step
//   by itself, ticking "Add 4 to your inbox" on the way. A held key repeats,
//   and each step took every repeat as its own press.
// - A test window's throwaway home was given the Claude Code program and the
//   keychain but no ~/.claude, and a home with no ~/.claude reads as "never
//   set up" without Claude Code being asked (main/engine-setup). So it was
//   signed out there, and the app ran on Codex.
// - With both agents ready, nothing asked which one starts your threads.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { heldPress, setupSteps } from '../renderer/src/setup-split.ts';
import { makeHome, prepareHome } from '../shared/fresh-user-home.mts';
import { engineSetUpHere } from '../main/engine-setup.mts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const base = { chats: 4, team: false, teammates: false, project: true };

describe('a key held down', () => {
  it('is one press: its repeats are not', () => {
    expect(heldPress({ key: 'Enter', repeat: true })).toBe(true);
    expect(heldPress({ key: 'Enter', repeat: false })).toBe(false);
    expect(heldPress({ key: 'Enter' })).toBe(false);
    expect(heldPress({ key: 'ArrowDown', repeat: true })).toBe(false);
  });
  it('the setup and the welcome before it both drop the repeats', () => {
    expect(read('renderer/src/components/SetupSplit.tsx')).toContain('if (heldPress(e)) { e.preventDefault(); e.stopPropagation(); return; }');
    expect(read('renderer/src/components/FirstRun.tsx')).toContain('if (heldPress(e)) { e.preventDefault(); e.stopPropagation(); return; }');
  });
});

describe('the agent step', () => {
  it('is asked when both agents are ready, straight after the first step', () => {
    expect(setupSteps({ ...base, agents: 2 })).toEqual(['chats', 'agent', 'look']);
    expect(setupSteps({ ...base, chats: 0, agents: 2 })).toEqual(['folder', 'agent', 'look']);
  });
  it('is not asked with one agent, where there is nothing to choose', () => {
    expect(setupSteps({ ...base, agents: 1 })).toEqual(['chats', 'look']);
    expect(setupSteps(base)).toEqual(['chats', 'look']);
  });
  it('comes before the account and the plan', () => {
    expect(setupSteps({ ...base, team: true, signedIn: false, agents: 2 })).toEqual(['chats', 'agent', 'account', 'plan', 'look']);
  });
  it('opens on Claude Code and saves the pick where the New thread box reads it', () => {
    const setup = read('renderer/src/components/SetupSplit.tsx');
    expect(setup).toContain("const [engine, setEngine] = useState<'claude' | 'codex'>('claude');");
    expect(setup).toContain("writeLastEngine(engine === 'codex' ? 'codex' : null);");
    expect(read('renderer/src/components/FirstRun.tsx')).toContain('engines={ready ?? []}');
  });
});

describe("a test window's throwaway home", () => {
  const made: string[] = [];
  afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const real = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'real-home-')); made.push(d); return d; };

  it('has a Claude Code folder when it has Claude Code, so Claude Code is asked whether it is signed in', () => {
    const realHome = real();
    fs.mkdirSync(path.join(realHome, '.local/bin'), { recursive: true });
    fs.writeFileSync(path.join(realHome, '.local/bin/claude'), '#!/bin/sh\n');
    const home = makeHome(new Date('2026-11-12T06:00:00Z')); made.push(home);
    prepareHome(home, { realHome });
    expect(fs.statSync(path.join(home, '.claude')).isDirectory()).toBe(true);
    expect(fs.readdirSync(path.join(home, '.claude'))).toEqual([]);
    expect(engineSetUpHere('claude', { HOME: home })).toBe(true);
  });
  it('has none on a computer with no Claude Code, and her own sessions only when asked', () => {
    const realHome = real();
    fs.mkdirSync(path.join(realHome, '.claude'), { recursive: true });
    const home = makeHome(new Date('2026-11-12T06:01:00Z')); made.push(home);
    prepareHome(home, { realHome });
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
  });
});
