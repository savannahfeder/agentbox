// THE PLAN QUESTION AND THE SETUP CARD (w-9f6975906c). What they say at every
// moment is decided in ../plan-setup.ts, where it is tested; this file draws it
// and talks to the main process. Both screens wear the walk's own card and row
// classes (`fr-card fr-folders`, `fr-folder`), so they are the folder screen's
// siblings rather than a new look, which is how they were drawn and picked.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  COPY, LOOK_AGAIN_FOR_MS, LOOK_AGAIN_MS, afterCheck, afterFound, enginesFor, foundHead, foundLede,
  foundRows, litRow, planName, planNote, planRows, readLog, readyEngines, setupLede, setupRows,
  worthLookingAgain,
  type AskRow, type Engine, type EngineSetupState, type Plan, type StepRow,
} from '../plan-setup';
import { Cap } from './Onboarding';
import { hoverLit } from '../onboarding';

const Mark = ({ letter }: { letter: string }) => <span className="ps-mark" aria-hidden="true">{letter}</span>;

/** The setup card's own done mark, cut to sit beside 12px type. */
const Tick = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
);

/**
 * A CARD OF ANSWERS: a mark, a name, a sentence, arrows and Enter, no Submit.
 *
 *  Lifted out of `PlanQuestion` on 2026-10-09 (w-ce8c1a9275) so the walk's last
 *  card can be the same thing. The founder, on a photograph of that card drawn
 *  as three buttons in a row: "In onboarding we already have a component for
 *  geting setup/selecting your harness I feel like that's a better design an
 *  dpossibly placement." It was a second vocabulary for one moment, on the one
 *  screen in the app that will not let anybody past it.
 *
 *  THE ROWS ARE DATA, from ../plan-setup, so what a card offers is read by a
 *  test rather than eyeballed. `other` is the separated group at the foot: the
 *  ways out, as opposed to the things somebody pays for.
 */
