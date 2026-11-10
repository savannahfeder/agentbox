// Team and Files were plain while Home and the Inbox wore the sky, so the app
// read as two themes. Measured on the stand-in team (scripts/lib/groups-stage.mjs)
// with the dark orange sky: Team and Files had no sky at all. They now draw the
// Inbox's header sky, on dark skies only, and never on a phone.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const rule = app.match(/const skyOnPlace = [^;]*;/)?.[0] ?? '';

describe('Team and Files under a sky', () => {
  it('wear it on the Team place and on Files', () => {
    expect(rule).toContain('chatsPlaceShown');
    expect(rule).toContain('filesShown');
  });

  it('only on a dark sky, and never on a phone', () => {
    expect(rule).toMatch(/^const skyOnPlace = !!sky && sky\.dark && !onPhone\(\) &&/);
  });

  it('not on Connections', () => {
    expect(rule).not.toContain('connectionsShown');
  });

  it('draw the Inbox sky, the same one at the same height', () => {
    expect(app).toContain('{skyOnPlace && sky && <InboxSky art={sky.art} />}');
  });

  it('mark the window so the header rule goes and the Team list lets the sky through', () => {
    expect(app).toContain("${skyOnPlace ? ' sky-shown sky-place' : ''}");
    expect(css).toMatch(/\.app\.sky-place \.cx-list \{ background: transparent; \}/);
  });

  it('leave the Inbox sky as it was', () => {
    expect(app).toContain('{skyOnInbox && sky && <InboxSky art={sky.art} />}');
    expect(app).toMatch(/const skyOnInbox = [\s\S]*?!filesShown && !connectionsShown && !chatsPlaceShown && !evPick;/);
  });
});
