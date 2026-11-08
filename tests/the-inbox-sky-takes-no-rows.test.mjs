// The Inbox's sky takes no rows (approved 2026-11-08, design 86 v4). The
// earlier band at the foot held the list 190px short, and a long inbox lost
// two to three rows to it. Now the sky is at full strength behind the header and faint
// behind the foot of the list, and the list runs the whole page.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('the Inbox sky', () => {
  it('holds no room back from the list', () => {
    expect(css).not.toMatch(/\.list-pane\s*\{[^}]*margin-bottom/);
    expect(css).not.toMatch(/sky-shown[^{]*\.list-pane\s*\{[^}]*mask-image/);
  });
  it('is faint behind the list and at full strength behind the header', () => {
    expect(css).toMatch(/\.inbox-sky-foot \{ opacity: \.2; \}/);
    expect(css).toMatch(/\.inbox-sky-head \{ transform: scaleY\(-1\);\n/);
    expect(css).not.toMatch(/\.inbox-sky-head \{[^}]*opacity/);
  });
  it('is the one the Inbox draws', () => {
    expect(app).toContain('{skyOnInbox && sky && <InboxSky art={sky.art} />}');
  });
});
