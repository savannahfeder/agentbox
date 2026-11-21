// A CODEX PLAN NOBODY NAMES READS AS CODEX'S WORD ON THE PHONE.
//
// The desktop says "Codex reports the plan as “prolite”" for a plan id it has
// no proper name for (Settings.tsx `accountSay`). The phone's copy dropped
// `planNamed`, so Settings › Agents › Codex on Android read "prolite · Local",
// like an internal identifier (QA M-57, 2026-11-14).
import { describe, it, expect } from 'vitest';
import { phoneSettingsOf } from '../shared/phone-settings.mts';

const model = (account: Record<string, unknown>) => ({
  ok: true,
  workspace: { accounts: [], codex: { accounts: [{ profile: 'default', email: 'a@example.com', signedIn: true, chosen: true, ...account }] } },
  projects: [],
});
const planOf = (account: Record<string, unknown>) => phoneSettingsOf(model(account), { version: '1' }).workspace.codexAccounts[0].plan;

describe("the Codex plan in the phone's copy", () => {
  it('quotes an id nobody markets as what Codex reports', () => {
    expect(planOf({ plan: 'prolite', planNamed: false })).toBe('Codex says “prolite”');
  });

  it('keeps a known plan as its name', () => {
    expect(planOf({ plan: 'Pro', planNamed: true })).toBe('Pro');
  });

  it('keeps the plan as it was from a computer that does not say whether it is named', () => {
    expect(planOf({ plan: 'Plus' })).toBe('Plus');
  });

  it('has no plan when there is none', () => {
    expect(planOf({ plan: null, planNamed: false })).toBeNull();
  });
});
