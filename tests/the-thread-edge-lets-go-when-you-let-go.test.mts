// THE THREAD'S EDGE LETS GO WHEN YOU LET GO.
//
// Reported 2026-10-05 (w-45cbac227a): "When I try to expand the thread by
// moving the divider, my cursor gets stuck ... It hasn't gone back to the
// cursor state." The drag only ended on a release heard by the edge itself.
// An opened task has a 34 point strip along its top that moves the window
// (`-webkit-app-region: drag`), directly above the panel, and macOS keeps a
// release that lands there for itself, so the page never hears it. Nothing
// else ended the drag: the whole window kept the resize cursor, and the edge
// kept following a pointer with no button held.
//
// So the drag now ends on any of: a release anywhere in the window, the
// pointer cancelled, the window losing focus, the panel going away, or the
// first move that arrives with no button held, which is the release we missed.
import { describe, it, expect, vi } from 'vitest';
import { holdTheEdge, DRAGGING } from '../renderer/src/team/hold-the-edge.ts';

function world() {
  const win = new EventTarget();
  const grip = new EventTarget();
  grip.captured = new Set();
  grip.setPointerCapture = (id) => grip.captured.add(id);
  grip.releasePointerCapture = (id) => grip.captured.delete(id);
  grip.hasPointerCapture = (id) => grip.captured.has(id);
  const classes = new Set();
  const body = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } };
  const onMove = vi.fn();
  return { win, grip, body, classes, onMove };
}
const pointer = (type, props = {}) => Object.assign(new Event(type), { pointerId: 1, buttons: 1, clientX: 0, ...props });

describe('holding the thread edge', () => {
  it('takes the pointer and puts the resize cursor on the whole window', () => {
    const w = world();
    holdTheEdge({ ...w, pointerId: 1 });
    expect(w.classes.has(DRAGGING)).toBe(true);
    expect(w.grip.captured.has(1)).toBe(true);
  });

  it('follows a move with the button held', () => {
    const w = world();
    holdTheEdge({ ...w, pointerId: 1 });
    w.win.dispatchEvent(pointer('pointermove', { clientX: 300 }));
    w.win.dispatchEvent(pointer('pointermove', { clientX: 280 }));
    expect(w.onMove.mock.calls).toEqual([[300], [280]]);
  });

  it('lets go on a release heard anywhere in the window', () => {
    const w = world();
    holdTheEdge({ ...w, pointerId: 1 });
    w.win.dispatchEvent(pointer('pointerup', { buttons: 0 }));
    expect(w.classes.has(DRAGGING)).toBe(false);
    w.win.dispatchEvent(pointer('pointermove', { clientX: 200 }));
    expect(w.onMove).not.toHaveBeenCalled();
  });

  // THE REPORTED CASE. The release went to the window-moving strip and the
  // page never heard it; the next thing it hears is the pointer moving with
  // nothing held. That move must end the drag, and must not move the edge.
  it('lets go on the first move with no button held, when the release was never heard', () => {
    const w = world();
    holdTheEdge({ ...w, pointerId: 1 });
    w.win.dispatchEvent(pointer('pointermove', { clientX: 300 }));
    w.win.dispatchEvent(pointer('pointermove', { clientX: 120, buttons: 0 }));
    expect(w.classes.has(DRAGGING)).toBe(false);
    expect(w.onMove.mock.calls).toEqual([[300]]);
    expect(w.grip.captured.has(1)).toBe(false);
  });

  it('lets go when the pointer is cancelled', () => {
    const w = world();
    holdTheEdge({ ...w, pointerId: 1 });
    w.win.dispatchEvent(pointer('pointercancel', { buttons: 0 }));
    expect(w.classes.has(DRAGGING)).toBe(false);
  });

  it('lets go when the window loses focus mid-drag', () => {
    const w = world();
    holdTheEdge({ ...w, pointerId: 1 });
    w.win.dispatchEvent(new Event('blur'));
    expect(w.classes.has(DRAGGING)).toBe(false);
  });

  it('lets go when the panel closes mid-drag, and letting go twice is harmless', () => {
    const w = world();
    const end = holdTheEdge({ ...w, pointerId: 1 });
    end();
    end();
    expect(w.classes.has(DRAGGING)).toBe(false);
    w.win.dispatchEvent(pointer('pointermove', { clientX: 50 }));
    expect(w.onMove).not.toHaveBeenCalled();
  });

  // THE CASE THAT MUST NOT END IT: another pointer's release (a second finger
  // on the trackpad) is not this drag's release.
  it('keeps hold through a release of some other pointer', () => {
    const w = world();
    holdTheEdge({ ...w, pointerId: 1 });
    w.win.dispatchEvent(pointer('pointerup', { pointerId: 2, buttons: 0 }));
    expect(w.classes.has(DRAGGING)).toBe(true);
    w.win.dispatchEvent(pointer('pointermove', { clientX: 260 }));
    expect(w.onMove.mock.calls).toEqual([[260]]);
  });
});
