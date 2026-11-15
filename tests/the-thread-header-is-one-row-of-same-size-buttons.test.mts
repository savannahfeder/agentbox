// THE THREAD HEADER IS ONE ROW OF SAME-SIZE BUTTONS.
//
// The header of a thread with people on it read "Add people", "Cloud", "Done"
// and "…" side by side: four buttons with words, and Add people bigger and
// lower than the rest (the owner's screenshot, 2026-11-02: "feels like too many
// buttons with text side by side. add people should not be that big"). Add
// people and where the thread runs are now icons the size of "…", named on
// hover and to a screen reader; Done keeps its word.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rule = (css, sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]="()]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';

describe('the buttons over a thread', () => {
  it('Add people is an icon with its name on hover, not a word', () => {
    const src = read('renderer/src/team/TeamFocus.tsx');
    const buttons = [...src.matchAll(/<button[^>]*className="tm-add-people"[\s\S]*?<\/button>/g)].map((m) => m[0]);
    expect(buttons.length).toBe(2);
    for (const whole of buttons) {
      expect(whole).toMatch(/aria-label="Add people"/);
      expect(whole.replace(/"[^"]*"/g, '""')).not.toMatch(/Add people/);
    }
  });

  it('where it runs is an icon, named on hover', () => {
    const src = read('renderer/src/threads/PlaceButton.tsx');
    const trigger = src.match(/<button[^>]*className=\{`ts-done ts-place[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(trigger).toMatch(/title=\{`Runs on/);
    expect(trigger).not.toMatch(/<span>\{v\.word\}<\/span>/);
  });

  it('Add people sits in the corner row with Done, not in the trail a few points lower', () => {
    const src = read('renderer/src/components/Focus.tsx');
    const corner = src.match(/createPortal\(<span className="ts-top">[\s\S]*?, cornerHeaderTarget\)/)?.[0] ?? '';
    expect(corner).toMatch(/<ConversationAside /);
    expect(src).toMatch(/!cornerHeaderTarget && <ConversationAside /);
  });

  it('both are the size of the More button', () => {
    const team = read('renderer/src/team/team.css');
    const summary = read('renderer/src/threads/summary.css');
    expect(rule(team, '.crumb-aside .tm-add-people')).toMatch(/width:\s*30px/);
    expect(rule(team, '.crumb-aside .tm-add-people')).toMatch(/height:\s*30px/);
    expect(rule(summary, '.ts-done.ts-place')).toMatch(/width:\s*30px/);
    expect(rule(summary, '.ts-more')).toMatch(/width:\s*30px; height:\s*30px/);
  });
});
