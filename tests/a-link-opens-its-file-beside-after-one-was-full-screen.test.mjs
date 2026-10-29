// A FILE NAMED IN A MESSAGE OPENS BESIDE IT, EVEN AFTER ANOTHER FILE WAS FULL
// SCREEN (w-537e33573d, 2026-10-29).
//
// What broke: on the one-at-a-time page, a note read in place has "Open full
// screen". Pressing it set the app's mode to full screen, and closing the file
// left that mode set. Every file opened after it, from a link in an answer, on
// this thread or the next, opened full screen instead of beside. Measured in
// the browser copy at 1920x1080: a link opened beside on a fresh thread, then
// full screen after Esc, after the exit mark, and after J to the next thread.
//
// App.tsx is too large to render here, so this reads its wiring, as the other
// beside-or-focus tests do.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const app = read('App.tsx');

it('puts full screen down once no file is open', () => {
  expect(app).toMatch(/useEffect\(\(\) => \{\s*if \(openDoc\) return;\s*setArtifactMode\('beside'\);\s*setArtifactReturnBeside\(false\);\s*\}, \[openDoc\]\);/);
});

it('opens a linked file without asking for a mode, so it takes beside', () => {
  const linkOpener = app.slice(app.indexOf('onOpenDoc={(src, at) =>'), app.indexOf('parent={focused.parent'));
  expect(linkOpener).toContain('setOpenDoc({');
  expect(linkOpener).not.toContain('setArtifactMode');
});

it('still opens full screen when full screen is what was pressed', () => {
  expect(read('components/Focus.tsx')).toContain("onOpenArtifact?.(path, 'focus')");
  expect(app).toContain('setArtifactMode(mode); setOpenDoc({product: focused.product, src});');
});

it('keeps a file that is still open full screen until it closes', () => {
  expect(app).toContain("onMode={mode => { setArtifactReturnBeside(artifactMode === 'beside'); setArtifactMode(mode); }}");
  expect(app).toContain("if (artifactMode === 'focus' && artifactReturnBeside) setArtifactMode('beside');");
});
