// THE THEME PICKER. A row of themes docked at the bottom of the window, so a
// theme is chosen while looking at the screen it changes.
//
// SO EVERY DECISION HERE FOLLOWS FROM ONE SENTENCE: the screen behind it has to
// stay visible.
//
//   - It is DOCKED AT THE BOTTOM, not centred. A centred card sits on the inbox
//     card, which is the thing she is judging the theme against. At the bottom
//     it covers 175px of a 944px window, which is 19%, and the card and the
//     whole sidebar are still on screen.
//   - THERE IS NO SCRIM. Every other modal in this app dims the window behind
//     it with --scrim, and a dimmed window is a window wearing a theme she
//     cannot see. The backdrop here is transparent and exists only to catch a
//     click outside.
//   - EVERY MOVE APPLIES IMMEDIATELY. Arrow keys and clicks both set the look
//     the moment they happen rather than on a confirm, because a theme is
//     recognised while looking at it, not after committing to it.
//     There is no cancel and nothing is reverted on close: what she is looking
//     at when she leaves is what she keeps.
//
// THE TILE IS THE ONE IN SETTINGS, at 140x92 instead of 172x112. It is not a
// second idea about what a theme looks like: `.look-swatch` carries the real
// picture under the real veil at the theme's own --skin-dim, so it cannot drift
// from the theme it stands for. 140 is not smaller than that on a whim either —
// round two of this item measured that at 116x74 a photograph reads as a grey
// stamp and the flat themes are indistinguishable rectangles, so this is as
// small as a tile is allowed to get and still be a picture.
//
// ============================================================================
// THE BLUR AND DARKNESS DIALS. SETTLED, 2026-08-23. DO NOT REDESIGN THEM AND DO
// NOT PUT A SECOND WAY TO REACH THEM BACK ON THIS BAR.
//
// Round one put two `.set-range` sliders on the header line. Round two built
// four, and the design that came out of it has two halves:
//
//   1. THE LOOK IS THE KEYS DESIGN'S READOUT: a word, the value, and a 2px
//      line showing where in its travel it stands. It is kept exactly, down to
//      its 168px width.
//   2. IT IS NO LONGER A READOUT. It is on the bar the moment the bar opens,
//      both dials at once, and the line IS the control: press anywhere on it or
//      drag along it. NOTHING IS BEHIND A KEY PRESS. Up, down and shift do not
//      touch blur or darkness any more, and the hint line does not mention them.
//
// The three losing designs (scrub, steps, drawer), round one's sliders, the
// `ui` prop, `window.__DIAL_UI__` and `localStorage['zero.dialui']` were all
// deleted in the same session. An option still switchable is an option that
// has to be decided twice. Their copy is in decisions.md under this date if
// anyone ever wants it back.
//
// LEFT AND RIGHT STILL WALK THE PICTURES. That was never what was removed: it
// is how this bar has worked since it was built. What went is up, down and
// shift-arrow as a way to reach a dial.
//
// ROUND FOUR, 2026-08-23, and it is the last one.
//
// FOUR THINGS, ALL FOUR DONE HERE:
//
// 1. A MINUS AND A PLUS FLANK EACH DIAL. A bare hairline with a 17px hit box is
// invisible affordance: correct to look at, and there is nothing on it saying
// it can be touched. The two glyphs are the smallest thing that says so. They
// nudge RELATIVELY rather than snapping to a grid, so minus then plus lands
// back on the number it started from, which matters more now that there is no
// reset button to get back to it. 2. THE HINT LINE IS DELETED. Not reworded:
// deleted. 3. A LITTLE X IN THE CORNER, and clicking outside still closes;
// both ways out, combined. The X is absolutely placed on the card, so it is in
// the corner whatever the header does. 4. "PUT IT BACK" IS GONE FROM THIS BAR.
// The same reset stays in Settings, where it has a row and a label with room
// to say what it means.
//
// MINIMALISM TRUMPS ALL is the standing rule on this component now. Nothing
// else may be added to this bar unless it is asked for by name.
//
// ROUND FIVE, 2026-08-23, AND IT IS SETTLED. Round four was checked in a real
// window:
//
// THE PARTS ARE APPROVED. The minus and the plus, the readout, the X existing
// at all, the deleted hint line and the deleted reset are all settled. What
// changed is the LAYOUT: where those parts sit relative to each other and how
// loud they are.
//
// Six arrangements were compared behind a temporary switch and QUIET was
// approved. QUIET IS ROUND FOUR'S GEOMETRY WITH THE VOLUME DOWN, plus an X
// that is smaller and thinner. It is what this component draws now,
// unconditionally. THE SWITCH AND THE FIVE NOT PICKED ARE DELETED, along with
// the two add-ons offered inside the options passed over (a lower X, and a
// ringed tick on the chosen tile). An option still switchable is an option
// that has to be decided twice. Their copy is in decisions.md under 2026-08-24
// if it is ever wanted back; do not put any of it on this bar again unless it
// is asked for.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { LOOKS, lookMeans, SKINS, TUNE_DEFAULT, TUNE_LIMITS, type Look, type SkinId, type SkinTune } from '../skins';
import { readySkin } from '../look-switch';
import { MatchMark } from './MatchMark';

