// MOVING THE TRAY FROM ITS OWN LIST (w-6da6d4ad24). "Move to" and a small
// screen sit at the foot of the list after Size, and pressing them turns the
// list into the four corners of the screen. The corners are the buttons, each
// big enough to press: inside the small screen they were "too small to click
// reasonably".
import React from 'react';
import type { Grip } from '../../../shared/corner-tag.mjs';

export const CORNERS: Grip[] = ['tl', 'tr', 'bl', 'br'];
export const CORNER_NAMES: Record<Grip, string> = { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' };

/** The four spots the list turns into: the corner it is in is not a button. */
export function placeSpots(here: Grip | undefined) {
  return CORNERS.map((corner) => ({ corner, name: CORNER_NAMES[corner], here: corner === here }));
}

/** One corner, drawn as a right angle facing it. */
export function CornerMark({ corner }: { corner: Grip }) {
  const turn = { tl: 0, tr: 90, br: 180, bl: 270 }[corner];
  return (
    <svg className="ct-corner" viewBox="0 0 10 10" aria-hidden style={{ transform: `rotate(${turn}deg)` }}>
      <path d="M8.2 1.8H1.8v6.4" />
    </svg>
  );
}

/** A small screen with its four corners, the one the tray is in lit. */
export function ScreenMark({ here }: { here: Grip | undefined }) {
  const at = { tl: [3, 3.2], tr: [13, 3.2], bl: [3, 8.8], br: [13, 8.8] } as const;
  return (
    <svg className="ct-mini-screen" viewBox="0 0 21 15" aria-hidden>
      <rect className="ct-mini-frame" x="0.6" y="0.6" width="19.8" height="13.8" rx="2.4" />
      {CORNERS.map((c) => (
        <rect key={c} className={`ct-mini-corner${c === here ? ' is-here' : ''}`} x={at[c][0]} y={at[c][1]} width="5" height="3" rx="0.9" />
      ))}
    </svg>
  );
}

/** At the foot of the list: the words and the small screen are one button,
 *  and it opens the corners rather than being them. */
export function MoveButton({ here, onOpen }: { here: Grip | undefined; onOpen: () => void }) {
  return (
    <button className="ct-move" aria-label="Move the tray to another corner" title="Move the tray to another corner" onClick={onOpen}>
      <span>Move to</span>
      <ScreenMark here={here} />
    </button>
  );
}

/** What the list turns into: a picture of the screen, a corner to press. The
 *  mark, or the tray, always sits on the side of the screen it stands for. */
export function PlacePicker({ here, tray, onPick, onBack }: {
  here: Grip | undefined; tray: React.ReactNode; onPick: (corner: Grip) => void; onBack: () => void;
}) {
  return (
    <>
      <div className="ct-quiet ct-static ct-head ct-place-head">
        <span>Move the tray to</span>
        <button onClick={onBack}>Back</button>
      </div>
      <div className="ct-screen">
        {placeSpots(here).map((s) => (s.here ? (
          <div key={s.corner} className={`ct-spot ct-spot-${s.corner} is-here`}>
            {tray}
            <span>Here now</span>
          </div>
        ) : (
          <button key={s.corner} className={`ct-spot ct-spot-${s.corner}`} onClick={() => onPick(s.corner)}>
            <CornerMark corner={s.corner} />
            <span>{s.name}</span>
          </button>
        )))}
      </div>
    </>
  );
}
