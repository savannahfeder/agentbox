// WHERE THE KEY HINT HANGS, AND WHAT IT IS MADE OF.
//
// w-2f7fac6027, five rounds of pictures in the real app. The hint used to swap
// a row's right end for two keycaps. The rule now: hovering over a component
// that has a shortcut shows, after a delay of a second or two, a plate around
// the component, rather than changing the component itself.
//
// The placement rule is one sentence and it is worth a test rather than an eye,
// because it has an exception that only fires near the floor of the window and
// a shot of the ordinary case would never catch it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINTS, HINT_GAP, HINT_MARGIN, capsFor, placeHint } from '../renderer/src/hint-plate';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'renderer/src/components/WorkspaceNavigation.tsx'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'renderer/src/threads/Pages.tsx'), 'utf8');

const box = (left, top, width, height) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});
const screen = { width: 1440, height: 944 };

describe('the plate hangs under the component, left edges lined up', () => {
  it('sits under it with a gap, covering none of it', () => {
    const comp = box(200, 300, 160, 36);
    const at = placeHint(comp, { width: 210, height: 30 }, screen);
    expect(at.top).toBe(comp.bottom + HINT_GAP);
    expect(at.left).toBe(comp.left);
    expect(at.rose).toBe(false);
    // The round two rule in one assertion: right under the component, never
    // overlaying it.
    expect(at.top).toBeGreaterThanOrEqual(comp.bottom);
  });

  it('rises instead where there is no room under it', () => {
    // The new task button and the sidebar toggle both sit on the floor of the
    // window, so "under" is off the screen for them.
    const comp = box(22, 886, 160, 36);
    const at = placeHint(comp, { width: 210, height: 30 }, screen);
    expect(at.rose).toBe(true);
    expect(at.top).toBe(comp.top - HINT_GAP - 30);
    expect(at.top + 30).toBeLessThanOrEqual(comp.top);
  });

  it('lines the right edges up for a component in the right-hand corner', () => {
    const comp = box(1360, 120, 34, 34);
    const at = placeHint(comp, { width: 220, height: 30 }, screen, 'right');
    expect(at.left).toBe(comp.right - 220);
  });

  it('never runs off either edge of the window', () => {
    const far = placeHint(box(1400, 120, 34, 34), { width: 220, height: 30 }, screen);
    expect(far.left + 220).toBeLessThanOrEqual(screen.width - HINT_MARGIN);
    const near = placeHint(box(2, 120, 34, 34), { width: 220, height: 30 }, screen);
    expect(near.left).toBe(HINT_MARGIN);
  });
});

// A ROW'S KEYS TURNED UP OVER THE TRAFFIC LIGHTS while a search was being
// typed. A shortcut hint must never appear in the wrong position or be
// triggered by the wrong thing.
//
// A detached element measures 0 by 0 at 0,0, and the clamp turned that into the
// window's own margin. Three guards answer it and each is tested: the placement
// refuses a box of nothing, the keyboard takes the hint away, and the element
// leaving the document takes it away even when no key is pressed.
describe('a plate never outlives the thing it is about', () => {
  it('refuses to place itself against a box of nothing', () => {
    expect(placeHint(box(0, 0, 0, 0), { width: 210, height: 30 }, screen)).toBeNull();
  });

  it('still places a real box that happens to sit at the origin', () => {
    // A component genuinely at 0,0 has width and height, so it is not the
    // detached case and must still get a plate.
    expect(placeHint(box(0, 0, 160, 36), { width: 210, height: 30 }, screen)).not.toBeNull();
  });

  it('drops the hint on a key press, because the hint is for the mouse', () => {
    expect(app).toContain("window.addEventListener('keydown', drop, true);");
  });

  it('drops the hint when the component leaves the document', () => {
    expect(app).toContain('const watch = new MutationObserver(() => {');
    expect(app).toContain('if (!shownHint.el.isConnected) drop();');
    expect(app).toContain('watch.disconnect();');
  });
});

describe('a chord is one cap for each key', () => {
  // A chord drawn as one cap looked cramped next to ordinary shortcuts, so the
  // pick was one cap for each key. This overrules the standing rule in
  // shortcuts.ts that a chord is one cap.
  it('splits every glyph of a chord', () => {
    expect(capsFor('⌘J')).toEqual(['⌘', 'J']);
    expect(capsFor('⌘⌥↑')).toEqual(['⌘', '⌥', '↑']);
  });

  it('keeps a single key whole however it is written', () => {
    expect(capsFor('esc')).toEqual(['esc']);
    expect(capsFor('↵')).toEqual(['↵']);
    expect(capsFor('\\')).toEqual(['\\']);
  });
});

