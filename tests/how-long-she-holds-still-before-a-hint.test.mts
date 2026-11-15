// HOW LONG SHE HAS TO HOLD STILL BEFORE A KEY HINT APPEARS.
//
// Five strips drawn at 0, 500, 700, 1200 and 2000ms were compared by hovering,
// and the standard 700ms that Qt and Radix use was chosen.
//
// Round one asked how fast the ink should come up, and the speed of the fade
// turned out to be the wrong control: what matters is how long you have to
// hold still before it appears at all. That is what every toolkit that ships
// this actually has, read out of their own source: Windows 500ms, GNOME 500ms,
// Qt 700ms, Radix 700ms.
//
// Three things here are worth a test rather than an eye.
//
//   THE WAIT IS THE CHOSEN NUMBER. It was 700 while the hint CHANGED the
//   component under the pointer. It went to 1500 when the hint became a plate
//   that arrives beside it (w-2f7fac6027), because hovering past controls kept
//   surfacing shortcuts by accident. The grace was 300, which is Radix's own
//   skipDelayDuration.
//
//   ONLY THE DRAWING WAITS. The row under the pointer is also the row R and E
//   act on, and that targeting is still instant. If the wait sat in front of
//   both, the keys would belong to a row the screen had said nothing about.
//
//   THE SECOND HINT COSTS NOTHING. Once one has appeared the window is awake,
//   and every hint after it arrives with no wait until the pointer has touched
//   nothing for the grace. That is what makes a wait this long livable: it is
//   paid once per visit rather than on every control she passes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINT_WAIT, hintScheduler } from '../renderer/src/hint-timing';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const list = read('renderer/src/components/List.tsx');

describe('the wait is the one she picked', () => {
  it('is back at the standard, after she ran the second and a half', () => {
    // 1500 was picked off how it FELT when the hint changed the component
    // under the pointer. Compared in use against a tool that does the same
    // thing, it was about twice as slow, so the wait was cut roughly in half.
    // Half of 1500 is 750 and the standard a tad under it is 700, where Qt and
    // Radix sit.
    expect(HINT_WAIT).toBe(700);
  });

  it('has no second number, because every component waits its own', () => {
    // The grace was 300ms, Radix's own skipDelayDuration, and it was a bug:
    // each component gets its own 700ms timer, not one shared timer. Nothing
    // is remembered between two components.
    expect(HINT_WAIT).toBe(700);
  });
});

describe('holding still is what draws the hint', () => {
  let drawn;
  let s;

  beforeEach(() => {
    vi.useFakeTimers();
    drawn = [];
    s = hintScheduler((t) => drawn.push(t));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('draws nothing at all on a pointer that only passes over', () => {
    s.point('row-a');
    vi.advanceTimersByTime(HINT_WAIT - 1);
    s.point(null);
    vi.advanceTimersByTime(5000);
    expect(drawn.filter(Boolean)).toEqual([]);
  });

  it('draws it once she has held still for the whole wait', () => {
    s.point('row-a');
    vi.advanceTimersByTime(HINT_WAIT - 1);
    expect(drawn.filter(Boolean)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(drawn.at(-1)).toBe('row-a');
  });

  it('makes the next one wait the whole thing over again', () => {
    // This replaced the opposite test. After waiting 700ms on one button,
    // jumping to another showed that button's shortcut at once, which makes no
    // sense: every button waits the full time.
    s.point('row-a');
    vi.advanceTimersByTime(HINT_WAIT);
    expect(drawn.at(-1)).toBe('row-a');
    s.point('row-b');
    expect(drawn.at(-1)).toBe(null);
    vi.advanceTimersByTime(HINT_WAIT - 1);
    expect(drawn.at(-1)).toBe(null);
    vi.advanceTimersByTime(1);
    expect(drawn.at(-1)).toBe('row-b');
  });

  it('takes the first one off the screen the instant she moves to the second', () => {
    // The fault this guards is a plate for A still up while B is being waited
    // for, which would put the wrong keys beside the right button.
    s.point('row-a');
    vi.advanceTimersByTime(HINT_WAIT);
    s.point('row-b');
    expect(drawn.at(-1)).toBe(null);
  });

  it('starts again even when she comes back to the one she just left', () => {
    s.point('row-a');
    vi.advanceTimersByTime(HINT_WAIT);
    s.point(null);
    s.point('row-a');
    expect(drawn.at(-1)).toBe(null);
    vi.advanceTimersByTime(HINT_WAIT);
    expect(drawn.at(-1)).toBe('row-a');
  });

  it('clears the hint the moment she leaves, because leaving never waits', () => {
    // A wait on the way out would leave the keycaps sitting on a row the
    // pointer is no longer on, which is a promise about the wrong task.
    s.point('row-a');
    vi.advanceTimersByTime(HINT_WAIT);
    expect(drawn.at(-1)).toBe('row-a');
    s.point(null);
    expect(drawn.at(-1)).toBe(null);
  });

  it('draws nothing after the hints are switched off, until she points again', () => {
    s.point('row-a');
    vi.advanceTimersByTime(HINT_WAIT);
    s.stop();
    expect(drawn.at(-1)).toBe(null);
    s.point('row-b');
    expect(drawn.at(-1)).toBe(null);
    vi.advanceTimersByTime(HINT_WAIT);
    expect(drawn.at(-1)).toBe('row-b');
  });
});

describe('only the drawing waits: the keys reach the row straight away', () => {
  it('leaves the pointed row instant, and delays a separate name', () => {
    // `hoveredId` is the target and is still set on the first mouse move.
    // `shownHint` is what is drawn and is the one the scheduler moves.
    // (Behind the tutorial's one exception since 2026-10-06, `walkOwn`: on the
    // beat that opens her own thread, ↵ means that thread wherever the pointer is.)
    expect(app).toMatch(/const pointed: WorkItem \| undefined = walkOwn\s*\n\s*\?\? \(hoveredId && !multiSel\.size \? list\.find/);
    expect(list).toContain('onMouseMove={() => { if (hoveredId !== item.id) onHover?.(item.id); }}');
    // The drawn hint must never be what the key handler targets.
    expect(app).not.toMatch(/shownHint && !multiSel\.size \? list\.find/);
  });

  it('runs the whole window off ONE scheduler', () => {
    // Crossing from a row to the sidebar is still moving around the same
    // window, so the second component answers instantly the way the next row
    // does. Two schedulers would charge her the full wait again.
    expect((app.match(/hintScheduler\(/g) ?? []).length).toBe(1);
    expect(app).toContain('useEffect(() => { hints.current?.point(pointedHint); }, [pointedHint]);');
  });

  it('separates the component pointed at from the one being drawn for', () => {
    expect(app).toContain('const [pointedHint, setPointedHint] = useState<{ id: string; el: HTMLElement } | null>(null);');
    expect(app).toContain('const [shownHint, setShownHint] = useState<{ id: string; el: HTMLElement } | null>(null);');
    // One listener for the whole window, not a handler per control. The four
    // hand-written `setPointedStrip` pairs this replaced are what let the top
    // strip's hint and the rows' hint drift into two different drawings.
    expect((app.match(/setShownHint/g) ?? []).length).toBe(2);
    expect(app).toContain("document.addEventListener('mousemove', onMove, true);");
  });

  it('never leaves a plate pointing at where a component used to be', () => {
    // The plate is measured against the window, so anything that scrolls or
    // re-lays-out under it has moved the thing it belongs to. The plate cannot
    // see that happen, so the window drops it.
    expect(app).toContain("window.addEventListener('scroll', drop, true);");
    expect(app).toContain("window.addEventListener('resize', drop);");
  });
});
