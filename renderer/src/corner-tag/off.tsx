// TURNING THE TRAY OFF FROM ITS OWN LIST (w-42b2671e8f). "Turn off…" at the
// foot turns the list into these choices. It used to open Settings, where the
// tray steps aside because the app is in front, so it looked off and then
// came back.
import React from 'react';
import { HIDE_CHOICES } from '../../../shared/corner-tag.mts';

const WORDS: Record<string, string> = { '5m': 'For 5 minutes', '30m': 'For 30 minutes', today: 'For the rest of today', good: 'For good' };

export const OFF_CHOICES = [...HIDE_CHOICES.map((c) => c.key), 'good'].map((key) => ({ key, label: WORDS[key] }));

export function OffPicker({ onHide, onOff, onBack }: { onHide: (key: string) => void; onOff: () => void; onBack: () => void }) {
  return (
    <>
      <div className="ct-quiet ct-static ct-head ct-place-head">
        <span>Turn off the tray</span>
        <button onClick={onBack}>Back</button>
      </div>
      {OFF_CHOICES.map((c) => (
        <button key={c.key} className="ct-line" onClick={() => (c.key === 'good' ? onOff() : onHide(c.key))}>
          {c.label}
        </button>
      ))}
    </>
  );
}
