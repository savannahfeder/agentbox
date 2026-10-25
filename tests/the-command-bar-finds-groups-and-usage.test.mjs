// ⌘K FOUND NOTHING FOR "ROOMS", "GROUPS" OR "USAGE".
//
// Found in the 3-hour cloud test, 2026-10-22. ⌘K says it reaches everything by
// name, and three things it could not reach:
//
//   rooms, groups   the page itself had no row, so the only way onto it was
//                   the top bar's own menu
//   usage           the Settings row carried no keywords at all, and what is
//                   left of your limit is read on a Settings pane
//
// And the reading itself was on no screen: the corner drew it only when
// `workspaceNavigation` was false, and `workspaceNavigationShown` has returned
// true unconditionally since the walk moved into the same window. The sidebar
// has had a slot for it since 2026-10-01, approved and with its own form in
// UsagePill (`sidebar`) and its own rules in workspace-navigation.css; nothing
// ever passed it anything
// (tests/the-sidebar-keeps-usage-and-instructions-close handed it a stub).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesQuery } from '../renderer/src/palette-rows';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const palette = read('renderer/src/components/Palette.tsx');
const app = read('renderer/src/App.tsx');

/** One row's fields, read out of the source by its id. */
function row(id) {
  const at = palette.indexOf(`id: '${id}'`);
  if (at < 0) return null;
  const text = palette.slice(at, at + 900);
  const take = (field) => text.match(new RegExp(`${field}: (?:\`([^\`]*)\`|'([^']*)')`))?.slice(1).find(Boolean) ?? '';
  return { id, label: take('label'), hint: take('hint'), keywords: take('keywords') };
}

describe('the Groups row', () => {
  const groups = row('view-groups');

  it('exists', () => {
    expect(groups).not.toBe(null);
  });

  it('is found by what people type for it, the old name included', () => {
    for (const typed of ['rooms', 'room', 'groups', 'group', 'chat', 'messages', 'dm']) {
      expect(matchesQuery(typed, groups), typed).toBe(true);
    }
  });

  it('is offered only where there are groups to open', () => {
    expect(palette).toMatch(/roomsOn[\s\S]{0,400}id: 'view-groups'/);
  });

  it('opens a group by its own name too', () => {
    expect(palette).toMatch(/id: `group-\$\{g\.key\}`[\s\S]{0,200}label: g\.name/);
    expect(palette).toMatch(/keywords: `rooms room groups chat channel messages dm \$\{g\.name\}`/);
    expect(app).toMatch(/onPickGroup=\{[^}]*roomsUi\.pickGroup/);
  });
});

describe('usage, by name', () => {
  const usage = row('usage');

  it('has a row of its own that goes where the figure is', () => {
    expect(usage).not.toBe(null);
    for (const typed of ['usage', 'limit', 'limits', 'tokens', 'left', 'quota']) {
      expect(matchesQuery(typed, usage), typed).toBe(true);
    }
    expect(app).toMatch(/onUsage=\{[^}]*setSettingsPane\('claude'\)/);
  });

  it('and Settings is found by the things that are in Settings', () => {
    const settings = row('settings');
    for (const typed of ['usage', 'account', 'theme', 'phone', 'cloud', 'permissions']) {
      expect(matchesQuery(typed, settings), typed).toBe(true);
    }
  });
});

describe('what is left of your limit, on the screen', () => {
  it('is handed to the sidebar slot that was built for it', () => {
    expect(app).toMatch(/usage=\{[\s\S]{0,200}UsagePill[\s\S]{0,300}sidebar/);
  });

  it('is not drawn on a condition that is never true', () => {
    expect(app).not.toMatch(/\{!workspaceNavigation && <UsagePill/);
  });
});
