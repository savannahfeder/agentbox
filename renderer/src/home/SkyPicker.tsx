import { useEffect, useRef } from 'react';
import { DARK_SKIES, LIGHT_SKIES, drawSky, type Sky } from './sky';
import { DARK_SKY_KEY, LIGHT_SKY_KEY, setHomeSetting, useHomeSettings } from './home-settings';

function Tile({ sky, on, onPick }: { sky: Sky; on: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawSky(ref.current, sky.art, { from: 4, span: 30 }); }, [sky]);
  return <button type="button" className={`look sky-look${on ? ' on' : ''}`} aria-pressed={on} onClick={onPick}>
    <span className="look-swatch sky-swatch" style={sky.frame ? { background: sky.frame } : undefined}>
      <canvas ref={ref} />
    </span>
    <span className="look-name">{sky.name}</span>
  </button>;
}

/** The skies Home and the Inbox can wear: one chosen for Dark, one for Light. */
export function SkyPicker() {
  const s = useHomeSettings();
  return <>
    <div className="sky-set-label">In Dark</div>
    <div className="look-row sky-row">
      {DARK_SKIES.map((k) => <Tile key={k.id} sky={k} on={s.darkSky === k.id} onPick={() => setHomeSetting(DARK_SKY_KEY, k.id)} />)}
    </div>
    <div className="sky-set-label">In Light</div>
    <div className="look-row sky-row">
      {LIGHT_SKIES.map((k) => <Tile key={k.id} sky={k} on={s.lightSky === k.id} onPick={() => setHomeSetting(LIGHT_SKY_KEY, k.id)} />)}
    </div>
  </>;
}
