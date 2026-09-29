import { useLayoutEffect, useRef, useState } from 'react';
import { capsFor, placeHint, type HintLine } from '../hint-plate';

/**
 * THE KEY HINT, DRAWN BESIDE THE THING IT BELONGS TO.
 *
 *  Why it measures itself instead of being told where to go: the plate's size
 *  depends on its own longest fragment, and the rule for whether it hangs under
 *  the component or rises above it depends on that size. So it is rendered
 *  invisible for one frame, measured, placed, and only then shown. One frame is
 *  not a flicker anybody can see after a wait of a second and a half, and it is
 *  the only way the rule can be honest about a component near the floor.
 *
 *  It never takes the pointer. A hint you can hover is a hint that can be
 *  hovered off the thing it describes.
 */
export function HintPlate({ lines, comp, align, text }: {
  lines: HintLine[];
  /** The live box of the component this belongs to, in window coordinates. */
  comp: DOMRect;
  align?: 'left' | 'right';
  /**
   * The box of the WORDS inside that component, when it has any. The plate
   *  lines its first cap up with the first letter of them; see `placeHint`. */
  text?: DOMRect | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    // The plate's own left padding and border, read off the plate rather than
    // typed here, so changing the padding in the stylesheet cannot quietly put
    // the caps back out of line with the words.
    const style = getComputedStyle(el);
    const inset = parseFloat(style.paddingLeft || '0') + parseFloat(style.borderLeftWidth || '0');
    // `null` back from `placeHint` means the component measures nothing, which
    // is what a detached element does. The plate stays invisible rather than
    // landing in the corner of the window.
    setAt(placeHint(
      comp,
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight },
      align ?? 'left',
      text ? { left: text.left } : undefined,
      inset,
    ));
    // The component's box is the whole of the input, and a new one is a new
    // placement: the same plate follows a row that scrolled.
  }, [comp, text, align, lines]);

  return (
    <div
      ref={ref}
      className="hint-plate"
      aria-hidden="true"
      style={at
        ? { top: at.top, left: at.left }
        : { top: 0, left: 0, opacity: 0, visibility: 'hidden' }}
    >
      {lines.map((line) => (
        <div className="hint-line" key={line.key}>
          <span className="hint-caps">
            {capsFor(line.key).map((glyph, i) => (
              // The index is in the key because a chord can repeat a glyph
              // and nothing here re-orders.
              <kbd key={`${glyph}-${i}`}>{glyph}</kbd>
            ))}
          </span>
          <span className="hint-what">{line.what}</span>
        </div>
      ))}
    </div>
  );
}
