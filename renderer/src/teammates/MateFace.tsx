// An AI teammate's face, drawn inside whatever box the caller sizes, and the
// row of other faces you can give it instead.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { facePaper } from '../../../shared/teammate-face.mts';
import { faceDrawing, otherFaces } from './face-drawing';
import './mate-face.css';

export function MateFace({ seed, className, style, children }: { seed: string; className: string; style?: CSSProperties; children?: ReactNode }) {
  return <i className={`${className} mate-face`} style={{ ...style, background: facePaper(seed) }} aria-hidden="true">
    <img src={faceDrawing(seed)} alt="" draggable={false} />{children}
  </i>;
}

/** Its face, then others to pick from; More shows another set. */
export function FacePick({ seed, onPick }: { seed: string; onPick: (seed: string) => void }) {
  const [page, setPage] = useState(0);
  const [base] = useState(seed);
  const others = otherFaces(base, 6, page).filter((s) => s !== seed);
  return <span className="fp-row">
    <MateFace seed={seed} className="fp-face fp-now" />
    {others.map((s) => <button key={s} type="button" className="fp-pick" aria-label="Use this face" onClick={() => onPick(s)}><MateFace seed={s} className="fp-face" /></button>)}
    <span role="button" tabIndex={0} className="tq-link fp-more" onClick={() => setPage(page + 1)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPage(page + 1); } }}>More</span>
  </span>;
}