// THE LIST IS SKINS' OWN AND IT USED TO BE COPIED HERE. It was three lines that
// happened to agree with `LOOKS` in skins.ts, which is exactly the shape that
// broke the introduction's Next button and the tab tour on 2026-08-24: a second
// copy of a list kept in step with the first by nothing at all. Adding Match my
// system is what found it, because the bar was the one theme control in the app
// that would not have grown the tile.

// A theme or a picture, and only a picture has dials. Off SKINS, exactly as
// Settings asks it, so a picture added later needs no edit here.
const isSkin = (l: Look): l is SkinId => SKINS.some((sk) => sk.id === l);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmtBlur = (v: number) => (v === 0 ? 'none' : `${Math.round(v)}px`);
const fmtDim = (v: number) => `${Math.round(v * 100)}%`;
// WHAT ONE PRESS OF MINUS OR PLUS MOVES, which is not what a drag snaps to.
// Blur has 21 values across its whole range so one press is one of them.
// Darkness has 86, and at one percent a press is a change she cannot see and
// the range is 85 presses wide; five percent is seventeen presses and visible.
const NUDGE = { blur: 1, dim: 0.05 } as const;

/* * =========================================================================
 THE WAY BACK TO WHAT A PICTURE SHIPPED WITH.

 The five not taken are deleted rather than hidden, per the rule on w-4b18412c42, and
 their wording is in decisions.md if one is ever wanted back.

   WHAT WAS TAKEN, and why it is the quiet one: the glyph lives in a column of
   the dial that is ALWAYS reserved and almost always empty, so its arriving
   moves nothing on the bar. It arrives only when the pointer is on THAT dial
   and that dial is off its own number. Standing still, the bar carries no
   reset anywhere on it, which is the bar approved as quiet.

   IT IS PER DIAL, not one button for both. Blur's glyph puts Blur back and Darkness's puts Darkness back, so
   moving one and undoing it cannot silently move the other.
   =========================================================================
*/

