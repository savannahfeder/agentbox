// SETTINGS ON THE WEB APP SAY ONE THING ABOUT AN AGENT THAT IS NOT INSTALLED,
// AND SAY WHICH PROJECTS THE PHONE ACTUALLY HAS.
//
// What broke (QA batch 005, F-119 and F-118, with Claude Code not installed on
// the paired computer): Settings › Claude Code read "Claude Code is not on this
// computer" and then, underneath, "Not signed in / Signed in / In use" and a
// permission mode — three answers to a question whose answer is that there is
// nothing there. And Settings › Projects listed every project with an Open
// button, including the two never shared with the phone, which reads as an
// offer to work in a folder that was never shared.
import { describe, it, expect } from 'vitest';
import { webSettingsGroups, webProjectRow } from '../renderer/src/web-settings';

const absent = { claude: { found: false }, accounts: [] };
const present = { claude: { found: true }, accounts: [{ id: 'a', email: 'me@example.com' }] };

describe('an agent that is not on the computer', () => {
  it('is said once, and nothing else is offered about it', () => {
    expect(webSettingsGroups(absent, 'claude')).toEqual(['status']);
  });

  // The boundary either side: installed, every group is back, and the status
  // group goes because there is nothing missing to report.
  it('is a full page once it is there', () => {
    expect(webSettingsGroups(present, 'claude')).toEqual(['accounts', 'permissions']);
  });

  // The case that must not match: Codex is asked about separately.
  it('answers for Codex on its own', () => {
    const w = { claude: { found: true }, codex: { found: false } };
    expect(webSettingsGroups(w, 'codex')).toEqual(['status']);
    expect(webSettingsGroups(w, 'claude')).toEqual(['accounts', 'permissions']);
  });
});

describe('a project in the list', () => {
  it('says so when the phone does not have its threads', () => {
    expect(webProjectRow({ slug: 'a', name: 'My Workspace', onPhone: false })).toEqual({
      desc: 'Not on this phone',
    });
  });

  it('says how many are running on one the phone has', () => {
    expect(webProjectRow({ slug: 'b', name: 'Web Todo', onPhone: true, running: 2 })).toEqual({ desc: '2 running' });
  });

  // The boundary: a shared project with nothing running needs no second line.
  it('says nothing more about a quiet project the phone has', () => {
    expect(webProjectRow({ slug: 'b', name: 'Web Todo', onPhone: true })).toEqual({ desc: undefined });
  });
});