describe('what the plate is made of is not a colour of its own', () => {
  // The first round gave the plate its own ground, and it was rejected: no
  // component in this app has a solid black background, and anything that does
  // does not match the theme.
  const rule = css.match(/\.hint-plate \{[^}]*\}/s);

  it('takes --film-strong, which cannot come out white in either direction', () => {
    // THE RULE, and the trap is that the obvious token is the wrong
    // one: a light mode component never has a plain white background, and
    // `--control-face` is a WHITE FILM IN EVERY THEME. #fefefe on plain light,
    // 45% white over a pale photograph on Frost Haze, 5.5% white on Valley
    // Haze, which is why the fault is invisible while you build on the dark one.
    expect(rule, 'no .hint-plate rule').toBeTruthy();
    expect(rule[0]).toContain('background: var(--film-strong)');
    expect(rule[0]).not.toContain('background: var(--control-face)');
    expect(rule[0]).not.toMatch(/background:\s*#/);
    expect(rule[0]).not.toContain('--skin-solid');
  });

  it('is pale glass on a light look, not a grey tint', () => {
    // w-517f37356a: on the lighter themes the hints were too dark to read.
    // --film-strong is a dark film on light, so the plate drew as a grey smudge
    // with grey words. It borrows the approval card's glass there instead:
    // --bg-raised at 62%, see-through, so it is never the plain white slab the
    // rule above forbids. Light is the app's one look now, so the rule is
    // scoped to `:root` rather than to a light theme attribute.
    const light = css.match(/\n:root \.hint-plate \{[^}]*\}/s);
    expect(light, 'no light .hint-plate rule').toBeTruthy();
    expect(light[0]).toContain('background: color-mix(in oklab, var(--bg-raised) 62%, transparent)');
    expect(light[0]).toContain('blur(22px)');
    expect(light[0]).not.toContain('--control-face');
    // The caps take --line-strong on every look since w-5984544441, light included.
    expect(css).toMatch(/\n\.hint-caps kbd \{[^}]*border: 1px solid var\(--line-strong\)/);
  });

  it('has no arrow, no tail and no pointer', () => {
    // A pointer on top of the plate read as a stray extra component. Nothing
    // else in this app has one.
    expect(css).not.toContain('.hint-tail');
    expect(rule[0]).not.toContain('::after');
  });

  it('never takes the pointer', () => {
    expect(rule[0]).toContain('pointer-events: none');
  });
});

describe('every line says a key the app really has', () => {
  // The same rule shortcuts.ts keeps: a hint that prints a key the handler does
  // not run is worse than no hint at all.

  // L, NOT S, ON THE ROW SINCE 2026-10-01. S opened the schedule picker here
  // and toggled the summary inside a thread, so the plate and the thread's own
  // top bar printed one letter for two different things. Scheduling is L
  // everywhere now and S belongs to the summary.
  it('runs C, E, L and the terminal chord', () => {
    expect(app).toMatch(/case 'c': case 'C': case 'n': case 'N': e\.preventDefault\(\); setModal\('compose'\);/);
    expect(HINTS['new-task'][0].key).toBe('N');
    expect(HINTS.row.map((l) => l.key)).toEqual(['↵', 'E', 'L']);
    expect(HINTS.terminal[0].key).toBe('⌘J');
    expect(HINTS.back[0].key).toBe('esc');
  });

  it('says Mark done rather than Close, which is the rename she asked for', () => {
    // Close was renamed to Done on another branch, so E says Mark done rather
    // than Close. Until that branch lands the sidebar still
    // says Closed while this says Mark done; do not put Close back.
    expect(HINTS.row.find((l) => l.key === 'E').what).toBe('Mark done');
  });
});

// EVERY BUTTON IN THE CORNER SAYS ITS KEY, since 2026-09-24. Hovering over
// some of those buttons showed no shortcut at all, and there may have been
// more buttons like them.
describe('a button with a key never says nothing', () => {
  it('gives the header\'s Search and New thread each a hint, and no hint to Display', () => {
    // approved 2026-10-01 (w-e731ca9376): on the sidebar layout the right end
    // of the header is Search, New thread and Display (HeaderActions), and the
    // plus and the ⌘ mark are not drawn there. Search and New thread both have
    // a key, so both say it. Display has none, so it says nothing.
    expect(pages).toMatch(/data-hint="search"[^>]*onClick=\{onSearch\}/);
    expect(pages).toMatch(/data-hint="new-task"[^>]*onClick=\{onCompose\}/);
    const display = pages.match(/<button[^>]*th-disp[^>]*>/);
    expect(display, 'no Display button in the header').toBeTruthy();
    expect(display[0]).not.toContain('data-hint');
  });

  it('keeps the plus, the command mark and the magnifier their hints in the layout without the sidebar', () => {
    // w-ec62ab6b38 (2026-09-28): the plus is labelled New thread now; the hint key stays new-task.
    expect(app).toMatch(/aria-label="New thread"/);
    expect(app).toMatch(/data-hint="new-task"[\s\S]{0,120}aria-label="New thread"/);
    expect(app).toMatch(/data-hint="commands"[\s\S]{0,120}aria-label="Commands"/);
    expect(app).toMatch(/data-hint="search"[\s\S]{0,120}title="Search threads"/);
  });

  it('says the same key for the same thing wherever it is drawn', () => {
    // New thread and Search are each drawn twice in the code: once in the
    // header's right end and once in the corner of the layout without the
    // sidebar. Two hints for one action would be two places to get it wrong,
    // so both wear the same id.
    expect((app + pages).match(/data-hint="new-task"/g)).toHaveLength(2);
    expect((app + pages).match(/data-hint="search"/g)).toHaveLength(2);
    // approved 2026-10-01 (w-e731ca9376): the sidebar carries neither any more.
    expect(nav).not.toContain('data-hint="new-task"');
    expect(nav).not.toContain('data-hint="search"');
  });

  it('leaves the cog alone, because it has no key at all', () => {
    const cog = app.slice(app.indexOf('title="Settings"') - 240, app.indexOf('title="Settings"') + 240);
    expect(cog).not.toContain('data-hint');
  });

  it('runs the keys those three claim', () => {
    expect(HINTS.commands[0].key).toBe('⌘K');
    expect(app).toMatch(/\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'/);
    expect(HINTS.search[0].key).toBe('/');
    expect(app).toMatch(/if \(e\.key === '\/'\)/);
  });
});
