// Teammates (w-4bd7b5548b) were reachable only from the sidebar, so with it
// folded shut ⌘K found nothing for "teammate", "Ada" or "new teammate". The
// command bar now offers the team chat, the page that makes a new one, and
// each teammate by name, and says which it is opening.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Palette } from '../renderer/src/components/Palette';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

const draw = (props) => renderToStaticMarkup(createElement(Palette, {
  products: [], order: [], look: 'dark', onSetLook() {}, onClose() {}, onSearch() {}, ...props,
}));
const ADA = { id: 't-aaaaaaaaaa', name: 'Ada', role: 'Quality lead' };
const FELIX = { id: 't-ffffffffff', name: 'Felix', role: null };

describe('teammates in the command bar', () => {
  it('offers the team chat, a new teammate, and each teammate by name', () => {
    const html = draw({ teammates: [ADA, FELIX], onTeammates() {} });
    expect(html).toContain('Teammates');
    expect(html).toContain('New teammate');
    expect(html).toContain('Ada');
    expect(html).toContain('Quality lead');
    expect(html).toContain('Felix');
  });

  // The power tester typed "pause" and found only "Pause agents", which says
  // nothing about one teammate.
  it('pauses or resumes one teammate by name', () => {
    const html = draw({ teammates: [ADA, { ...FELIX, paused: true }], onTeammates() {}, onPauseTeammate() {} });
    expect(html).toContain('Pause Ada');
    expect(html).toContain('Resume Felix');
    expect(html).not.toContain('Pause Felix');
  });

  it('still offers the team chat and a new one with nobody started yet', () => {
    const html = draw({ teammates: [], onTeammates() {} });
    expect(html).toContain('New teammate');
  });

  it('offers none of it where there are no teammates to have', () => {
    const html = draw({ teammates: null, onTeammates() {} });
    expect(html).not.toContain('New teammate');
  });

  it('is wired to the page that opens them', () => {
    expect(app).toMatch(/onTeammates=\{\(which\) => \{ setModal\(null\); teammatesUi\.go\(which\); \}\}/);
  });
});