// The one glyph, wherever a design draws one. 11px in a 24 box at stroke 2.4
// paints 1.1px, which is the X's weight rather than the type's stem.
const Undo = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M1 4v6h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* * -------------------------------------------------------------------------
   THE DIAL. The readout that was picked, with the line made into the control.

   WHY THE LINE AND NOT A SLIDER. The readout has no thumb, no track chrome
   and no accent-filled groove; it is two words and a hairline. A thumb put on
   it would make it the rejected round-one slider wearing a different width. So the fill IS the position and there is nothing else to
   draw.

   PRESS ANYWHERE SETS IT, rather than press-then-drag. Over a 168px line the
   whole range is one gesture away, and a press that only grabs would make the
   two-pixel line a target she has to hit twice.

   THE HIT AREA IS 20px TALL AND THE LINE IS 2px. Measured against the fact
   that a 2px pointer target is not a target: the button carries 9px of padding
   above and below the line, so what she is aiming at is the height of a row of
   text while what she sees is the hairline.

   POINTER CAPTURE, so a drag that leaves the line vertically keeps going. The
   dial is 168px wide and her hand is not a ruler.

   THE ARROW KEYS ON IT ARE FOR ASSISTIVE KEYBOARD USE, NOT FOR REACHING THE
   DIAL. There is no arrow key activation: nothing about this control is reached by
   a key and nothing on the bar mentions one. What is kept is the standard
   behaviour of a focused ARIA slider, which is what a screen reader and a
   tab-only user expect to find, and it is also what stops Left and Right
   walking to the next picture while a dial has focus.

 THE MINUS AND THE PLUS.

   THEY NUDGE FROM WHERE SHE IS, not onto a grid. value +/- nudge, clamped, and
   nothing is rounded to a multiple. So minus then plus is a no-op and she can
   always walk back to the number she came from, which is the job "Put it back"
   used to do before it was deleted.

   NUDGE IS NOT STEP. Darkness drags at one percent, because a drag wants every
   value, but at one percent a press is a change she cannot see and crossing the
   range is 85 of them. Five percent is seventeen presses end to end and one
   press is visible. Blur is 21 values wide already, so its nudge IS its step.

   HOLDING REPEATS, after 400ms, ten a second. A press is still a single nudge,
   so nothing about the simple gesture changes; holding is only there so the far
   end of the range is not a wrist exercise.
   -------------------------------------------------------------------------
