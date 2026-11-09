// The Inbox's sky takes no rows (approved 2026-11-08, design 86). The
// earlier band at the foot held the list 190px short, and a long inbox lost
// two to three rows to it. Now the sky is at full strength behind the header and nowhere
// else, and the list runs the whole page.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('the Inbox sky', () => {
  it('holds no room back from the list', () => {
    expect(css).not.toMatch(/\.list-pane\s*\{[^}]*margin-bottom/);
    expect(css).not.toMatch(/sky-shown[^{]*\.list-pane\s*\{[^}]*mask-image/);
  });
  it('is at full strength behind the header and nowhere else', () => {
    expect(css).not.toContain('inbox-sky-foot');
    expect(css).toMatch(/\.inbox-sky-head \{ transform: scaleY\(-1\);\n/);
    expect(css).not.toMatch(/\.inbox-sky-head \{[^}]*opacity/);
  });
  it('is the one the Inbox draws', () => {
    expect(app).toContain('{skyOnInbox && sky && <InboxSky art={sky.art} />}');
  });
});

describe('in light themes', () => {
  it('the Inbox stays plain, with no sky', () => {
    expect(app).toMatch(/const skyOnInbox = !!sky && sky\.dark && !homeShown &&/);
  });
});
