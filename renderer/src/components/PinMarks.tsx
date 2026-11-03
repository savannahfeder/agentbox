// The pins on a picture, a page or a slide, drawn the one way: a dot on the
// spot and a tag hanging off it. Placed inside a box that is position: relative.
import { pinLean, type DrawnPin } from '../artifact-pins';

export function PinMarks({ pins, draft, draftLabel, size, onPick }: {
  pins: DrawnPin[];
  /** The spot of the comment being written, if it has one. */
  draft: { x: number; y: number } | null;
  draftLabel: string;
  /** The box as fitted, so a tag near an edge keeps its side as the box zooms. */
  size: { w: number; h: number };
  onPick?: (id: string) => void;
}) {
  const lean = (x: number, y: number) => pinLean({ x, y }, size);
  return <>
    {pins.map((p) => (
      <span key={p.id} className={`av-pin lean-${lean(p.x, p.y)}${p.on ? ' is-on' : ''}${p.settled ? ' is-settled' : ''}${p.carried ? ' is-carried' : ''}`}
        style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
        <span className="av-pin-spot" aria-hidden="true" />
        <button type="button" className="av-pin-tag" aria-label={`Pin ${p.label}`} onClick={(e) => { e.stopPropagation(); onPick?.(p.id); }}>{p.label}</button>
      </span>
    ))}
    {draft && (
      <span className={`av-pin lean-${lean(draft.x, draft.y)} is-draft`} style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>
        <span className="av-pin-spot" aria-hidden="true" />
        <span className="av-pin-tag">{draftLabel}</span>
      </span>
    )}
  </>;
}

/** Where a click landed on `box`, as a fraction of it, to four places. */
export function spotIn(box: Element, e: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = box.getBoundingClientRect();
  const at = (v: number) => Math.max(0, Math.min(1, Math.round(v * 10000) / 10000));
  return { x: at((e.clientX - r.left) / (r.width || 1)), y: at((e.clientY - r.top) / (r.height || 1)) };
}
