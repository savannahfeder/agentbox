// AGENTS ARE PAUSED, UNPAUSED AND RESUMED FROM THE PHONE.
//
// The desktop's ⌘K has Pause agents / Unpause agents (`zero:supervisor-pause`)
// and Resume interrupted agents (`zero:resume-agents`). The phone had neither:
// checkSetting refused `paused` and `resumeStopped`, and the computer's copy
// did not say whether its agents were paused (measured 2026-11-08). They ride
// as workspace settings, so the cloud's command table needs no new kind.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { checkSetting, settingRoute, phoneSettingsOf } from '../shared/phone-settings.mts';
import { applyThrough } from '../main/phone-inbox.mts';
import { phoneCommands } from '../mobile/src/lib/palette';

const ws = (key, value) => checkSetting({ scope: 'workspace', key, value });
const model = (over = {}) => ({ ok: true, workspace: { memoryGate: {}, leftovers: {}, accounts: [], codex: {}, agentsRunning: true, ...over }, projects: [] });

describe('what the phone may ask', () => {
  it('pauses or unpauses with a yes or a no, and nothing else', () => {
    expect(ws('paused', true)).toBeNull();
    expect(ws('paused', false)).toBeNull();
    for (const v of ['yes', 1, null, undefined]) expect(ws('paused', v)).not.toBeNull();
  });

  it('resumes the interrupted ones with a yes only', () => {
    expect(ws('resumeStopped', true)).toBeNull();
    for (const v of [false, 'all', null]) expect(ws('resumeStopped', v)).not.toBeNull();
  });

  it('reaches the window\'s own pause and resume handlers', async () => {
    expect(settingRoute({ scope: 'workspace', key: 'paused', value: true }, model())).toEqual(['zero:supervisor-pause', true]);
    expect(settingRoute({ scope: 'workspace', key: 'resumeStopped', value: true }, model())).toEqual(['zero:resume-agents', {}]);
    const got = [];
    const channels = new Map([
      ['zero:settings-read', async () => model()],
      ['zero:supervisor-pause', async (_e, paused) => { got.push(['pause', paused]); return { paused }; }],
      ['zero:resume-agents', async (_e, arg) => { got.push(['resume', arg]); return { ok: true, cleared: 2 }; }],
    ]);
    const apply = applyThrough(channels);
    await apply({ kind: 'setting', payload: { scope: 'workspace', key: 'paused', value: false } });
    await apply({ kind: 'setting', payload: { scope: 'workspace', key: 'resumeStopped', value: true } });
    expect(got).toEqual([['pause', false], ['resume', {}]]);
  });
});

describe('the copy the computer sends', () => {
  it('says whether its agents are paused', () => {
    expect(phoneSettingsOf(model({ agentsRunning: false }), { version: '1' }).workspace.paused).toBe(true);
    expect(phoneSettingsOf(model({ agentsRunning: true }), { version: '1' }).workspace.paused).toBe(false);
  });
});

describe('the phone\'s commands', () => {
  const computer = (paused) => ({ paused, projects: [], order: [] });
  const ids = (list) => list.map((c) => c.id);
  it('offer Pause agents, or Unpause agents while they are paused, as the desktop words them', () => {
    const on = phoneCommands({ team: false, computer: computer(false) }).find((c) => c.id === 'pause');
    expect(on).toMatchObject({ label: 'Pause agents', act: { setting: { scope: 'workspace', key: 'paused', value: true } } });
    const off = phoneCommands({ team: false, computer: computer(true) }).find((c) => c.id === 'pause');
    expect(off).toMatchObject({ label: 'Unpause agents', act: { setting: { scope: 'workspace', key: 'paused', value: false } } });
  });

  it('offer Resume interrupted agents', () => {
    expect(phoneCommands({ team: false, computer: computer(false) }).find((c) => c.id === 'resume-stopped'))
      .toMatchObject({ label: 'Resume interrupted agents', act: { setting: { scope: 'workspace', key: 'resumeStopped', value: true } } });
  });

  it('offer neither before the computer has sent its settings', () => {
    expect(ids(phoneCommands({ team: false }))).not.toContain('pause');
    expect(ids(phoneCommands({ team: false, computer: null }))).not.toContain('resume-stopped');
  });

  it('are run from the search screen, which sends the change to the computer', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/search.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/'setting' in act/);
    expect(src).toMatch(/s\.change\(act\.setting\)/);
  });
});

describe('the Running page on the phone', () => {
  const src = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
  it('has the pause and the resume', () => {
    expect(src).toMatch(/'Unpause agents' : 'Pause agents'/);
    expect(src).toMatch(/label="Resume interrupted agents"/);
    expect(src).toContain("key: 'resumeStopped'");
  });
});
