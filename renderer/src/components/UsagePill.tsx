// WHAT IS LEFT OF HER LIMIT, IN THE CORNER SHE ALREADY LOOKS AT.
//
// IT WAS THAT PILL AND SHE COULD NOT READ IT.
//
// Two faults wore that one sentence. A parse bug had dropped the time beside
// the number, so a control built to say two things was saying one (see
// shared/claude-usage.mjs).
//
// SIX SHAPES WERE DRAWN AT REAL SIZE for her to pick from
// (designs//usage-options.html) and this is the one she picked:
//
// So the corner is A BAR AND NOT A NUMBER, and a length needs no unit, no noun
// and no percent sign to be read. There is nothing to misread because there is
// nothing written. That is the whole of the fix for her sentence.
//
// IT FILLS AS SHE SPENDS. Every bar anybody has used fills up, so this one does
// too, and the panel's numbers say "used" beside it rather than disagreeing
// with the thing they sit under.
//
// AND THE DETAIL IS ONE MOVEMENT AWAY, not one screen away. Hover or click and
// all three limits open underneath, named the way she named them. Both gestures,
// because she asked for both: the hover is for the glance, the click is for
// reading it without having to hold the mouse still.
//
// IT NO LONGER OPENS SETTINGS.
//
// NOTHING IS DRAWN UNTIL THERE IS SOMETHING TRUE TO DRAW. No dashes, no
// skeleton, no "checking…". Reading the figure costs seconds and a launch is
// exactly when nobody has one yet; a bar that spends that time saying it does
// not know is a bar that has already broken the promise this whole app makes
// about status lines.

import { useEffect, useId, useRef, useState } from 'react';
import { headlineLimit, limitRows, usageSentence } from '../../../shared/usage.mjs';
import { agoQuiet } from '../format';
import type { Usage } from '../types';

// It is the one threshold and it is deliberately high: a corner that shouts at
// half is a corner that is shouting all day. Stated as what is SPENT, like
// everything else here since she straightened the direction out; it is the same
// moment it always was.
const CLOSE = 80;

// A BEAT BEFORE A HOVER CLOSES IT. The panel hangs below the bar with a gap
// between them, and a pointer travelling from one to the other crosses that gap.
// Closing on the first mouseleave would make the panel impossible to reach.
const LINGER_MS = 220;

export function UsagePill({ usage, now, engineWord = null, onOpen, sidebar = false }: {
  usage: Usage | null;
  sidebar?: boolean;
  /**
   * Held by the caller so the reading moves with the rest of the app's clocks
   *  rather than starting a second one in the corner. */
  now: number;
  /**
   * WHOSE SUBSCRIPTION THIS READING IS, or null on every Mac with one coding
   * agent.
   *
   *  IT IS HANDED OVER, NEVER DERIVED. Which agent the corner is about needs the
   *  capability gate and the staleness rule, both pinned to main/supervisor.mjs;
   *  a corner that worked it out here could name Codex over a Claude Code
   *  reading. App.tsx asks `engineWordFor`, which is the byline's one rule for
   *  this and returns null wherever there is only one agent to name -- so on
   *  that Mac nothing here draws anything new. */
  engineWord?: string | null;
  /**
   * Called when the panel opens. Kept so a caller that used to hand this a
   *  destination still compiles; nothing in the app passes one any more, because
   *  her answer was that this does not belong in Settings. */
  onOpen?: () => void;
}) {
  const limits = usage?.limits ?? [];
  // OPEN BECAUSE SHE CLICKED, which outlives the pointer leaving. Hover is held
  // separately, so moving away closes a hovered panel and leaves a clicked one
  // exactly where it is.
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const open = pinned || hovering;

  useEffect(() => () => { if (linger.current) clearTimeout(linger.current); }, []);

  // ESCAPE CLOSES IT, and a press anywhere else does too: the same two ways out
  // that everything else opening over this app has.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPinned(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setPinned(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown);
    };
  }, [pinned]);

  // NOTHING AT ALL UNTIL A READING LANDS. This sits below the hooks rather than
  // above them, because a render where the reading has not arrived yet must not
  // skip any of them.
  // AND THE BAR IS THE SESSION WINDOW ONLY WHERE ONE EXISTS. On her Codex plan
  // there is no five hour window at all, so asking for one drew an empty corner
  // on a day her weekly limit was full. `headlineLimit` says why.
  const session = headlineLimit(limits);
  if (!session) return null;

  const used = Math.max(0, Math.min(100, session.percent));
  const rows = limitRows(limits, now);
  const sentence = usageSentence(limits, now, engineWord) ?? '';

  const enter = () => {
    if (linger.current) { clearTimeout(linger.current); linger.current = null; }
    setHovering(true);
  };
  const leave = () => {
    if (linger.current) clearTimeout(linger.current);
    linger.current = setTimeout(() => setHovering(false), LINGER_MS);
  };

  return (
    <div className="usage-box" ref={box} onMouseEnter={sidebar ? undefined : enter} onMouseLeave={sidebar ? undefined : leave}>
      <button
        type="button"
        className={`usage-pill ${used >= CLOSE ? 'is-close' : ''}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // THE WHOLE TRUTH GOES TO WHATEVER READS THIS ALOUD. The corner has no
        // words in it at all now, so this is not a summary waiting to be
        // expanded. It is the only reading there is for somebody who cannot see
        // a bar.
        aria-label={sentence}
        onClick={() => { const next = !pinned; setPinned(next); if (next) onOpen?.(); }}
        onFocus={sidebar ? undefined : enter}
        onBlur={sidebar ? undefined : leave}
      >
        {sidebar && <><span className="usage-sidebar-label">{engineWord ?? 'Usage'}</span><span className="usage-sidebar-percent">{used}% used</span></>}
        {!sidebar && <span className="usage-meter" aria-hidden="true">
          <i style={{ width: `${used}%` }} />
        </span>}
      </button>
      {open && (
        <div className="usage-panel" id={panelId} role="group" aria-label={engineWord ?? 'Your limits'}>
          {/* THE ONE WORD IT ALREADY HAD, MADE TRUE. Naming the agent costs the
              panel no extra line: the heading either says whose limits these
              are, or goes on saying what it always said. A second row saying
              "Coding agent: Codex" would be density on a glance surface, and a
              dense screen is a failed screen. */}
          <h3>{engineWord ?? 'Your limits'}</h3>
          {rows.map((r) => (
            <div className="usage-lim" key={r.key}>
              <div className="usage-lim-top">
                <span className="usage-lim-name">{r.name}</span>
                <span className="usage-lim-used">{r.used}% used</span>
              </div>
              <span className="usage-meter wide" aria-hidden="true">
                <i style={{ width: `${r.used}%` }} />
              </span>
              {r.when && <div className="usage-lim-when">{r.when}</div>}
            </div>
          ))}
          {/* HOW OLD THE READING IS, because it is never live, and a panel that
              hides that can be quietly wrong for half an hour. `agoQuiet` is the
              app's own clock word: it says "now" under a minute and never counts
              seconds at her (hers, 2026-08-20). Its "now" is a whole answer and
              its "4m" is a span, so only the second one takes "ago". */}
          {usage && (
            <div className="usage-panel-foot">
              {agoQuiet(usage.at, now) === 'now' ? 'Read just now' : `Read ${agoQuiet(usage.at, now)} ago`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