export function AskList({ rows, label, onPick, busy = false, start = 0 }: {
  rows: AskRow[];
  label: string;
  onPick: (key: string) => void;
  /** Something is already happening, so a second press would start a race. */
  busy?: boolean;
  /**
   * Which row Return rests on. The first, except on the found screen, where it
   * is the plan that is already running agents and that may be the second one.
   */
  start?: number;
}) {
  const [lit, setLit] = useState(start);
  // Whether the mouse has moved since this card was drawn (`hoverLit`). Without
  // it the card lights whatever row is drawn under a mouse standing still, and
  // here that row's Return opens a sign-in page for a plan nobody picked.
  const stirred = useRef(false);
  useEffect(() => {
    const on = () => { stirred.current = true; };
    // Capture, so the first movement counts before the row under the pointer
    // asks to be lit.
    window.addEventListener('mousemove', on, { capture: true });
    return () => window.removeEventListener('mousemove', on, { capture: true });
  }, []);
  // A row that leaves the app is its own anchor, so a CLICK on one is the
  // browser's to handle and never reaches here; this is the keyboard's copy of
  // that, and the only place `href` is opened by hand.
  const choose = useCallback((i: number) => {
    const row = rows[i];
    if (!row || busy) return;
    if (row.href) window.open(row.href, '_blank', 'noreferrer');
    else onPick(row.key);
  }, [busy, onPick, rows]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setLit((n) => Math.min(rows.length - 1, n + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setLit((n) => Math.max(0, n - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(lit); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [choose, lit, rows.length]);

  return (
    <div className="fr-card fr-folders" role="listbox" aria-label={label}>
      {rows.map((row, i) => {
        const inside = (
          <>
            <span className="fr-fold">
              {row.mark ? <Mark letter={row.mark} /> : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" /></svg>
              )}
            </span>
            <span className="fr-folder-name">{row.name}</span>
            {row.sub && <span className="fr-folder-path">{row.sub}</span>}
            {/* The column the folder screen says "via" in. It is where a row's
                own state belongs: right-aligned against the key, so the words
                on every row line up with each other whatever they say. */}
            {row.sub && (
              <span className="fr-folder-via">
                {row.tick && <Tick />}
                {row.right}
              </span>
            )}
            <span className="fr-folder-key">{lit === i && <Cap cap="↵" />}</span>
          </>
        );
        const className = `fr-folder${row.other ? ' fr-folder-other' : ''}${lit === i ? ' lit' : ''}`;
        // A ROW THAT LEAVES THE APP IS AN ANCHOR, so the address is in the page
        // and can be copied or opened in a new window. Everything else is a
        // button, because it does something here.
        return row.href ? (
          <a
            key={row.key}
            role="option"
            aria-selected={lit === i}
            className={className}
            href={row.href}
            target="_blank"
            rel="noreferrer"
            onMouseEnter={() => setLit((l) => hoverLit(l, i, stirred.current))}
            onMouseMove={() => setLit((l) => hoverLit(l, i, stirred.current))}
          >{inside}</a>
        ) : (
          <button
            key={row.key}
            type="button"
            role="option"
            aria-selected={lit === i}
            className={className}
            onMouseEnter={() => setLit((l) => hoverLit(l, i, stirred.current))}
            onMouseMove={() => setLit((l) => hoverLit(l, i, stirred.current))}
            onClick={() => choose(i)}
          >{inside}</button>
        );
      })}
    </div>
  );
}

const RowIcon = ({ state }: { state: StepRow['state'] }) => (
  state === 'done' ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
  ) : state === 'now' ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="currentColor" /></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5" /></svg>
  )
);

/**
 * WHICH AI PLAN DO YOU PAY FOR. Five rows now, the same list the folder screen
 *  is: arrows move, Enter or a click answers, and there is no Submit.
 *
 *  THE FOURTH IS "I ALREADY HAVE ONE" (w-ce8c1a9275). It is an answer to this
 *  question and not a screen of its own: the search asks their own login shell
 *  first and then looks in sixteen places, and when it still misses, the only
 *  thing left is to be shown.
 *
 *  AND THE SCREEN LOOKS AT THE COMPUTER WHILE IT ASKS. The founder: "I would
 *  think this step is actually better fit also checking first at the same time.
 *  Otherwise they may select something we cant run. Best to figure it out now."
 *
 *  They are right, and the gap was in the data rather than the drawing. The
 *  walk probes both engines at the welcome step and then reduces the two
 *  readings to `needsPlan`, one boolean; `afterCheck` can tell three cases
 *  apart from the very same readings, and only one of them is a question worth
 *  asking. A machine with Codex on the disk signed out was being shown three
 *  plans, and somebody picking Claude there sent us off to install Claude Code
 *  -- which is the "select something we cant run" in their note.
 *
 *  So `look()` runs on arrival. It is the walk's own cached probe, so this
 *  costs nothing on top of what the welcome step already paid, and the three
 *  answers go to the three things that handle them: ready SAYS SO, on this
 *  screen, a tool-on-the-disk goes straight to signing THAT one in, and only
 *  an empty computer leaves the question standing.
 *
 *  READY USED TO WALK STRAIGHT PAST (w-e217e577e5). It is the ordinary case --
 *  most people already have one of these signed in -- and it was the one that
 *  said nothing at all, so the first anybody knew of whose plan was being spent
 *  was an agent spending it.
 */
export function PlanQuestion({ onPick, onReady, onSkip, look, found = null }: {
  onPick: (plan: Plan) => void;
  /** Done here: on, to the folder screen. */
  onReady: () => void;
  /** Not now: on to the folder screen with no plan, which `PlanBar` on the
   *  inbox picks up afterwards. */
  onSkip: () => void;
  /**
   * WHAT THE WALK ALREADY FOUND, when it found something (w-e217e577e5). The
   * screen is the question or the answer, and which one is known before it is
   * drawn, so the first frame is already the right screen. Taking its own
   * reading here would draw the question and then replace it, and a headline
   * that changes under somebody is worse than either headline.
   *
   * Null is "nothing can run yet", which is the question.
   */
  found?: Array<Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>> | null;
  /**
   * The two readings, from whoever has them. The walk hands in `askMac`, which
   * is cached, so the answer is usually here the instant this is drawn; a copy
   * opened straight onto this step takes its own.
   *
   * `fresh` THROWS THAT CACHE AWAY, and it is not optional. Pointing at a file
   * changes the very thing the cache is a reading of, so asking the cached
   * answer afterwards would report the machine as it was before the press.
   */
  look?: (fresh?: boolean) => Promise<Array<Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>>>;
}) {
  const [ready, setReady] = useState(found);
  const [looking, setLooking] = useState(!found);
  const [looked, setLooked] = useState(false);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);

  const readings = useCallback(async (fresh: boolean) => {
    if (look) return look(fresh);
    const found = await Promise.all((['claude', 'codex'] as Engine[]).map((e) => api.engineSetup('ready', e)));
    return found.map((f) => ({ engine: f.engine, found: !!f.found, signedIn: !!f.signedIn }));
  }, [look]);

  const check = useCallback(async (fresh = false) => {
    setLooking(true);
    setRefused(false);
    let rs: Awaited<ReturnType<typeof readings>> = [];
    let next: ReturnType<typeof afterCheck>;
    try { rs = await readings(fresh); next = afterCheck(rs); }
    // A probe that could not run is not a machine with something on it, and
    // this screen's question is the right one either way. Saying "nothing is
    // set up" is the honest summary of a look that came back with nothing.
    catch { next = { t: 'nothing' }; }
    setLooking(false);
    setLooked(true);
    // READY IS AN ANSWER ON THIS SCREEN, not a reason to leave it, and so is a
    // tool on the disk signed out: both draw the found screen and neither
    // mounts the setup card, which would open a browser nobody asked for. What
    // differs is the lede and the words at the right of the rows.
    if (next.t === 'ready' || next.t === 'found') setReady(rs);
  }, [readings]);

  /*
   * ON ARRIVAL, beside the question rather than instead of it: the card is on
   * the screen and answerable from the first frame, and the look lands under it.
   *
   * ONCE, AND THE REF IS LOAD-BEARING. `onReady` is written inline at the call
   * site, so it is a new function on every render of the walk; without this the
   * effect would re-fire on each one and the step would probe the machine in a
   * loop for as long as somebody sat on it.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void check();
  }, [check]);

  /*
   * AND IT LOOKS AGAIN WHILE IT IS UP (F-71). The computer changes under this
   * screen — somebody signs in to Codex in a terminal next door — and the
   * arrival look was the only one, so the answer was a page reload.
   *
   * QUIET, so nothing flickers: it leaves `looking` and `looked` to the
   * arrival look and only replaces the reading when one turns up. In a ref for
   * the same reason `asked` is one: the walk writes `look` inline, so a
   * dependency on it would restart this clock on every render.
   */
  const readingsNow = useRef(readings);
  readingsNow.current = readings;
  const busyLooking = useRef(false);
  const open = worthLookingAgain(ready);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const again = async () => {
      if (busyLooking.current) return;
      busyLooking.current = true;
      try {
        const rs = await readingsNow.current(true);
        if (!live) return;
        const next = afterCheck(rs);
        if (next.t === 'ready' || next.t === 'found') setReady(rs);
      } catch { /* a probe that could not run leaves the screen as it is */ }
      finally { busyLooking.current = false; }
    };
    const clock = setInterval(() => void again(), LOOK_AGAIN_MS);
    const stop = setTimeout(() => clearInterval(clock), LOOK_AGAIN_FOR_MS);
    const back = () => { if (document.visibilityState !== 'hidden') void again(); };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      live = false;
      clearInterval(clock);
      clearTimeout(stop);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [open]);

  /*
   * SHOW IT WHERE ONE IS. The panel opens in the main process and the choice is
   * applied there in the same call, so no path off anybody's disk crosses the
   * bridge (main/ipc.mjs, `zero:engine-bin`). A file that is not something
   * agents can run comes back as words, here, where the press was.
   *
   * Claude Code is what is asked for, because that is the one the app will not
   * open an inbox without; somebody whose only agent is Codex is answered by
   * the look on arrival, which finds it.
   */
  const mine = useCallback(async () => {
    setBusy(true);
    setRefused(false);
    try {
      const r = await api.engineBin('claude');
      if (r?.refused) { setRefused(true); return; }
      if (r?.canceled) return;
      // It landed, so the same look that opened this screen decides what
      // happens next rather than this press assuming it worked -- and it looks
      // AGAIN rather than reading back the answer it cached before the press,
      // which is the one thing this press has just changed.
      await check(true);
    } finally {
      setBusy(false);
    }
  }, [check]);

  const choose = useCallback((key: string) => {
    if (key === 'mine') void mine();
    else if (key === 'skip') onSkip();
    else onPick(key as Plan);
  }, [mine, onPick, onSkip]);

  /*
   * WHAT IT FOUND, ON THE SCREEN THAT WOULD HAVE ASKED. The ticked row is a
   * yes and carries on; any other row is that plan to set up; the last one,
   * when nothing here can run an agent yet, is the way past.
   *
   * WITH NOTHING SIGNED IN THERE IS NO PLAN TO CLAIM, so the heading and the
   * lede both say so: the next press opens a page in somebody's browser, the
   * thing that used to happen with no warning at all.
   */
  if (ready) {
    const rows = foundRows(ready);
    const have = readyEngines(ready);
    const head = foundHead(have);
    return (
      <div className="fr-stack fr-stack-folders">
        <h1 className="fr-page">{head}</h1>
        <p className="fr-lede">{foundLede(have) ?? COPY.foundOut}</p>
        <AskList
          // THE TWO SCREENS ARE TWO LISTS. A copy opened straight onto this
          // step draws the question for one frame, and without a key of its own
          // this remounts as that list, keeping the row Return rested on there.
          key="found"
          rows={rows}
          start={litRow(rows)}
          label={head}
          onPick={(key) => {
            if (key === 'skip') return onSkip();
            const next = afterFound(key, have);
            if (next.t === 'go') onReady();
            else onPick(next.plan);
          }}
        />
        {/* The note is about the row that is NOT ticked, so a computer with
            both signed in has nothing left to be told and gets no line. */}
        {have.length < rows.length && <p className="fr-note">{COPY.foundNote}</p>}
      </div>
    );
  }

  const note = planNote({ looking, looked, refused });
  return (
    <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{COPY.planHead}</h1>
      <p className="fr-lede">{COPY.planLede}</p>
      {/* ANSWERABLE WHILE THE LOOK RUNS. The card is not held back behind it:
          somebody who knows which plan they pay for should not wait on a probe
          about a machine they already know the answer for. */}
      <AskList key="ask" rows={planRows()} label={COPY.planHead} onPick={choose} busy={busy} />
      <p className={note.bad ? 'fr-note fr-refused' : 'fr-note'}>{note.text}</p>
    </div>
  );
}

