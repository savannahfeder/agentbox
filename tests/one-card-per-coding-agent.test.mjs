// ONE CARD PER CODING AGENT, AND THE ACCOUNT SHE IS ON.
//
// The page described one agent in THREE places that never touched: a Usage
// block naming both agents, a connection card each, and an accounts group under
// one of them. So the question anybody opens Settings with, which account am I
// on and how much is left, was answered in pieces.
//
// Two things this file holds, and they are the two she had to say twice.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const css = read('renderer/src/styles.css');
const card = settings.slice(settings.indexOf('type CardAccount = {'), settings.indexOf('const Group = ({'));

/**
 * The rule that draws one class, so a test asks the stylesheet rather than
 *  trusting a name to still mean something. */
const ruleFor = (sel) => {
  const m = css.match(new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('the live account cannot be missed', () => {
  // HER NOTE, AND THE WHOLE REASON THIS ROUND EXISTS. One cue was missable and
  // she proved it, so the live row now says it four ways at once.
  it('says it four ways: a brighter film, full white, a rule, and the word', () => {
    const on = ruleFor('.ac-item.on');
    expect(on).toMatch(/background:\s*var\(--film-strong\)/);
    expect(on).toMatch(/border-left-color:\s*var\(--text\)/);
    expect(ruleFor('.ac-item.on .ac-item-mail')).toMatch(/color:\s*var\(--text\)/);
    expect(card).toContain('{live && <span className="ac-badge">In use</span>}');
  });

  // THE WORD SITS BESIDE THE ADDRESS. On the round she rejected it was out on
  // the right margin, where a row's quietest corner is, and she missed it.
  it('puts the words beside the address and not on the right margin', () => {
    const row = card.slice(card.indexOf('aria-pressed={live}'), card.indexOf('</button>', card.indexOf('aria-pressed={live}')));
    expect(row.indexOf('ac-item-mail')).toBeLessThan(row.indexOf('ac-badge'));
    expect(row.indexOf('ac-badge')).toBeLessThan(row.indexOf('ac-item-end'));
  });

  // AND NOTHING IS MARKED WHEN SHE HAS NOT PICKED, because until she does every
  // account really does run. Marking one at random would be the card telling
  // her something about her own machine that is not true.
  it('marks nothing until she has picked one', () => {
    expect(card).toContain('const picked = accounts.some((a) => a.chosen);');
    expect(card).toContain('const live = picked ? a.chosen : false;');
  });
});

describe('nothing in the card is a black square', () => {
  // The reported fault was black squares on the transparent themes.
  // `.set-ghost` was `background: var(--surface)`, and on every haze skin
  // `--surface` is the opaque #2e3136 while the card is `--wash`, which is
  // white at 6.5%.
  //
  // THE PREMISE IS GONE AT THE SOURCE SINCE 2026-09-22, and this check is what
  // records that. The second complaint in the same family was about the light
  // hazes, where that same `--surface` plate comes out near white rather than
  // near black. Every control's face is `--control-face` now, which is
  // `--surface` on a plain theme and the pane's own glass under a picture. So
  // the card's rule below is no longer the only place in the app where a
  // control over glass is translucent; it is now the way every control is made.
  //
  // AND THE TOKEN MOVED ON AGAIN ON 2026-09-24, which does not touch this
  // claim. `--control-face` is white with some transparency in EVERY theme, so
  // under a light haze it reads as a white slab; her rule the day before was
  // that a light mode component never has a plain white background. The four
  // controls that filled themselves with it now use `--film-strong`, which is
  // ALSO translucent -- a tint of the theme rather than a plate on top of it --
  // so the thing this test is about is unchanged and only the name is different.
  // tests/a-light-component-is-never-plain-white.test.mjs holds the new rule.
  it('proves no control is an opaque plate over glass any more', () => {
    // Translucent, and specifically not the opaque `--surface` that started it.
    expect(ruleFor('.set-ghost')).toMatch(/background:\s*var\(--film-strong\)/);
    expect(ruleFor('.set-ghost')).not.toMatch(/background:\s*var\(--surface\)/);
    // The token sits in the one token block with every other colour token.
    // The picture override (`:root[data-skin]`) and the dark values went when
    // the app went to one light look, so the light block is the whole answer.
    expect(ruleFor(':root')).toMatch(/--control-face:\s*var\(--surface\)/);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain(':root[data-skin]');
  });

  it('builds every control in the card out of a film of white', () => {
    // Through a TOKEN, never a literal: a raw white rgba is invisible on the
    // light theme, which is the bug tests/theme-tokens.test.mjs exists for.
    expect(ruleFor('.ac-item:hover')).toMatch(/background:\s*var\(--wash\)/);
    expect(ruleFor('.ac-item.on')).toMatch(/background:\s*var\(--film-strong\)/);
    // Nothing in the card reaches for the opaque token, or for the two classes
    // that do.
    const block = css.slice(css.indexOf('/* ===== ONE CARD PER CODING AGENT'));
    expect(block).not.toMatch(/background:\s*var\(--surface\)/);
    expect(card).not.toContain('set-ghost');
    expect(card).not.toContain('Segbar');
  });

  // AND NO DRAWN ICONS. Every mark is type or a rule; a tick drawn in an earlier
  // round was one more shape to learn.
  it('draws no icons inside the card', () => {
    expect(card).not.toContain('<svg');
  });
});

describe('the card gathers what the page used to scatter', () => {
  it('holds the agent, its limits and its logins in one place', () => {
    expect(card).toContain('<CardMeters reading={agent.reading}');
    expect(card).toContain('className="ac-list"');
    expect(settings).toContain('<AgentCard');
  });

  // The pieces it replaced are gone, or the page says the same thing twice.
  it('leaves no second copy of the old groups', () => {
    const pane = settings.slice(settings.indexOf("pane === 'general'"), settings.indexOf("pane === 'agents'"));
    expect(pane).not.toContain('<UsageOverview');
    expect(pane).not.toContain('<ClaudeCode');
    expect(pane).not.toContain('<CodexCli');
  });

  it('keeps the usage markup it was already using', () => {
    expect(card).toContain('className="settings-usage-window"');
    expect(card).toContain('className="usage-meter wide"');
  });
});

describe('picking an account moves the work onto it', () => {
  const emptyStore = { listProducts: () => [], read: () => null };

  const sup = (config) => new Supervisor({ storeRoot: '/tmp', home: os.homedir(), ...config }, emptyStore, '/tmp');

  it('runs on every account while she has picked none, as it always has', () => {
    const s = sup({ codexProfiles: ['default', '~/.codex-work'] });
    expect(s._profilesFor('codex')).toEqual(['default', '~/.codex-work']);
  });

  // THE ASK THIS WHOLE ROW CAME FROM.
  it('narrows to the one she picked', () => {
    const s = sup({ codexProfiles: ['default', '~/.codex-work'], activeAccount: { codex: '~/.codex-work' } });
    expect(s._profilesFor('codex')).toEqual(['~/.codex-work']);
  });

  it('keeps the two engines apart, because both call their first login default', () => {
    const s = sup({
      authProfiles: ['default'],
      codexProfiles: ['default', '~/.codex-work'],
      activeAccount: { codex: '~/.codex-work' },
    });
    // A Codex pick must not narrow Claude, which is the collision `_accountKey`
    // exists to prevent, wearing different clothes.
    expect(s._profilesFor('codex')).toEqual(['~/.codex-work']);
    expect(s._profilesFor('claude')).toContain('default');
  });

  // A SETTING THAT NAMES NOTHING REAL MUST NOT WEDGE THE FLEET. A login she has
  // since removed would otherwise empty the pool and stop everything, with the
  // app looking perfectly healthy.
  it('ignores a pick that no longer names a login', () => {
    const s = sup({ codexProfiles: ['default'], activeAccount: { codex: '~/.gone' } });
    expect(s._profilesFor('codex')).toEqual(['default']);
  });

  // THE USAGE FIGURE FOLLOWS THE PICK. w-cad7e3e509, 2026-09-24: she switched
  // Codex to her second login and the card kept showing the first one's 99%,
  // because the reader was pinned to the primary home while the work moved.
  it('reads usage from the login she picked, not the primary one', () => {
    const s = sup({ codexProfiles: ['default', '/tmp/codex-work'], activeAccount: { codex: '/tmp/codex-work' } });
    expect(s._codexUsageHome()).toBe('/tmp/codex-work');
  });

  it('reads usage from the primary login while she has picked none', () => {
    const s = sup({ codexProfiles: ['default', '/tmp/codex-work'] });
    expect(s._codexUsageHome()).toBe(s._codexHome());
  });

  it('reads usage from the primary login when the pick names nothing real', () => {
    const s = sup({ codexProfiles: ['default'], activeAccount: { codex: '/tmp/gone' } });
    expect(s._codexUsageHome()).toBe(s._codexHome());
  });
});
