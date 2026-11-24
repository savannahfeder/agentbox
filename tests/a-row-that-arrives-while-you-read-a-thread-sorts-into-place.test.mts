// A ROW THAT ARRIVES WHILE YOU READ A THREAD SORTS INTO ITS PLACE.
//
// Rows in Needs you hold still while the pointer is on the list, and a row that
// arrives meanwhile goes to the foot until the pointer leaves. A team tester's
// new teammate replies and hand-overs, marked High and "just now", sat at the
// very bottom under answered threads from Nov 19, five times in one run. His
// actions log shows why: he clicked a row, read the thread and came back, every
// few seconds. Opening a thread takes the list off the screen without a
// pointerleave, so the hold the click started outlived the list, and on his
// return each move on the list started it again: the rows stayed in the order
// they had before he opened the first thread, and every new one went under them.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';

const effects: (() => void | (() => void))[] = [];
vi.mock('react', async (actual) => ({ ...(await actual<typeof import('react')>()), useEffect: (fn: () => void | (() => void)) => { effects.push(fn); } }));
const { useLetGoWhenGone, pointerHold, steadyOrder } = await import('../renderer/src/threads/steady-rows.ts');

const timers = { setTimeout: () => 0, clearTimeout: () => {} };

describe('a list that goes away while the pointer holds it', () => {
  it('lets go, so the rows come back in their order with the new one in its place', () => {
    let on = false;
    const hold = pointerHold((v) => { on = v; }, timers);
    effects.length = 0;
    useLetGoWhenGone({ onPointerMove: hold.move, onPointerLeave: hold.leave });
    const gone = effects.map((fn) => fn()).filter((f): f is () => void => typeof f === 'function');
    hold.move();
    expect(on).toBe(true);
    for (const f of gone) f();
    expect(on).toBe(false);
    // Not held, the list is drawn as it sorts: the new High row on top.
    const rows = ['new', 'old-1', 'old-2'].map((id) => ({ id }));
    const drawn = on ? steadyOrder(['old-1', 'old-2'], rows, (r) => r.id) : rows;
    expect(drawn.map((r) => r.id)).toEqual(['new', 'old-1', 'old-2']);
  });

  it('does nothing while the list is still on the screen', () => {
    let on = false;
    const hold = pointerHold((v) => { on = v; }, timers);
    effects.length = 0;
    useLetGoWhenGone({ onPointerMove: hold.move, onPointerLeave: hold.leave });
    effects.forEach((fn) => fn());
    hold.move();
    expect(on).toBe(true);
  });

  it('is what the list does with the pointer it is handed', () => {
    const list = fs.readFileSync(new URL('../renderer/src/components/List.tsx', import.meta.url), 'utf8');
    expect(list).toMatch(/useLetGoWhenGone\(pointer\)/);
  });
});
