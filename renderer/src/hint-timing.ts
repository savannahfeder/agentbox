// HOW LONG THE POINTER HAS TO HOLD STILL BEFORE A KEY HINT IS DRAWN.
//
// Five strips were compared, hovered at 0, 500, 700, 1200 and 2000, and the
// standard 700ms that Qt and Radix use won.
//
// IT WAS THEN MOVED to 1500 (w-2f7fac6027), because hovering by accident kept
// turning up keyboard shortcuts nobody had asked for.
//
// That first answer was picked against a hint that CHANGED the component under
// the pointer, where a long wait reads as the app being slow to answer. This one
// is a plate that arrives beside it, where the same wait reads as the app
// staying out of the way, and the fault was meeting the hint by accident rather
// than waiting for it. 1500 was the smallest change that addressed that.
//
// IN USE 1500 WAS TOO SLOW: Superhuman shows its hints in about half the time.
//
// Half of 1500 is 750 and the standard a tad under it is 700, which is where Qt
// and Radix sit and what the first comparison picked. So this lands back on the
// number it started from, and the round trip was not wasted: 1500 was picked
// off how it FELT when the hint changed the component under the pointer, and
// 700 is picked off running the thing that replaced it.
export const HINT_WAIT = 700;

// THERE IS NO SECOND NUMBER ANY MORE, AND ITS REMOVAL IS DELIBERATE.
//
// `HINT_GRACE` used to be 300ms, Radix's own skipDelayDuration. It is what every
// toolkit that ships a tooltip does: you wait the first time, and then the
// window stays awake and answers instantly while you are still moving around
// it, so the cost is paid once per visit instead of on every control you touch.
//
// IN USE THE GRACE READ AS A BUG: after one 700ms wait, jumping to another
// button showed that button's shortcut at once. Each component should have its
// own 700ms timer, with the same wait every time.
//
// That is the grace exactly, and it is wrong for THIS hint even though the
// toolkits are right for theirs. A tooltip names the button you are already
// looking at, so answering the next one instantly is helpful. This plate is a
// thing that APPEARS BESIDE what you point at, and the point of the wait is to
// avoid meeting keyboard shortcuts by accidental hovering. An awake window
// means crossing the sidebar on the way somewhere throws a plate under every
// control on the path, which is that fault with the wait switched off for all
// but the first one.
//
// SO EVERY COMPONENT WAITS ITS OWN 700ms, and nothing is remembered between two
// of them. Do not put the grace back; it is the reported fault.

export type HintScheduler<T> = {
  // The pointer is now on this target, or on nothing when it is null. Called on
  // every change; the scheduler decides when, if ever, it becomes drawn.
  point: (target: T | null) => void;
  // Hints are off, or the screen they belong to is gone. Everything drawn
  // clears and the window goes back to sleep.
  stop: () => void;
};

// ONLY THE DRAWING WAITS. Nothing in here touches which row the keys act on:
// that is `hoveredId` in App and it is still set the instant the pointer moves,
// because the alternative is a row that is the target of R and E for 700ms
// while showing her the product name of something she is not acting on.
//
// The whole of the behaviour is here rather than in a component so it can be
// driven by a test with a fake clock; the hook around it is plumbing.
export function hintScheduler<T>(
  draw: (target: T | null) => void,
  opts: { wait?: number } = {},
): HintScheduler<T> {
  const wait = opts.wait ?? HINT_WAIT;
  let open: ReturnType<typeof setTimeout> | undefined;
  const clearOpen = () => { if (open) clearTimeout(open); open = undefined; };

  return {
    point(target) {
      // EVERY ARRIVAL STARTS AGAIN FROM NOTHING. The pending wait is thrown
      // away, whatever it was for, and what is drawn is cleared before the new
      // one is timed: moving from one button to the next must never leave the
      // first one's plate on the screen while the second one is being waited
      // for.
      clearOpen();
      draw(null);
      // ARRIVING WAITS. LEAVING DOES NOT. A wait on the way out would leave the
      // hint sitting on a component the pointer has already left.
      if (target === null) return;
      open = setTimeout(() => {
        open = undefined;
        draw(target);
      }, wait);
    },
    stop() {
      clearOpen();
      draw(null);
    },
  };
}
