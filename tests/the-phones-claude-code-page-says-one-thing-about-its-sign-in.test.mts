// THE PHONE'S CLAUDE CODE PAGE SAYS ONE THING ABOUT ITS SIGN-IN (QA M-43,
// native Android, 2026-11-08 and 11-10).
//
// Settings listed "Claude Code, 1 account"; its page said "Claude Code is not
// on your computer", then listed one account labelled "Not signed in", tagged
// "In use", with "Signed in" under it, and a permission mode "Set by hand in
// Agentbox's settings file on this computer", on a phone. The web app had
// already settled the rule (webSettingsGroups): an agent the computer does not
// have is said once. Measured from the testers' dumps and SettingsPages.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { accountsAside, computerAccounts, loginLabel } from '../mobile/src/lib/cloud-accounts';
import { CUSTOM_MODE_FROM_PHONE, MODE_SENTENCE } from '../renderer/src/modes';

const nameless = { id: 'default', email: null, chosen: true, note: null, resetsAt: null, plan: null, running: 0 };

describe('an agent the computer does not have', () => {
  const w = { claude: { found: false }, codex: { found: true }, accounts: [nameless], codexAccounts: [{ id: 'c', email: 'c@example.com', chosen: true }] };

  it('lists none of its logins, so Settings does not count one', () => {
    expect(computerAccounts(w, 'claude')).toEqual([]);
    expect(accountsAside(computerAccounts(w, 'claude'), 0)).toBeUndefined();
  });

  it('still counts what the cloud has', () => {
    expect(accountsAside(computerAccounts(w, 'claude'), 2)).toBe('2 accounts');
  });

  it('leaves the other agent alone', () => {
    expect(computerAccounts(w, 'codex')).toEqual(w.codexAccounts);
  });

  it('gets a page that says so and offers no account or permission rows from the computer', () => {
    const page = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/if \(!w\.claude\.found\) return <Missing engine="claude" \/>/);
    expect(page).toMatch(/if \(!w\.codex\.found\) return <Missing engine="codex" \/>/);
  });
});

describe('a login with no address', () => {
  it('is called by its agent, never "Not signed in" over a line that says it is', () => {
    expect(loginLabel(nameless, 'claude', 0, 1)).toBe('Claude account');
    expect(loginLabel(nameless, 'claude', 1, 2)).toBe('Claude account 2');
    expect(loginLabel({ email: null, name: 'Work' }, 'codex', 0, 1)).toBe('Work');
    expect(loginLabel({ email: 'me@example.com' }, 'claude', 0, 1)).toBe('me@example.com');
  });
});

describe('a permission mode set by hand', () => {
  it('names your computer on the phone, and the computer keeps its own words', () => {
    expect(CUSTOM_MODE_FROM_PHONE).toMatch(/on your computer/);
    expect(MODE_SENTENCE.custom).toMatch(/on this computer/);
    for (const f of ['../mobile/src/ui/SettingsPages.tsx', '../mobile/src/app/settings/project/[slug].tsx']) {
      expect(fs.readFileSync(new URL(f, import.meta.url), 'utf8')).not.toMatch(/MODE_SENTENCE\.custom/);
    }
  });
});
