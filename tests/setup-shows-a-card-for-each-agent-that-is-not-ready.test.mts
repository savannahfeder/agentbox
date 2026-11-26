// SETUP SHOWS A CARD FOR EACH AGENT, AND SAYS WHAT ONE THAT IS NOT READY NEEDS.
//
// On the Nov 23 and Nov 24 onboarding calls, two people who drive Claude Code
// every day could only use Codex. With Codex ready and Claude Code not, the
// welcome said "Codex ready" in small type and setup never named Claude Code
// again (measured on a new person's copy, 2026-11-24). PostHog showed the same
// on 6 of the 42 Macs that finished setup since Nov 1.
//
// Claude Code older than 2.1.40 answers the sign-in check
// (`auth status --json`) with "unknown option '--json'" and exit 1, which the
// app read as signed out (measured on npm releases 1.0.100, 2.0.0, 2.0.50,
// 2.1.0 and 2.1.20; 2.1.40 answers). Runs need 2.1.71 (`minVersion`), so the
// card for an older one says Update, not Sign in.
//
// The founder picked the two cards ("this lgtm" on 3-two-cards.png, 2026-11-24).
// Nothing on a card runs until it is pressed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { setupSteps, agentCard } from '../renderer/src/setup-split.ts';
import { createEngineSetup } from '../main/engine-setup.mts';

const base = { chats: 4, team: false, teammates: false, project: true };

describe('the agents step', () => {
  it('comes first when an agent is not ready', () => {
    expect(setupSteps({ ...base, agents: 1, unready: 1 })).toEqual(['agent', 'chats', 'look']);
    expect(setupSteps({ ...base, chats: 0, agents: 1, unready: 1 })).toEqual(['agent', 'folder', 'look']);
  });
  it('is the old pick, in its old place, when both are ready', () => {
    expect(setupSteps({ ...base, agents: 2, unready: 0 })).toEqual(['chats', 'agent', 'look']);
  });
  it('is not asked when the one agent is ready and the other is not wanted', () => {
    expect(setupSteps({ ...base, agents: 1 })).toEqual(['chats', 'look']);
  });
});

describe('a card', () => {
  it('says Ready and offers nothing for an agent that is ready', () => {
    expect(agentCard({ engine: 'codex', found: true, signedIn: true })).toEqual({ ready: true, sub: null, act: null });
  });
  it('offers Sign in for one found and signed out', () => {
    expect(agentCard({ engine: 'claude', found: true, signedIn: false })).toEqual({ ready: false, sub: 'Not signed in', act: 'Sign in' });
  });
  it('offers Sign in for one whose sign-in check never answered, since signing in checks first', () => {
    expect(agentCard({ engine: 'claude', found: true, signedIn: false, certain: false })).toEqual({ ready: false, sub: 'Could not check sign-in', act: 'Sign in' });
  });
  it('offers Install for one not on this computer', () => {
    expect(agentCard({ engine: 'codex', found: false, signedIn: false })).toEqual({ ready: false, sub: 'Not on this computer', act: 'Install' });
  });
  it('offers Update, not Sign in, for one too old to run threads', () => {
    expect(agentCard({ engine: 'claude', found: true, signedIn: false, tooOld: true, version: '2.1.12' })).toEqual({ ready: false, sub: 'Version 2.1.12 is too old', act: 'Update' });
    expect(agentCard({ engine: 'claude', found: true, signedIn: false, tooOld: true })).toEqual({ ready: false, sub: 'Too old to run threads', act: 'Update' });
  });
  it('says what is happening while it is pressed, and offers the sign-in page again', () => {
    const r = { engine: 'claude', found: true, signedIn: false };
    expect(agentCard(r, { phase: 'checking' })).toEqual({ ready: false, sub: 'Checking…', act: null });
    expect(agentCard(r, { phase: 'installing' })).toEqual({ ready: false, sub: 'Installing…', act: null });
    expect(agentCard(r, { phase: 'signing-in' })).toEqual({ ready: false, sub: 'Finish in your browser', act: 'Open again' });
    expect(agentCard(r, { phase: 'updating' })).toEqual({ ready: false, sub: 'Updating…', act: null });
    expect(agentCard(r, { phase: 'ready' })).toEqual({ ready: true, sub: null, act: null });
  });
  it('says what to run when Agentbox cannot update that copy itself, and offers to look again', () => {
    // Measured on the real updater against an npm Claude Code: it answers
    // "This installation must be updated using its own installer.", which says nothing to do.
    expect(agentCard({ engine: 'claude', found: true, signedIn: false, tooOld: true }, { phase: 'manual', error: 'Run claude update in a terminal' }))
      .toEqual({ ready: false, sub: 'Run claude update in a terminal', act: 'Check again' });
    expect(fs.readFileSync(new URL('../renderer/src/components/AgentCards.tsx', import.meta.url), 'utf8')).toContain('own installer');
  });
  it('says why it stopped and offers to try again', () => {
    expect(agentCard({ engine: 'claude', found: true, signedIn: false }, { phase: 'failed', error: 'The sign-in was closed before it finished.' }))
      .toEqual({ ready: false, sub: 'The sign-in was closed before it finished.', act: 'Try again' });
  });
});

