// A RELOAD KEEPS THE SETTINGS PAGE YOU WERE ON.
//
// What broke: "When I reload settings it should stay on the same section I was
// on. I often reload and have to renavigate." The note a reload leaves itself
// (renderer/src/where-she-was.ts) said only that Settings was open, so ⌘R on
// Settings › Claude Code came back on Settings › General. Measured by writing
// the note the app writes on that page and reading it back the way a reload
// does: the page was not in it.
//
// The page is now written down by the name a link uses (`claude`,
// `project:kestrel`), and read back through the same `paneFrom` every link
// goes through, so an old or unknown name still lands on General.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeIsSomewhere, readPlace, writePlace } from '../renderer/src/where-she-was';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'components', 'Settings.tsx'), 'utf8');

const store = (seed) => {
  let held = seed ?? null;
  return { getItem: () => held, setItem: (_k, v) => { held = v; }, read: () => held };
};
const acrossAReload = (place) => {
  const s = store();
  writePlace(s, place);
  return readPlace(store(s.read()));
};

describe('the note carries the page', () => {
  it('brings back the page of Settings that was open', () => {
    expect(acrossAReload({ view: 'inbox', settings: true, settingsPage: 'claude' }))
      .toEqual({ view: 'inbox', settings: true, settingsPage: 'claude' });
  });

  it('brings back one project\'s own page, not only the list of projects', () => {
    expect(acrossAReload({ view: 'inbox', settings: true, settingsPage: 'project:kestrel' }).settingsPage)
      .toBe('project:kestrel');
  });

  it('reads a note written before pages were kept as Settings on General', () => {
    const back = readPlace(store(JSON.stringify({ view: 'inbox', settings: true })));
    expect(back.settings).toBe(true);
    expect(back.settingsPage).toBeUndefined();
  });

  it('drops a page when Settings was not open', () => {
    // A page with Settings shut is not a place; restoring it would open
    // Settings on a reload from the inbox.
    const back = readPlace(store(JSON.stringify({ view: 'inbox', settingsPage: 'claude' })));
    expect(back.settings).toBeUndefined();
    expect(back.settingsPage).toBeUndefined();
    expect(placeIsSomewhere(back)).toBe(false);
  });

  it('drops a page that is not a name', () => {
    for (const bad of [4, '', null, { id: 'claude' }]) {
      const back = readPlace(store(JSON.stringify({ view: 'inbox', settings: true, settingsPage: bad })));
      expect(back.settings).toBe(true);
      expect(back.settingsPage).toBeUndefined();
    }
  });
});

describe('the app is wired to it', () => {
  it('has Settings say which page is up, by the name a link uses', () => {
    expect(settings).toContain("onPaneChange?.(typeof pane === 'object' ? `project:${pane.project}` : pane);");
  });

  it('writes that page into the note while Settings is open', () => {
    expect(app).toContain('onPaneChange={setSettingsAt}');
    expect(app).toMatch(/if \(settingsOpen\) \{\s*place\.settings = true;\s*if \(settingsAt\) place\.settingsPage = settingsAt;\s*\}/);
  });

  it('reopens Settings on that page after the reload', () => {
    expect(app).toMatch(/if \(place\.settings\) \{\s*setSettingsPane\(place\.settingsPage \?\? null\);\s*setSettingsOpen\(true\);\s*\}/);
  });

  it('reads the page back through paneFrom, so an unknown one lands on General', () => {
    expect(settings).toContain('const [pane, setPane] = useState<Pane>(() => paneFrom(asked, { team: !!teamPane }));');
    const fn = settings.slice(settings.indexOf('function paneFrom('), settings.indexOf('/* --------------------------------- screen'));
    expect(fn).toContain("if (want.startsWith('project:')) return { project: want.slice('project:'.length) };");
    expect(fn.trim().endsWith("return 'general';\n}")).toBe(true);
  });
});
