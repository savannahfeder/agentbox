// FILES AND TEAM CONTROLS SHARE ONE HEIGHT AND ONE CORNER (w-f702d60afe, 2026-11-21).
//
// A polish review measured the Files toolbar: Recent, Name and the grid and
// list toggle were 26px beside a 32px search box. On Team, the person page's
// buttons and the Standup days and switch had 8px corners where every other
// control has var(--radius), 6px.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
const rule = (src: string, sel: string) => src.match(new RegExp(`\\n${sel.replace(/[.[\]]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? '';

describe('the Files toolbar', () => {
  const files = css('files/files-place.css');
  it('is 32px, the height of its search box', () => {
    expect(rule(files, '.fp-kind')).toContain('height: 32px');
    expect(rule(files, '.fp-view-icon')).toContain('width: 32px');
  });
});

describe('the Team controls', () => {
  it('take the one corner', () => {
    expect(rule(css('team/everything/everything.css'), '.pl-btn')).toContain('border-radius: var(--radius)');
    expect(rule(css('team/standup.css'), '.su-day')).toContain('border-radius: var(--radius)');
    expect(rule(css('team/standup.css'), '.su-tog')).toContain('border-radius: var(--radius)');
  });
});
