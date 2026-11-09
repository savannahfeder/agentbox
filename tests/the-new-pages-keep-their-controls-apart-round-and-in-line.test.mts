// THE NEW PAGES KEEP THEIR CONTROLS APART, ROUND AND IN LINE.
//
// The owner, 2026-11-02: "some things are inconsistent and some buttons are
// too close to things/touching them". Measured on a team copy with a script that
// lists every pair of controls under 4px apart and every bordered control with
// square corners: the Chats column's rows and search ran into its edges (the
// column had no side padding) and its section heads touched their first row;
// the teammate setup chips, the Team page's buttons and Add by address were
// square beside rounded ones; a person's name sat 12px above their face
// because an empty status line still took its height; and Tasks opened with a
// 17px line over a short rule where Today has a 13px one over a full rule.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rule = (css, sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]()]/g, '\\$&')}[^{]*\\{([^}]*)\\}`))?.[2] ?? '';

describe('the new pages', () => {
  it('pad the Chats column so its rows and search clear its edges', () => {
    const css = read('renderer/src/teammates/teammates.css');
    expect(css).toMatch(/\.gc-list\.cx-list \{ padding: 10px 10px 16px;/);
    expect(rule(css, '.cx-head')).toMatch(/margin-bottom: 2px/);
  });

  it('round the chips and buttons that were square', () => {
    const css = read('renderer/src/soft-corners.css');
    for (const c of ['.cn-button', '.tq-chip', '.ev-msg']) expect(css).toContain(c);
  });

  it('centre a person\'s name on their face when they have no status', () => {
    expect(read('renderer/src/team/everything/TeamStrip.tsx')).toMatch(/if \(!word\) return <span className="ev-s ev-s-blank">/);
    expect(read('renderer/src/team/everything/everything.css')).toMatch(/\.pl-name \.ev-s-blank \{ display: none; \}/);
  });

  it('open Tasks with the line Today opens with', () => {
    const tk = rule(read('renderer/src/team/tasks.css'), '.tk-sum');
    expect(tk).toMatch(/font-size: 13px/);
    expect(tk).toMatch(/padding-bottom: 14px/);
    expect(rule(read('renderer/src/team/tasks.css'), '.tk-col')).toMatch(/max-width: 1320px/);
  });

  it('draw no line under a person\'s empty In progress', () => {
    expect(read('renderer/src/App.tsx')).not.toMatch(/has nothing in progress/);
  });
});
