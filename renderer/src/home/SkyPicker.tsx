import { useEffect, useRef } from 'react';
import { drawSky, type Sky } from './sky';

/** A sky theme's tile in Settings, Appearance: its sky on a small card, the way the window wears it. */
export function SkyTile({ sky, on, onPick }: { sky: Sky; on: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawSky(ref.current, sky.art, { from: 4, span: 30 }); }, [sky]);
  return <button type="button" className={`look sky-look${on ? ' on' : ''}`} aria-pressed={on} onClick={onPick}>
    <span className={`look-swatch sky-swatch`} style={sky.frame ? { background: sky.frame } : undefined} aria-hidden="true">
      <canvas ref={ref} />
      <span className="look-tick" aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.6 5.7 4.2 8.3 9.4 2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </span>
    <span className="look-name">{sky.name}</span>
  </button>;
}