*/
function Dial({ label, value, min, max, step, nudge, format, onChange, preset, onReset }: {
  label: string; value: number;
  min: number; max: number; step: number; nudge: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  // ROUND SEVEN, TEMPORARY. What this dial shipped with, and the way back to
  // it. Three of the six designs live inside the dial rather than beside it.
  preset: number;
  onReset: () => void;
}) {
  const line = useRef<HTMLSpanElement | null>(null);
  // The repeat timers, and the live value the repeat reads. A repeating handler
  // closed over the render's `value` would nudge from the same number every
  // tick and go one step and stop, so the current number is kept in a ref.
  const held = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const now = useRef(value);
  now.current = value;
  // Dragging is a ref AND a state: the ref is what the move handler reads, so
  // it cannot be a render behind the press, and the state is only there to put
  // the lit class on. A single state would drop the first few pixels of a fast
  // drag.
  const dragging = useRef(false);
  const [live, setLive] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;
  // WHETHER THERE IS ANYTHING TO UNDO. Half a step of slack, because a drag
  // snaps to the step and a float that lands on 0.7750000000000001 is still
  // home. This is the whole of what decides if the glyph can appear.
  const moved = Math.abs(value - preset) > step / 2;

  const setFrom = (clientX: number) => {
    const box = line.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const raw = min + ((clientX - box.left) / box.width) * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(clamp(Number(snapped.toFixed(4)), min, max));
  };

  const by = (d: number) => onChange(clamp(Number((now.current + d * nudge).toFixed(4)), min, max));
  const stopHold = () => {
    clearTimeout(held.current.t);
    clearInterval(held.current.i);
    held.current = {};
  };
  const startHold = (d: number) => {
    by(d);
    stopHold();
    held.current.t = setTimeout(() => { held.current.i = setInterval(() => by(d), 100); }, 400);
  };
  // A dial can be unmounted mid-hold: pick Light while holding plus, and the
  // dials go away with an interval still running on a component that is gone.
  useEffect(() => stopHold, []);

  const arrow = (d: 1 | -1) => (
    <button
      type="button"
      className={`theme-dial-nudge ${d > 0 ? 'more' : 'less'}`}
      aria-label={`${d > 0 ? 'More' : 'Less'} ${label.toLowerCase()}`}
      onPointerDown={(e) => { e.preventDefault(); startHold(d); }}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
    >
      {d > 0 ? '+' : '−'}
    </button>
  );

  return (
    <div className={`theme-dial${live ? ' live' : ''}${moved ? ' moved' : ''}`}>
      {arrow(-1)}
      <span className="theme-dial-label">{label}</span>
      <span className="theme-dial-val">{format(value)}</span>
      {arrow(1)}
      {/* THE WAY BACK. The cell is always in the grid so nothing on the bar
          moves when the glyph arrives; the stylesheet turns its VISIBILITY on
          under the pointer, and only while this dial is off its own number.
          Out of the tab order and out of the accessibility tree at home,
          because a button that undoes nothing is not a stop worth making. */}
      <button
        type="button"
        className="theme-dial-late"
        tabIndex={moved ? 0 : -1}
        aria-hidden={!moved}
        title={`Back to ${format(preset)}`}
        aria-label={`Put ${label.toLowerCase()} back to ${format(preset)}`}
        onClick={onReset}
      ><Undo /></button>
      <button
        type="button"
        className="theme-dial-track"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={(e) => {
          dragging.current = true;
          setLive(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          setFrom(e.clientX);
        }}
        onPointerMove={(e) => { if (dragging.current) setFrom(e.clientX); }}
        onPointerUp={(e) => { dragging.current = false; setLive(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { dragging.current = false; setLive(false); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onChange(clamp(Number((value + step).toFixed(4)), min, max)); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); onChange(clamp(Number((value - step).toFixed(4)), min, max)); }
        }}
      >
        <span className="theme-dial-line" ref={line}><i style={{ width: `${pct}%` }} /></span>
      </button>
    </div>
  );
}

export function ThemePicker({ look, onSetLook, tune, onSetTune, onClose }: {
  look: Look;
  onSetLook: (l: Look) => void;
  // The live dials for whatever picture is on, and the two ways to move them.
  // Passed in rather than read here: App owns them, Settings moves the same
  // pair, and a copy held in this component would be the second answer.
  tune: SkinTune;
  onSetTune: (t: SkinTune) => void;
  onClose: () => void;
}) {
  const strip = useRef<HTMLDivElement | null>(null);
  const skin = isSkin(look);

  // WHICH ONE IS SELECTED IS READ OFF THE LOOK, never held here. Settings and
  // ⌘K can both change the theme while this is open, and a picker holding its
  // own idea of the answer would be showing a tick on the wrong tile.
  const at = Math.max(0, LOOKS.findIndex((l) => l.id === look));

  // WHAT THIS PICTURE SHIPPED WITH, off the same TUNE_DEFAULT table Settings
  // reads and App's `resetTune` writes back, so the bar cannot promise a
  // number the pane would disagree with. Sixteen pictures carry sixteen
  // measured pairs and a reset holding its own idea of home is the kind of
  // wrong that looks right until the second picture. Light, Dark and Match
  // have no photograph, so they fall back to the Lake's pair only to give the
  // arithmetic a shape; they draw no dials and therefore no reset at all.
  const preset = (skin ? TUNE_DEFAULT[look as SkinId] : undefined) ?? TUNE_DEFAULT[SKINS[0].id];

  // WHERE THE ARROWS ARE HEADED, which runs ahead of `at`. The window only
  // changes once the next picture is decoded (look-switch.ts), so two quick
  // presses would otherwise both step from the same tile and move once.
  const target = useRef(at);
  useEffect(() => { target.current = at; }, [at]);
  const step = useCallback((d: number) => {
    target.current = (target.current + d + LOOKS.length) % LOOKS.length;
    onSetLook(LOOKS[target.current].id);
  }, [onSetLook]);

  // The strip is wider than the window at sixteen pictures, so stepping past
  // the edge has to bring the tile to her rather than leaving her pressing a
  // key that changes the window and nothing she can see.
  useEffect(() => {
    strip.current?.querySelector('.look.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    // The two pictures an arrow can reach next start decoding now, so the next
    // press changes the window without waiting.
    for (const d of [1, -1]) void readySkin(lookMeans(LOOKS[(at + d + LOOKS.length) % LOOKS.length].id).skin);
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dial that has focus owns its own arrows. Without this, tabbing to
      // Blur and pressing Right walks to the next theme and takes the dial she
      // was aiming at off the screen.
      const el = e.target as HTMLElement | null;
      if (el?.classList?.contains('theme-dial-track')
        && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    // Capture, so Escape closes this rather than the screen underneath it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, onClose]);

  return (
    <div className="themes-backdrop" onMouseDown={onClose}>
      <div className="theme-picker" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Themes">
        {/* THE X, and with clicking away it is the whole of what closes this. It is placed
           on the card rather than in the header row, so it stays in the corner when a
           narrow window wraps the dials onto their own line.
         */}
        <button type="button" className="theme-picker-x" aria-label="Close" onClick={onClose}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path d="M1.6 1.6 9.4 9.4M9.4 1.6 1.6 9.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* NO HINT LINE.
         */}
        <div className="theme-picker-head">
          <span className="theme-picker-title">Themes</span>

          {/* BOTH DIALS, ALWAYS, UNDER A PICTURE. Light and Dark are the one exception and
             it is not a hiding rule: there is no photograph to blur and no veil to turn
             down, so a dial there is a control that does nothing.
           */}
          {skin && (
            <div className="theme-dials">
              {preset.panelOpacity !== undefined && <Dial label={skin === 'orbital-glass' ? 'Panel tint' : 'Panel whiteness'} value={tune.panelOpacity ?? preset.panelOpacity} {...TUNE_LIMITS.panelOpacity} nudge={0.05} format={fmtDim}
                onChange={(panelOpacity) => onSetTune({ ...tune, panelOpacity })}
                preset={preset.panelOpacity} onReset={() => onSetTune({ ...tune, panelOpacity: preset.panelOpacity })} />}
              <Dial label="Foreground blur" value={tune.blur} {...TUNE_LIMITS.blur} nudge={NUDGE.blur} format={fmtBlur}
                onChange={(blur) => onSetTune({ ...tune, blur })}
                preset={preset.blur} onReset={() => onSetTune({ ...tune, blur: preset.blur })} />
              <Dial label="Background blur" value={tune.backgroundBlur ?? 0} {...TUNE_LIMITS.backgroundBlur} nudge={4} format={fmtBlur}
                onChange={(backgroundBlur) => onSetTune({ ...tune, backgroundBlur })}
                preset={preset.backgroundBlur ?? 0} onReset={() => onSetTune({ ...tune, backgroundBlur: preset.backgroundBlur ?? 0 })} />
              <Dial label="Darkness" value={tune.dim} {...TUNE_LIMITS.dim} nudge={NUDGE.dim} format={fmtDim}
                onChange={(dim) => onSetTune({ ...tune, dim })}
                preset={preset.dim} onReset={() => onSetTune({ ...tune, dim: preset.dim })} />
            </div>
          )}
        </div>

        <div className="theme-picker-strip" ref={strip}>
          {LOOKS.map((l) => (
            <button
              key={l.id}
              className={`look${look === l.id ? ' on' : ''}`}
              aria-pressed={look === l.id}
              onPointerEnter={() => void readySkin(lookMeans(l.id).skin)}
              onFocus={() => void readySkin(lookMeans(l.id).skin)}
              onClick={() => onSetLook(l.id)}
            >
              <span className={`look-swatch ${l.id}`} aria-hidden="true">
                {l.id === 'match' && <MatchMark />}
                <span className="look-tick" aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.6 5.7 4.2 8.3 9.4 2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
              <span className="look-name">{l.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
