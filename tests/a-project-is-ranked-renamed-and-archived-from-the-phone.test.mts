// A PROJECT IS RANKED, RENAMED AND ARCHIVED FROM THE PHONE.
//
// The desktop ranks a project first (⌘K's `rank-<slug>` rows,
// `zero:set-product-order`), renames one (`zero:project-rename`) and archives
// one (`zero:project-archive`). On the phone the Projects list was in the
// computer's folder order, not its running order, and checkSetting refused
// `productOrder`, `name` and `archived` (measured 2026-11-08).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { checkSetting, settingRoute, phoneSettingsOf } from '../shared/phone-settings.mts';
import { moveProduct } from '../shared/rank.mts';
import { phoneCommands } from '../mobile/src/lib/palette';

const proj = (key, value, product = 'alpha') => checkSetting({ scope: 'project', product, key, value });
const ws = (key, value) => checkSetting({ scope: 'workspace', key, value });
const p = (slug, name, createdAt) => ({ slug, name, createdAt, onPhone: true, autonomous: false, permission: 'workspace', codexMode: 'workspace', account: 'any', running: 0, dir: `/Users/someone/${slug}` });
const model = (order = []) => ({
  ok: true,
  workspace: { memoryGate: {}, leftovers: {}, accounts: [], codex: {}, productOrder: order },
  projects: [p('alpha', 'Alpha', 1), p('beta', 'Beta', 2), p('gamma', 'Gamma', 0)],
});

describe('a new name', () => {
  it('is words, up to 120 of them', () => {
    expect(proj('name', 'Launch film')).toBeNull();
    expect(proj('name', 'x'.repeat(120))).toBeNull();
    for (const v of ['', '   ', 'x'.repeat(121), null, 7]) expect(proj('name', v)).not.toBeNull();
  });

  it('reaches the window\'s rename, trimmed', () => {
    expect(settingRoute({ scope: 'project', product: 'alpha', key: 'name', value: '  Launch film ' }, model()))
      .toEqual(['zero:project-rename', { product: 'alpha', name: 'Launch film' }]);
  });
});

describe('archiving', () => {
  it('is a yes only: bringing one back is the desktop\'s', () => {
    expect(proj('archived', true)).toBeNull();
    for (const v of [false, 'yes', null]) expect(proj('archived', v)).not.toBeNull();
  });

  it('reaches the window\'s archive', () => {
    expect(settingRoute({ scope: 'project', product: 'beta', key: 'archived', value: true }, model()))
      .toEqual(['zero:project-archive', { product: 'beta', archived: true }]);
  });
});

describe('the running order', () => {
  it('is a list of project names, each once', () => {
    expect(ws('productOrder', ['beta', 'alpha'])).toBeNull();
    for (const v of [[], ['beta', 'beta'], ['../x'], 'beta', null, Array.from({ length: 501 }, (_, i) => `p${i}`)]) expect(ws('productOrder', v)).not.toBeNull();
  });

  it('reaches the window\'s own order handler, and only with projects this computer has', () => {
    expect(settingRoute({ scope: 'workspace', key: 'productOrder', value: ['beta', 'alpha'] }, model()))
      .toEqual(['zero:set-product-order', { order: ['beta', 'alpha'] }]);
    expect(() => settingRoute({ scope: 'workspace', key: 'productOrder', value: ['beta', 'nope'] }, model())).toThrow(/not on this computer/);
  });

  it('is the order the copy lists projects in: the ranked first, then the rest oldest first', () => {
    const copy = phoneSettingsOf(model(['beta']), { version: '1' });
    expect(copy.projects.map((x) => x.slug)).toEqual(['beta', 'gamma', 'alpha']);
    expect(copy.workspace.productOrder).toEqual(['beta']);
    expect(JSON.stringify(copy)).not.toMatch(/\/Users\//);
  });
});

describe('the phone\'s commands', () => {
  const computer = { paused: false, projects: [{ slug: 'beta', name: 'Beta' }, { slug: 'gamma', name: 'Gamma' }, { slug: 'alpha', name: 'Alpha' }], order: ['beta'] };
  const all = phoneCommands({ team: false, computer });
  it('offer Rank X first for each project, saying where it stands', () => {
    expect(all.find((c) => c.id === 'rank-beta')).toMatchObject({ label: 'Rank Beta first', aside: 'now #1 of 3' });
    expect(all.find((c) => c.id === 'rank-alpha')).toMatchObject({ label: 'Rank Alpha first', aside: 'not ranked yet' });
  });

  it('send the whole order with that project at the top', () => {
    expect(all.find((c) => c.id === 'rank-alpha').act).toEqual({ setting: { scope: 'workspace', key: 'productOrder', value: moveProduct(['beta', 'gamma', 'alpha'], 'alpha', 0) } });
  });
});

describe('the project\'s page on the phone', () => {
  const src = fs.readFileSync(new URL('../mobile/src/app/settings/project/[slug].tsx', import.meta.url), 'utf8');
  it('renames, archives and ranks it first', () => {
    expect(src).toMatch(/set\('name', /);
    expect(src).toMatch(/label="Archive this project"/);
    expect(src).toMatch(/set\('archived', true\)/);
    expect(src).toMatch(/title="Rank first"/);
    expect(src).toMatch(/key: 'productOrder'/);
  });

  it('is reached from a Projects list in the running order, a waiting reorder laid over it', () => {
    const pages = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/s\.reading\('workspace', 'productOrder'/);
  });
});