/**
 * SETTING UP CLAUDE. Installs and signs in each tool the plan needs, one after
 *  the other, and hands back when every one is ready. The only thing it ever
 *  asks of anybody is the approval in their browser.
 */
export function PlanSetupCard({ plan, onDone, onSkip, state: given }: {
  plan: Plan;
  onDone: () => void;
  onSkip: () => void;
  /** A seam for the tests: one phase, drawn with no main process behind it.
   *  Nothing in the app passes it. */
  state?: EngineSetupState;
}) {
  const engines = enginesFor(plan);
  const [at, setAt] = useState(0);
  const engine = engines[Math.min(at, engines.length - 1)];
  const [state, setState] = useState<EngineSetupState>(given ?? { engine, phase: 'installing', error: null, log: '' });
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState(false);
  // Bumped by Try again, which starts the same loop over on the same tool.
  const [round, setRound] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    if (given) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async (first: boolean) => {
      const s = await api.engineSetup(first ? 'start' : 'status', engine);
      if (!live) return;
      setState(s);
      if (s.phase === 'ready') {
        if (at + 1 < engines.length) {
          setState({ engine: engines[at + 1], phase: 'installing', error: null, log: '' });
          setAt(at + 1);
          return;
        }
        if (!finished.current) { finished.current = true; timer = setTimeout(onDone, 700); }
        return;
      }
      if (s.phase === 'failed') return;
      timer = setTimeout(() => tick(false), 1000);
    };
    void tick(true);
    return () => { live = false; if (timer) clearTimeout(timer); };
    // engines is derived from plan, which does not change under a mounted card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, at, round]);

  const retry = () => { setState({ engine, phase: 'installing', error: null, log: '' }); setRound((n) => n + 1); };

  // `codex login` holds a port and opens a page on its own, so leaving the
  // card has to stop it or a browser tab arrives afterwards.
  const leave = () => { void api.engineSetup('cancel', engine); onSkip(); };

  const name = planName(engine);
  const rows = setupRows(state);
  const head = COPY.setupHead(name);
  const said = readLog(state.log);
  const copy = () => {
    if (!said.url) return;
    navigator.clipboard.writeText(said.url)
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })
      .catch(() => { /* the panel below still has the link in words */ });
  };

  return (
    <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{head}</h1>
      <p className="fr-lede">
        {setupLede(state.phase)}
        {engines.length > 1 && <span className="ps-of"> {COPY.setupOf(at + 1, engines.length)}</span>}
      </p>
      <div className="fr-card fr-folders ps-steps">
        {rows.map((row) => (
          <div key={row.title} className={`ps-step ${row.state}`}>
            <span className="ps-ic"><RowIcon state={row.state} /></span>
            <div>
              <div className="ps-t">{row.title}</div>
              {row.sub && <div className="ps-s">{row.sub}</div>}
            </div>
            <span className="ps-r">{row.right ?? ''}</span>
          </div>
        ))}
      </div>
      {state.phase === 'failed' && state.error && <p className="fr-note fr-refused">{state.error}</p>}
      <div className="ps-acts">
        {state.phase === 'signing-in' && (
          <button type="button" className="fr-gate-again" onClick={() => void api.engineSetup('again', engine)}>{COPY.openAgain}</button>
        )}
        {state.phase === 'failed' && (
          <button type="button" className="fr-finish-go" onClick={retry}>{COPY.tryAgain}</button>
        )}
        {/* NOT HIDDEN BEHIND "Show what is happening": on a headless or remote
            computer the link is the only way through. */}
        {said.url && state.phase === 'signing-in' && (
          <button type="button" className="fr-gate-again" onClick={copy}>{copied ? COPY.copiedLink : COPY.copyLink}</button>
        )}
        {/* NOT ONLY AFTER A FAILURE. A sign-in that simply waits for ever is
            not a failure, and it needs a way out most of all. */}
        {state.phase !== 'ready' && (
          <button type="button" className="fr-gate-again" onClick={leave}>{COPY.skip}</button>
        )}
      </div>
      <div className="ps-acts ps-acts-quiet">
        <button type="button" className="ps-link" onClick={() => setShowLog((v) => !v)}>{showLog ? COPY.hideLog : COPY.showLog}</button>
      </div>
      {showLog && (
        <div className="ps-log">
          {said.lines.length ? said.lines.map((line) => <p key={line}>{line}</p>) : <p>…</p>}
          {/* An anchor, so the address can still be read and copied by hand
              when the clipboard is refused. */}
          {said.url && <a className="ps-log-link" href={said.url} target="_blank" rel="noreferrer">{said.url}</a>}
        </div>
      )}
    </div>
  );
}

/**
 * THE FALLBACK, ON THE INBOX. Only when the walk is over and still nothing can
 *  run an agent: somebody skipped, or signed out since. Her words: "if somebody
 *  somehow has an issue, maybe that bar at the top makes sense".
 */
export function PlanBar({ onSetup }: { onSetup: (plan: Plan) => void }) {
  return (
    <div className="ps-bar" role="status">
      <div className="ps-bar-say">{COPY.barSay} <span>{COPY.barSub}</span></div>
      <button type="button" onClick={() => onSetup('claude')}>{COPY.barClaude}</button>
      <button type="button" className="quiet" onClick={() => onSetup('codex')}>{COPY.barChatgpt}</button>
    </div>
  );
}
