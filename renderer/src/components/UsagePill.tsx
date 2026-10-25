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
import { headlineLimit, limitRows, limitsStillRunning, usageSentence } from '../../../shared/usage.mjs';
import { agoQuiet } from '../format';
import type { Usage } from '../types';
import { engineLabel } from '../../../shared/engines.mjs';

// It is the one threshold and it is deliberately high: a corner that shouts at
// half is a corner that is shouting all day. Stated as what is SPENT, like
// everything else here since she straightened the direction out; it is the same
// moment it always was.
const CLOSE = 80;

// A BEAT BEFORE A HOVER CLOSES IT, so a pointer that slips off the edge of the
// bar does not snap the panel shut under the hand that opened it. A hovered
// panel takes no pointer (styles.css, w-7b7182ef61), so hovering is about the
// bar, and reading it without holding the mouse still is what the press is for.
const LINGER_MS = 220;

// In the sidebar it is a row like Feedback and Settings: this gauge, the agent's
// name, and the percent where Inbox shows its count (w-dcaa2c122e, picked from five).
const GaugeIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.6-4.2"/></svg>;

// IN THE SIDEBAR IT NAMES THE AGENT YOU USED LAST (w-dcaa2c122e): "Claude Code
// 47%". Using more than one, pointing at it lists each, that one first. An
// agent counts while it has a reading from this week; older figures have reset.
const WEEK = 7 * 24 * 60 * 60 * 1000;
export function agentsInUse(all: Usage[], recent: string | null, sent: Usage | null, now: number): { word: string; usage: Usage }[] {
  // A reading whose every window has started over since it was taken is not a
  // figure about this agent any more (w-7b7182ef61).
  const fresh = all.filter((u) => now - u.at < WEEK && headlineLimit(limitsStillRunning(u.limits, now)));
  const last = fresh.find((u) => u.engine === recent) ?? fresh.find((u) => u.engine === sent?.engine) ?? fresh[0];
  return last ? [last, ...fresh.filter((u) => u !== last)].map((u) => ({ word: engineLabel(u.engine), usage: u })) : [];
}
export function UsagePill({ all, recent = null, ...props }: Parameters<typeof UsageOne>[0] & { all?: Usage[]; recent?: string | null }) {
  if (!props.sidebar) return <UsageOne {...props} />;
  const agents = agentsInUse(all ?? (props.usage ? [props.usage] : []), recent, props.usage, props.now);
  const last = agents[0]?.usage ?? props.usage;
  if (!last) return null;
  return <UsageOne {...props} usage={last} engineWord={engineLabel(last.engine)} agents={agents} />;
}

function UsageOne({ usage, now, engineWord = null, onOpen, sidebar = false, agents = [] }: {
  usage: Usage | null;
  sidebar?: boolean;
  /** In the sidebar, every agent in use, the one used last first. */
  agents?: { word: string; usage: Usage }[];
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
  // Only the windows this reading can still answer for (`limitsStillRunning`).
  const limits = limitsStillRunning(usage?.limits, now);
  // OPEN BECAUSE SHE CLICKED, which outlives the pointer leaving. Hover is held
  // separately, so moving away closes a hovered panel and leaves a clicked one
  // exactly where it is.
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLButtonElement>(null);
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
    // A press on the panel closes it too: it hangs over Settings, and counting
    // that as a press inside left the row unreachable (w-7b7182ef61). The bar is
    // left out because its own click already toggles.
    const onDown = (e: MouseEvent) => {
      if (!bar.current?.contains(e.target as Node)) setPinned(false);
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
  // AND THE BAR IS THE SESSION WINDOW ONLY WHERE ONE EXISTS. On some Codex
  // plans there is no five hour window at all, so asking for one drew an empty
  // corner on a day the weekly limit was full. `headlineLimit` says why.
  const session = headlineLimit(limits);
  if (!session) return null;

  const used = Math.max(0, Math.min(100, session.percent));
  const rows = limitRows(limits, now);
  const joint = agents.length > 1;
  const sentence = joint
    ? agents.map((a) => usageSentence(a.usage.limits, now, a.word)).join(' ')
    : usageSentence(limits, now, engineWord) ?? '';

  // In the sidebar it opens after a beat, so a pointer crossing the foot does not flash it.
  const enter = () => {
    if (linger.current) { clearTimeout(linger.current); linger.current = null; }
    if (sidebar) linger.current = setTimeout(() => setHovering(true), 120);
    else setHovering(true);
  };
  const leave = () => {
    if (linger.current) clearTimeout(linger.current);
    linger.current = setTimeout(() => setHovering(false), LINGER_MS);
  };

  return (
    <div className="usage-box" ref={box} onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        ref={bar}
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
        {sidebar && <><GaugeIcon /><span className="usage-row-label">{engineWord ?? 'Usage'}</span><span className="usage-row-num">{used}%</span></>}
        {!sidebar && <span className="usage-meter" aria-hidden="true">
          <i style={{ width: `${used}%` }} />
        </span>}
      </button>
      {open && (
        <div className={`usage-panel ${pinned ? 'is-pinned' : ''}`} id={panelId} role="group" aria-label={engineWord ?? 'Your limits'}>
          {/* THE ONE WORD IT ALREADY HAD, MADE TRUE. Naming the agent costs the
              panel no extra line: the heading either says whose limits these
              are, or goes on saying what it always said. A second row saying
              "Coding agent: Codex" would be density on a glance surface, and a
              dense screen is a failed screen. */}
          {joint ? <h3>{agents[0].word}<small>Last used</small></h3> : <h3>{engineWord ?? 'Your limits'}</h3>}
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
          {joint && usage && <div className="usage-read">{agoQuiet(usage.at, now) === 'now' ? 'Read just now' : `Read ${agoQuiet(usage.at, now)} ago`}</div>}
          {agents.slice(1).map((a) => <div className="usage-other" key={a.word}>
            <h3>{a.word}</h3>
            {limitRows(a.usage.limits, now).map((r) => (
              <div className="usage-lim" key={r.key}>
                <div className="usage-lim-top">
                  <span className="usage-lim-name">{r.name}</span>
                  <span className="usage-lim-used">{r.used}% used</span>
                </div>
                <span className="usage-meter wide" aria-hidden="true"><i style={{ width: `${r.used}%` }} /></span>
                {r.when && <div className="usage-lim-when">{r.when}</div>}
              </div>
            ))}
            <div className="usage-read">{agoQuiet(a.usage.at, now) === 'now' ? 'Read just now' : `Read ${agoQuiet(a.usage.at, now)} ago`}</div>
          </div>)}
          {/* HOW OLD THE READING IS, because it is never live, and a panel that
              hides that can be quietly wrong for half an hour. `agoQuiet` is the
              app's own clock word: it says "now" under a minute and never counts
              seconds at her (hers, 2026-08-20). Its "now" is a whole answer and
              its "4m" is a span, so only the second one takes "ago". */}
          {usage && !joint && (
            <div className="usage-panel-foot">
              {agoQuiet(usage.at, now) === 'now' ? 'Read just now' : `Read ${agoQuiet(usage.at, now)} ago`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
