// SHARE IS A BUTTON BESIDE DONE (w-f702d60afe, 2026-11-21).
//
// The founder, trying to hand a thread off, "naturally clicked Share"; a
// hand-off review found asking, handing over and sharing lived only behind the
// "…" button, so a first-time user's first clicks were a guess. On your own
// thread on a team the top bar now has Share beside Done, and it opens the
// panel that asks, hands over and shares.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';

const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');

describe('the Share button', () => {
  it('is drawn only where the thread can be shared and given, before Done', () => {
    const at = menu.indexOf('{share && shareButton && <button type="button" className="ts-done ts-share"');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(menu.indexOf('data-hint="done"'));
  });
  it('opens the share panel, and closes it when pressed again', () => {
    expect(menu).toContain("onClick={() => { if (open && sharing) { close(false); return; } close(false); setOpen(true); setSharing('list'); setShareDirect(true); }}>");
  });
  it('opens with no Back row, since no menu sits behind it', () => {
    expect(menu).toContain('onBack={shareDirect ? undefined : () => setSharing(null)} />;');
    expect(menu).toContain('    setShareDirect(false);');
  });
  it('wears the same mark as the menu row', () => {
    expect(menu).toContain('<PeopleMark /><span>Share</span>');
    expect(menu).toMatch(/share: PeopleMark/);
  });
});

// A regression look: the menu's first row repeated the Share button.
describe('the menu beside it', () => {
  it("leaves out the share row while the button is there", () => {
    expect(menu).toContain('share: !!share, shareButton, shareSays,');
    const ids = threadMenuRows({ change: false, terminal: null, finish: true, share: true, shareButton: true, give: true }).map((r) => r.id);
    expect(ids).not.toContain('share');
    expect(ids).not.toContain('give');
  });
});
