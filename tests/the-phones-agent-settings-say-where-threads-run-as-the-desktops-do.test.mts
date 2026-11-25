// Settings › Claude Code and Codex with the cloud (desktop, 2026-11-22): with
// no login of that agent in the cloud, a card says "No Codex account in the
// cloud" and "Codex threads run on this computer.", and the Cloud switch shows
// whenever the cloud is set up. In use sits on the login that takes the
// threads: the cloud's while the cloud is on and can run, this computer's
// unless the cloud takes every thread. "Your agents run on one account at a
// time." shows only while the cloud is off. The phone parity round of
// 2026-11-25 found the phone hiding the Cloud switch when the agent had no
// cloud login, always marking this computer's login In use, and keeping the
// one-account line with the cloud on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { agentCloudSlot, cloudCanRun, inUseHere, oneAtATimeLine, type CloudLogin } from '../mobile/src/lib/cloud-accounts';
import { cloudSlotWords, inUseWhere } from '../renderer/src/cloud-places';
import { mayRunOn } from '../main/cloud/logins.mts';

const login = (over: Partial<CloudLogin>): CloudLogin => ({ engine: 'codex', email: 'ana@example.com', inUse: true, plan: 'Pro', state: 'ready', limitedUntil: null, same: null, usage: null, ...over });
const copy = (accounts: CloudLogin[] | null) => ({ cloud: accounts === null ? null : { mode: 'full' as const, accounts } });

describe("the phone's Claude Code and Codex pages, with the cloud", () => {
  it('say an agent has no account in the cloud, in the desktop words for your computer', () => {
    const words = cloudSlotWords('Codex');
    expect(agentCloudSlot(copy([]), 'codex')).toEqual({ title: words.title, line: words.line.replace('this computer', 'your computer') });
    expect(agentCloudSlot(copy([login({ engine: 'claude' })]), 'codex')).not.toBeNull();
    expect(agentCloudSlot(copy([login({})]), 'codex')).toBeNull();
    expect(agentCloudSlot(copy(null), 'codex')).toBeNull();
  });

  it('take a cloud login as able to run by the computer own rule', () => {
    for (const state of ['ready', 'stale', 'renew', 'limited', 'broken', 'refused']) {
      expect(cloudCanRun(copy([login({ state })]), 'codex')).toBe(mayRunOn(state));
    }
    expect(cloudCanRun(copy([login({ inUse: false })]), 'codex')).toBe(false);
  });

  it('mark In use where the desktop marks it', () => {
    const w = copy([login({ same: 'here-1' })]);
    for (const mode of ['mac', 'full', 'all'] as const) {
      for (const chosen of [true, false]) {
        const desk = inUseWhere({ chosenHere: chosen, isCloudInUse: true, cloudCanRun: true, mode });
        expect(inUseHere(w, 'codex', mode, { id: 'here-1', chosen })).toBe(desk.here || desk.cloud);
      }
    }
    expect(inUseHere(copy([login({ same: null })]), 'codex', 'all', { id: 'here-1', chosen: true })).toBe(false);
    expect(inUseHere(copy(null), 'codex', 'mac', { id: 'here-1', chosen: true })).toBe(true);
  });

  it('say one account at a time only with the cloud off and more than one login', () => {
    expect(oneAtATimeLine(2, 'mac')).toBe('Your agents run on one account at a time.');
    expect(oneAtATimeLine(2, 'full')).toBeNull();
    expect(oneAtATimeLine(1, 'mac')).toBeNull();
  });

  it('draw the Cloud switch whenever the cloud is set up, and the empty card in Signed in', () => {
    const src = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    expect(src).not.toContain('{cloud ? <CloudGroup engine="claude" /> : null}');
    expect(src).not.toContain('{cloud ? <CloudGroup engine="codex" /> : null}');
    expect(src).toContain('<CloudGroup engine="claude" />');
    expect(src).toContain('cloudInUseName(s.settings!.workspace, engine) ? cloudRunsLine(mode, cloudInUseName(s.settings!.workspace, engine), COMPUTER) : cloudWhenLine(mode, COMPUTER)');
    expect(src).toMatch(/slot && <Row [^\n]*label=\{slot\.title\} desc=\{slot\.line\}/);
  });
});
