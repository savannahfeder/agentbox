// THE TOUR'S STEP LIST (w-fbe5e95dea): what the tutorial teaches, beside the app
// while it runs, ticked as each lesson lands. The tips themselves stay in
// Tour.tsx; this only lists them. `data-tour-list` makes room for it.

import { useEffect } from 'react';
import { MAC } from '../this-keyboard';
import { tourChecklist } from '../setup-split';
import type { Lesson, Tour } from '../tour';
import { Name } from '../../../shared/product-name.mjs';
import { Mark } from './SetupSplit';
import './setup-split.css';

const Tick = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" /></svg>;

export function TourList({ tour, now, onSkip }: { tour: Tour; now: Lesson | null; onSkip: () => void }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--tl-w', `${Math.round(Math.min(520, Math.max(340, innerWidth * 0.32)))}px`);
    root.setAttribute('data-tour-list', '');
    return () => root.removeAttribute('data-tour-list');
  }, []);
  const rows = tourChecklist(tour.done, MAC ? '⌘' : 'Ctrl', now);
  return (
    <aside className="tour-list" aria-label={`How ${Name} works`}>
      <div className="tl-brand"><Mark />{Name}</div>
      <div className="tl-count">{rows.findIndex((r) => r.state === 'now') + 1 || rows.length} of {rows.length}</div>
      <div className="tl-body">
        <h2 className="ss-h"><b>How {Name} works.</b>Try each step on the real thing.</h2>
        <div className="ss-list">
          {rows.map((r, i) => (
            <div key={r.label} className={`ss-row${r.state === 'now' ? ' ss-on' : ''}`}>
              <span className={`ss-face${r.state === 'done' ? ' ss-ok' : ''}`}>{r.state === 'done' ? <Tick /> : i + 1}</span>
              <span>{r.label}</span>
              <span className="ss-keys">{r.keys.map((k) => <span key={k} className="ss-key">{k}</span>)}</span>
            </div>
          ))}
        </div>
        <button type="button" className="tl-skip" onClick={onSkip}>Skip the walkthrough</button>
      </div>
    </aside>
  );
}
