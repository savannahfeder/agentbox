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

/* THE CARD BECAME A PAGE IN THE REDRAW (w-ccadd13c46, 2026-10-05). Each coding
   agent has its own page in the settings menu, its usage, its logins and its
   permissions as headed cards of rows, styled in components/settings.css. What
   this file protects did not move: the live account is said four ways, nothing
   is marked until she picks, no control is an opaque plate, and one agent's
   story is told in one place. */
const settingsCss = read('renderer/src/components/settings.css');
/** A rule in settings.css, found by the end of its selector. */
const pageRule = (tail) => {
  const at = settingsCss.indexOf(`${tail} {`);
  return at < 0 ? '' : settingsCss.slice(at, settingsCss.indexOf('}', at));
};
const enginePage = settings.slice(settings.indexOf('const enginePage = (engine'), settings.indexOf('<div className="set-nav">'));

describe('the live account cannot be missed', () => {
  // HER NOTE, AND THE WHOLE REASON THIS ROUND EXISTS. One cue was missable and
  // she proved it, so the live row now says it four ways at once.
  it('says it four ways: a brighter film, full white, a rule, and the word', () => {
    const on = pageRule('.set-plate > .set-acct-row.on');
    expect(on).toMatch(/background:\s*var\(--film-strong\)/);
    expect(on).toMatch(/border-left:\s*3px solid var\(--text\)/);
    expect(pageRule('.set-plate > .set-acct-row.on .set-row-label')).toMatch(/color:\s*var\(--text\)/);
    expect(card).toContain('{live && <span className="set-badge">In use</span>}');
    expect(card).toContain("className={`set-row set-acct-row${live ? ' on' : ''}`}");
  });

  // THE WORD SITS BESIDE THE ADDRESS. On the round she rejected it was out on
  // the right margin, where a row's quietest corner is, and she missed it.
  it('puts the words beside the address and not on the right margin', () => {
    const row = card.slice(card.indexOf('set-acct-row'), card.indexOf('</div>\n            {/* One account'));
    expect(row.indexOf('{label}')).toBeGreaterThan(-1);
    expect(row.indexOf('{label}')).toBeLessThan(row.indexOf('set-badge'));
    // Inside the label's own line, not in the control column on the right.
    expect(row.slice(row.indexOf('set-row-label'), row.indexOf('set-badge'))).not.toContain('</div>');
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
    // The default sits in the light block with every other colour token, which
    // is where tests/theme-tokens.test.mjs insists a token be answered, and the
    // override sits with the controls it is for.
    expect(ruleFor(':root')).toMatch(/--control-face:\s*var\(--surface\)/);
    // NOT `ruleFor` for the skin block: its escape is written
    // `[.*+?^${}()|[\\]\\\\]`, which asks for one of those characters FOLLOWED
    // BY a `\]` rather than escaping a bracket, so any selector with a `[` in
    // it comes back empty. Harmless everywhere it has been used, and a trap
    // here. Read for the block by name instead.
    const skinBlock = css.slice(css.indexOf('\n:root[data-skin] {'));
    expect(skinBlock.slice(0, skinBlock.indexOf('}'))).toMatch(/--control-face:\s*var\(--skin-pane\)/);
    expect(css).toMatch(/--surface:\s*#2e3136/);
    expect(css).toMatch(/--wash:\s*rgba\(255,\s*255,\s*255,\s*0\.065\)/);
  });

  it('builds every control in the card out of a film of white', () => {
    // Through a TOKEN, never a literal: a raw white rgba is invisible on the
    // light theme, which is the bug tests/theme-tokens.test.mjs exists for.
    // The cards are a wash and the live row a stronger film; the buttons are
    // `.set-ghost`, which the test above proves is a film too.
    expect(pageRule('.set-plate:not(.set-keys)')).toMatch(/background:\s*var\(--wash\)/);
    expect(pageRule('.set-plate > .set-acct-row.on')).toMatch(/background:\s*var\(--film-strong\)/);
    // Nothing on the page reaches for the opaque token.
    expect(settingsCss).not.toMatch(/var\(--surface\)/);
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
    expect(enginePage).toContain('<UsageRows reading={agent.reading}');
    expect(enginePage).toContain('<AccountRows');
    expect(settings).toContain("{model && w && pane === 'claude' && enginePage('claude')}");
  });

  // The pieces it replaced are gone, or the pages say the same thing twice.
  it('leaves no second copy of the old groups', () => {
    const general = settings.slice(settings.indexOf("pane === 'general' && ("), settings.indexOf("pane === 'claude' && enginePage"));
    expect(general.length).toBeGreaterThan(0);
    for (const piece of ['<UsageOverview', '<UsageRows', '<AccountRows', '<ClaudeCode', '<CodexCli']) {
      expect(general).not.toContain(piece);
    }
  });

  it('keeps the usage markup it was already using', () => {
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
