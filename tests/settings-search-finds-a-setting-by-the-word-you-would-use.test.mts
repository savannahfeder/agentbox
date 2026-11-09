// SETTINGS HAS A SEARCH BOX, AND IT FINDS A SETTING BY THE WORD YOU WOULD USE
// (w-ccadd13c46, 2026-10-05).
//
// The settings screen was redone from scratch after it was called "pretty
// confusing to process and a bit visually unappealing", with Linear's settings
// as the reference, and the search box at the top of its sidebar was the part
// singled out: "I also like the search menu. I think that's a good idea."
//
// Before this there was no way to find a setting except by knowing which page
// it was filed under. Measured on the old screen: the permission mode, the
// accounts, the usage meters, agents at once, the memory switch, your own
// agents, the hints switch, diagnostics and the store path were all on one
// page called General, so nine unrelated answers had one door.
//
// What these tests hold: a setting is found by its own name and by the word a
// person would type for it ("dark", "log out", "ram"); a word only matches at
// the start of a word, so "ode" does not find "mode"; a page that is not on
// this Mac (Codex, Team) is never offered; and a project is found by its name.
import { describe, expect, it } from 'vitest';
import { searchSettings, SETTINGS_PAGES } from '../renderer/src/settings-search.ts';

const everyPage = SETTINGS_PAGES.map((p) => p.id);
const onePerson = everyPage.filter((p) => p !== 'codex' && p !== 'team');
const labels = (hits) => hits.map((h) => `${h.page}: ${h.label}`);

describe('settings search', () => {
  it('finds nothing for an empty box, so the menu comes back', () => {
    expect(searchSettings('', { pages: everyPage })).toEqual([]);
    expect(searchSettings('   ', { pages: everyPage })).toEqual([]);
  });

  it('finds a setting by its own name', () => {
    // The row is "How many run at once" since w-e5225b62ba, and "agents" is one
    // of its words, so the old phrase still has to find it: a renamed setting
    // that stops answering to its old name is a setting nobody can find again.
    expect(labels(searchSettings('agents at once', { pages: everyPage }))[0]).toBe('running: How many run at once');
    expect(labels(searchSettings('theme', { pages: everyPage }))[0]).toBe('appearance: Theme');
  });

  it('finds a setting by the word a person would type for it', () => {
    expect(labels(searchSettings('dark', { pages: everyPage }))).toContain('appearance: Theme');
    expect(labels(searchSettings('log out', { pages: everyPage }))).toContain('general: Your account');
    expect(labels(searchSettings('ram', { pages: everyPage }))).toContain('running: Hold heavy work when memory is short');
    expect(labels(searchSettings('privacy', { pages: everyPage }))).toContain('general: Counts and crash reports');
  });

  it('matches only at the start of a word, so a fragment inside one is not a hit', () => {
    expect(labels(searchSettings('mode', { pages: everyPage }))).toContain('claude: Permission mode');
    expect(searchSettings('ode', { pages: everyPage })).toEqual([]);
    // "to" is a word of its own in no label, and must not hit "into" or "auto".
    expect(labels(searchSettings('uto', { pages: everyPage }))).toEqual([]);
  });

  it('needs every word, not any one of them', () => {
    expect(labels(searchSettings('codex permission', { pages: everyPage }))).toEqual(['codex: Permission mode']);
    expect(searchSettings('theme zebra', { pages: everyPage })).toEqual([]);
  });

  it('puts a hit on the name ahead of a hit on a hidden word', () => {
    // "Signed in" is the agents' row by name and Your account's by a hidden word.
    const hits = labels(searchSettings('signed', { pages: everyPage }));
    expect(hits[0]).toBe('claude: Signed in');
    expect(hits.indexOf('general: Your account')).toBeGreaterThan(hits.indexOf('codex: Signed in'));
  });

  it('finds the logins by the word account, though the heading never says it', () => {
    expect(labels(searchSettings('account', { pages: onePerson }))).toContain('claude: Signed in');
  });

  it('never offers a page this Mac does not have', () => {
    expect(labels(searchSettings('codex', { pages: onePerson }))).toEqual([]);
    expect(labels(searchSettings('invite', { pages: onePerson }))).toEqual([]);
    expect(labels(searchSettings('invite', { pages: everyPage }))).toContain('team: Team');
  });

  it('finds a project by its name and opens its own page', () => {
    const hits = searchSettings('kes', { pages: everyPage, projects: [{ slug: 'kestrel', name: 'Kestrel' }, { slug: 'onboard', name: 'Onboard' }] });
    expect(hits.map((h) => h.page)).toEqual(['project:kestrel']);
    expect(hits[0].pageLabel).toBe('Projects');
  });

  it('ignores case and punctuation', () => {
    expect(labels(searchSettings('CLAUDE-CODE usage', { pages: everyPage }))).toEqual(['claude: Usage']);
  });
});
