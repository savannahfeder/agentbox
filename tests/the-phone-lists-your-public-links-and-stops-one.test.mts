// THE PHONE LISTS YOUR PUBLIC LINKS AND STOPS ONE.
//
// The desktop's General page lists every link anyone can open to one of your
// files (Settings.tsx `PublicLinks`, from `zero:file-links`) and stops one
// (`zero:file-link-stop`). The phone had neither: the computer's copy of its
// settings carried no links, checkSetting refused any key to stop one, and
// `settings:general/Public links` was a gap in the parity ledger (measured
// 2026-11-08 with `node scripts/phone-parity.mjs`). The links ride in the copy,
// without the file each came from, and stopping one is a workspace setting
// checked against that list.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { checkSetting, phoneSettingsOf, settingRoute } from '../shared/phone-settings.mts';
import { applyThrough } from '../main/phone-inbox.mts';
import { publicLinkLine } from '../renderer/src/public-link-words';
import { linksShown } from '../mobile/src/lib/public-links';
import { phoneSettingsRows } from '../mobile/src/lib/settings-rows';
import { searchSettings } from '../renderer/src/settings-search';

const NOW = Date.UTC(2026, 10, 8, 15);
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const link = (over = {}) => ({ token: TOKEN, url: `https://agentbox.ac/f/${TOKEN}`, source: 'alpha/w-1/designs/plan.md', name: 'plan.md', kind: 'markdown', createdAt: NOW - 3_600_000, updatedAt: NOW - 3_600_000, comments: 0, ...over });
const model = (links) => ({ ok: true, workspace: { memoryGate: {}, leftovers: {}, accounts: [], codex: {} }, projects: [], ...(links ? { links } : {}) });

describe('the copy the computer sends', () => {
  it('carries each live link\'s name, address, times and comment count, never the file it came from', () => {
    const got = phoneSettingsOf(model([link({ comments: 2 })]), { version: '1' }).workspace.publicLinks;
    expect(got).toEqual([{ token: TOKEN, name: 'plan.md', url: `https://agentbox.ac/f/${TOKEN}`, createdAt: NOW - 3_600_000, updatedAt: NOW - 3_600_000, comments: 2 }]);
    expect(JSON.stringify(got)).not.toContain('designs/plan.md');
  });

  it('carries none when the computer has none, or could not ask the cloud', () => {
    expect(phoneSettingsOf(model([]), { version: '1' }).workspace.publicLinks).toEqual([]);
    expect(phoneSettingsOf(model(null), { version: '1' }).workspace.publicLinks).toEqual([]);
  });

  it('is laid on by the phone pass from the desktop\'s own list', () => {
    expect(fs.readFileSync('main/main.mts', 'utf8')).toMatch(/phoneChannels\.get\('zero:file-links'\)/);
  });
});

describe('stopping one from the phone', () => {
  it('takes a link\'s token and nothing else', () => {
    expect(checkSetting({ scope: 'workspace', key: 'stopLink', value: TOKEN })).toBeNull();
    for (const v of ['', '../x', 'a b', true, null, 7, 'x'.repeat(200)]) expect(checkSetting({ scope: 'workspace', key: 'stopLink', value: v })).not.toBeNull();
  });

  it('reaches the desktop\'s own stop, for a link on the computer\'s list', () => {
    expect(settingRoute({ scope: 'workspace', key: 'stopLink', value: TOKEN }, model([link()]))).toEqual(['zero:file-link-stop', { token: TOKEN }]);
  });

  it('is refused for a link that is not on that list', () => {
    expect(() => settingRoute({ scope: 'workspace', key: 'stopLink', value: 'f'.repeat(40) }, model([link()]))).toThrow(/not one of your public links/);
    expect(() => settingRoute({ scope: 'workspace', key: 'stopLink', value: TOKEN }, model(null))).toThrow(/not one of your public links/);
  });

  it('asks the cloud for the list when it stops one, and stops only that one', async () => {
    const stopped = [];
    const channels = new Map([
      ['zero:settings-read', async () => model()],
      ['zero:file-links', async () => ({ ok: true, site: 'https://agentbox.ac', links: [link()] })],
      ['zero:file-link-stop', async (_e, arg) => { stopped.push(arg); return { ok: true }; }],
    ]);
    const apply = applyThrough(channels);
    await apply({ kind: 'setting', payload: { scope: 'workspace', key: 'stopLink', value: TOKEN } });
    await expect(apply({ kind: 'setting', payload: { scope: 'workspace', key: 'stopLink', value: 'f'.repeat(40) } })).rejects.toThrow(/not one of your public links/);
    expect(stopped).toEqual([{ token: TOKEN }]);
  });
});

describe('the phone\'s General page', () => {
  const page = fs.readFileSync('mobile/src/ui/SettingsPages.tsx', 'utf8');
  it('draws each link as the desktop does, with the desktop\'s line under it', () => {
    expect(page).toMatch(/label="Public links"/);
    expect(page).toMatch(/desc=\{publicLinkLine\(l, /);
    expect(page).toMatch(/shareWords\.stopAsk\(l\.comments\)/);
    expect(page).toMatch(/key: 'stopLink', value: l\.token/);
    expect(publicLinkLine(link({ comments: 1, updatedAt: NOW - 60_000 }), NOW)).toMatch(/^Updated today at .* · 1 comment$/);
  });

  it('takes a link off the list the moment it is stopped, and puts it back if the computer refuses', () => {
    const other = link({ token: 'b'.repeat(40), name: 'film.mp4' });
    expect(linksShown([link(), other], { value: TOKEN, waiting: true, refused: null }).map((l) => l.name)).toEqual(['film.mp4']);
    expect(linksShown([link(), other], { value: TOKEN, waiting: false, refused: 'that link is not one of your public links' }).map((l) => l.name)).toEqual(['plan.md', 'film.mp4']);
    expect(linksShown([link(), other], { value: null, waiting: false, refused: null })).toHaveLength(2);
  });

  it('is found by Settings search only while there are links to draw', () => {
    const find = (settings) => searchSettings('public links', { pages: ['general'], rows: phoneSettingsRows(settings) }).map((h) => `${h.page}/${h.label}`);
    expect(find({ workspace: { publicLinks: [link()] } })).toEqual(['general/Public links']);
    expect(find({ workspace: { publicLinks: [] } })).toEqual([]);
    expect(find(null)).toEqual([]);
  });

  it('shows in the browser preview, which stops one as the computer would', () => {
    const preview = fs.readFileSync('mobile/src/lib/preview.ts', 'utf8');
    expect(preview).toMatch(/publicLinks: \[/);
    expect(preview).toMatch(/key === 'stopLink'/);
  });
});