type Run = { file: string; args: string[] };
function fakeSpawn(version: string, signedIn = true) {
  const runs: Run[] = [];
  const spawn = (file: string, args: string[], { onData }: { onData?: (d: unknown) => void } = {}) => {
    runs.push({ file, args });
    if (args[0] === '--version') { onData?.(`${version} (Claude Code)\n`); return { exit: Promise.resolve(0), kill() {} }; }
    return { exit: Promise.resolve(signedIn ? 0 : 1), kill() {} };
  };
  return { spawn, runs };
}
const find = () => ({ found: true, path: '/opt/homebrew/bin/claude', certain: true });

describe('the ready check', () => {
  it('reads a Claude Code older than runs need as too old, without asking its sign-in', async () => {
    const { spawn, runs } = fakeSpawn('2.1.12');
    const setup = createEngineSetup({ find, spawn, setUpHere: () => true });
    expect(await setup.readiness('claude')).toEqual({ engine: 'claude', found: true, signedIn: false, certain: true, tooOld: true, version: '2.1.12' });
    expect(runs.map((r) => r.args.join(' '))).toEqual(['--version']);
  });
  it('reads one new enough as it always did', async () => {
    const { spawn } = fakeSpawn('2.1.331');
    const setup = createEngineSetup({ find, spawn, setUpHere: () => true });
    expect(await setup.readiness('claude')).toEqual({ engine: 'claude', found: true, signedIn: true, certain: true, version: '2.1.331' });
  });
  it('the oldest one runs take is not too old', async () => {
    const { spawn } = fakeSpawn('2.1.71');
    const setup = createEngineSetup({ find, spawn, setUpHere: () => true });
    expect(await setup.readiness('claude')).toMatchObject({ signedIn: true, version: '2.1.71' });
  });
  it('a version it cannot read stops nothing', async () => {
    const { spawn } = fakeSpawn('not a version');
    const setup = createEngineSetup({ find, spawn, setUpHere: () => true });
    expect(await setup.readiness('claude')).toEqual({ engine: 'claude', found: true, signedIn: true, certain: true });
  });
  it('asks Codex nothing new: it has no oldest version yet', async () => {
    const { spawn, runs } = fakeSpawn('0.1.0');
    const setup = createEngineSetup({ find: () => ({ found: true, path: '/usr/local/bin/codex', certain: true }), spawn, setUpHere: () => true });
    expect(await setup.readiness('codex')).toEqual({ engine: 'codex', found: true, signedIn: true, certain: true });
    expect(runs.some((r) => r.args[0] === '--version')).toBe(false);
  });
});

describe('the screens', () => {
  const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('hand setup every reading, and the step draws the approved cards', () => {
    expect(read('renderer/src/components/FirstRun.tsx')).toContain('readings={readings}');
    const split = read('renderer/src/components/SetupSplit.tsx');
    expect(split).toContain("'Your agents.'");
    expect(split).toContain('className="ss-tiles"');
  });
});
