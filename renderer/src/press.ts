type Press = { button: number; target: unknown; currentTarget: unknown; stopPropagation: () => void };

/** A backdrop that closes the moment the main button goes down on it, outside its box. */
export function closesOnPress(close: () => void, { stop = false } = {}) {
  return {
    onMouseDown: (e: Press) => {
      if (e.button !== 0 || e.target !== e.currentTarget) return;
      if (stop) e.stopPropagation();
      close();
    },
  };
}

type Down = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; currentTarget: object };
type Click = { detail: number; currentTarget: object };
const handled = new WeakSet<object>();

/** A tab that acts on the press; its click still acts when no press came first (the keyboard, a modifier). */
export function actsOnPress(act: () => void) {
  return {
    onMouseDown: (e: Down) => {
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { handled.delete(e.currentTarget); return; }
      handled.add(e.currentTarget);
      act();
    },
    onClick: (e: Click) => {
      if (e.detail > 0 && handled.delete(e.currentTarget)) return;
      act();
    },
  };
}
