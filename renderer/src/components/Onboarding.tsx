// THE FIRST RUN, on the screen. The logic with no window in it is in
// ../onboarding.ts; this is the part that draws.
//
// Two halves, and they are different on purpose:
//
//   1. The three setup screens (welcome, folder, name) are a surface of their
//      own, over an app that has nothing in it yet. Corner to corner is hers.
//   2. The example task is NOT a screen. It is the real command bar, the real
//      compose card, the real In progress tab and the real reading pane, with
//      ONE ringed sentence beside whichever of them she is looking at. Her
//      whole complaint on 08-21 was a sentence floating in the middle of the
//      window with nothing holding it, so nothing here is positioned off the
//      window: every tether is measured off the app's own rectangle, live, and
//      re-measured when the window changes size.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ALSO, ANCHOR, BOUNDS, BREATHE_AFTER_MS, COACHED, COPY, FLOOR, FLOOR_OF, TEAM_TAB_NAMES, TEXT_MAX, TEXT_MIN, teamTab,
  HELD_EVENTS, LINE_H, SLAB_OF, TEXT_GAP, UNDER,
  anyAgents, clearOf, finishCard, forgetAgentsWhileLookingAgain,
  forgetFoldersWhileLookingAgain, keepSecondRead, keyName, keyToken, padFor,
  practising, pressAtWrongRow, pressCounts, readAgentsAgain, roomFor, strayClick,
  swallowPress, wrongPress,
  coach, nextStep, nextTab, recentFolders, ring, runOf, shortPath, stepBack,
  type AgentFile, type Coach, type FirstRun, type Rect, type RecentFolder, type Step,
} from '../onboarding';
import { type AgentFolder, type Project } from '../agent-import-card';
import { ImportAgents } from './ImportAgents';
import FolderPicker from './FolderPicker';
import { DEFAULT_SKIN, SKINS, WALK_PICTURE, walkSkin, type Look as LookId, type SkinChoice } from '../skins';
import { MatchMark } from './MatchMark';
import { PRACTICE_NAME, PRACTICE_ROWS, PRACTICE_TASK } from '../../../shared/first-run-practice.mjs';
import { ProductMark } from './ProductMark';
import { SidebarIcon } from './SidebarIcon';
import { NAME, Name } from '../../../shared/product-name.mjs';

/**
 * THE ONE PROJECT THE LAST CARD MAY FILE INTO.
 *
 *  HER OWN, AND ONLY IT. The practice project is still in the app's list at
 *  this point and is archived a moment later by `finishRun`, so offering to
 *  file her agents into it would be a row landing in an inbox about to be
 *  swept. One project also means the home-folder section states where its rows
 *  go without drawing a picker to change it.
 *
 *  AND IT IS NAMED FROM THE WALK WHEN THE APP HAS NOT CAUGHT UP. The last step
 *  begins and the card is drawn in the same frame; the app's product list is a
 *  poll behind. MEASURED driving the real walk with this returning a filtered
 *  empty list: the card said "Make a project and they have an inbox" over a
 *  project she had made four screens earlier, and door one filed her folder
 *  agents while quietly dropping her home folder set, because that set's inbox
 *  is this project and there was no project to name. The walk made it and still
 *  holds its name and its folder, so it can say so before the list agrees. */
function walkProject(products: Project[], run: FirstRun): Project[] {
  const mine = products.filter((p) => p.slug === run.product);
  if (mine.length || !run.product) return mine;
  return [{ slug: run.product, name: run.name, repoPath: run.folder }];
}

/** THE FOLDER GLYPH, the same one the setup card draws. */
function FolderGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** The folder screen's last row, which opens the Mac chooser. */
function PlusGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** The folder screen's way past, for somebody with no folder. */
function SkipGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
    </svg>
  );
}

/**
 * THE TICK on a kept agent. Drawn rather than typed, because a check written
 *  as a character is a different size in every font a Mac decides to use. */
function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

/**
 * THE QUIET WAY OUT.
 *
 *  So the rule is `practising`: the eleven beats the practice band is up for,
 *  from making the first task to ⌘K. The welcome, the folder, the name, the
 *  look and the three introduction slabs have none, and neither does the finish
 *  card, which is one press from the end with the confetti already falling.
 *  `hand` is the door into the practice round and it has none either: it is one
 *  press from `make`, so nobody is ever more than one press away from it.
 *
 * AND IT SITS IN THE PRACTICE STRIP, NOT IN THE CORNER OF THE APP. It was 22px
 * from the bottom right corner of the window, which during the tutorial is the
 * corner the reading pane's reply box and the app's own footer are in. The band
 * is a 38px strip the app is pushed down by, so nothing of hers is ever under
 * it, and the capsule in the middle of it is the only other thing in there.
 *
 *  ONE DIM WORD, WITH NO KEY ON IT. A cap would make it the thing to press, and
 *  every card in this walk is trying to be the thing to press. There is no
 *  keyboard route INTO it on purpose — and, since 2026-08-28, a keyboard route
 *  back OUT of the card it opens, which is a different thing and is below.
 *
 *  AND IT IS NOT SHOWN WHEN LEAVING WOULD DO NOTHING. Without Claude Code the
 *  app holds the inbox shut, so skipping the walk lands on the same held
 *  screen; a way out that does not let anybody out is worse than none.
 *
 * ---------------------------------------------------------------------------
 * WHAT MARGARETTE FOUND
 *
 * She is not an engineer and she was the first person outside the building to
 * walk this.
 *
 *  FOUR THINGS WERE HOLDING HER IN, and only the first is the one that made the
 *  card never appear. All four are fixed here or beside here.
 *
 *    1. The press never reached the page. The practice strip is a native drag
 *       region and the button sat inside it; the whole story is on
 *       `PracticeBand` below, and the fix is that the strip's drag lane now
 *       stops short of this button.
 *    2. Escape did nothing. Nothing listened for it. She said the word out loud
 *       and pressed the key. It closes the card now, and closing the card is
 *       all it does: Escape is how a dialog is dismissed everywhere on this
 *       machine, so it may not be a second way of leaving the walk.
 *    3. The card opened on "Keep going", focused, first, and drawn. Somebody
 *       who has just pressed Skip has already answered the question. The card
 *       stays — the founder settled on 2026-08-25 that skipping should be
 *       possible and low-key, and a walk that vanishes on one stray press is
 *       worse — but it opens on the door out. "Keep going" is still right
 *       there, one Tab or one click away, and is now the quiet one.
 *    4. Return did nothing either, which is worse than either button being
 *       wrong. The coaching card installs a capture-phase keydown listener that
 *       eats every cap the beat did not ask for, and Return on the `make` beat
 *       is a wrong cap, so `preventDefault` cancelled the focused button's own
 *       activation. That is fixed one file over, in `pressCounts`: a press
 *       inside this card is a press at THIS card and never at the walk.
 *
 *  The listener here is CAPTURE PHASE and it stops the event dead, for the same
 *  reason: Escape reaches App.tsx's own handlers as well, and the walk must not
 *  close a task or a palette on the way to closing this card. */
export function WayOut({ run, blocked, onLeave }: {
  run: { step: Step; practice: string | null } | null;
  /** Claude Code is missing, so there is nothing to be let out into. */
  blocked?: boolean;
  onLeave: () => void;
}) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return undefined;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setAsking(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [asking]);
  if (blocked || !practising(run)) return null;
  return (
    <>
      <button type="button" className="fr-out" onClick={() => setAsking(true)}>
        {COPY.leave}
      </button>
      {asking && (
        <div className="fr-stay-scrim" role="dialog" aria-modal="true" aria-label={COPY.leaveHead}>
          <div className="fr-stay">
            <div className="fr-stay-head">{COPY.leaveHead}</div>
            <div className="fr-stay-line">{COPY.leaveLine}</div>
            <div className="fr-stay-row">
              {/* THE ONE THAT LEAVES IS FIRST AND IT IS FOCUSED, because she
                  pressed Skip. It was the other way round until a tester,
                  and the argument for that arrangement was that the friendly
                  shape of this card is one that recommends by drawing rather
                  than by telling anybody off. The drawing is still how it
                  recommends; what changed is WHICH one it recommends, and the
                  answer to that is not the walk's to have. She said what she
                  wanted before the card was ever on the screen.

                  IT IS STILL NOT A SHOVE OUT OF THE DOOR. Nothing here got
                  louder: the same two words, the same outline, the same quiet
                  second button, no colour and no alarm. "Keep going" is one
                  Tab away and is the card's whole reason for existing. */}
              <button type="button" className="fr-stay-go" autoFocus onClick={onLeave}>
                {COPY.leaveGo}
              </button>
              <button type="button" className="fr-stay-keep" onClick={() => setAsking(false)}>
                {COPY.leaveStay}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* * THE DOTS ARE GONE, AND THEY ARE NOT COMING BACK. Nineteen small marks used to sit across
 the foot of every screen in this walk, counting the beat.

   a tester asked the same question out loud on her onboarding call on 08-24
   ("what are the little dots at the bottom?"), and the answer built for that
   row was a hover and an accessible name saying which step of how many. Two
   people not understanding a thing is not a labelling problem, so the mark
   itself is off the screen rather than explained.

   `BEAT` and `N_BEATS` in ../onboarding stay, because the walk still has an
   order and the tests still hold it to that order. NOTHING DRAWS THEM.

   `DOTS_BOTTOM` and `dotsBottom` went with the component. They existed to lift
   the row of dots off the reply box on the one beat that draws one, and there
   is no row to lift any more.
*/

/**
 * THE THING, NOT ITS BOX. `.focus-actions` is a flex row as wide as the whole
 *  text column, so a ring drawn round it is a ring round nothing: that is the
 *  365 pixel miss the elbow had. An element that carries its own words IS the
 *  thing and is measured whole. An element that only holds other elements is a
 *  box, and what gets measured is the run of what is inside it. */
function anchorOf(el: Element): Rect | null {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const box = { x: r.left, y: r.top, w: r.width, h: r.height };
  const ownWords = [...el.childNodes].some(
    (n) => n.nodeType === 3 && (n.nodeValue ?? '').trim() !== '',
  );
  if (ownWords) return box;
  // The measuring itself is in ../onboarding.ts, so it can be tested against
  // the real rectangles rather than eyeballed in a window.
  return runOf(box, [...el.children].map((k) => {
    const b = k.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, position: getComputedStyle(k).position };
  }));
}

/**
 * WHAT IS BESIDE THE THING. The ring grows with what it rings, and beside a
 *  button in a row of buttons there is nowhere to grow into: measured on the
 *  built walk, "close this task" and "esc back" are 10px apart. So its
 *  neighbours are measured the same way the thing itself is, off the run of
 *  their real children rather than off the flex box round them, and the pad
 *  stops halfway. Anything positioned out of flow is furniture and is skipped,
 *  which is the same rule runOf already uses. */
function neighboursOf(el: Element): Rect[] {
  const parent = el.parentElement;
  if (!parent) return [];
  return [...parent.children]
    .filter((k) => k !== el && getComputedStyle(k).position === 'static')
    .map((k) => anchorOf(k))
    .filter((r): r is Rect => r !== null);
}

/**
 * IS THERE ALREADY INK HERE. Everything on this screen is inside something, so
 *  "is an element under this point" answers yes everywhere and is useless. What
 *  matters is whether the point lands on WORDS, so this walks the stack under it
 *  and takes the first element carrying text of its own. The walk itself, its
 *  ring and its way out do not count, and neither does the thing being pointed
 *  at:
 *  a sentence is allowed to sit under the row it is about. */
function inkAt(x: number, y: number, mine: Element | null): DOMRect | null {
  const stack = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(x, y)
    : [document.elementFromPoint(x, y)].filter(Boolean) as Element[];
  for (const el of stack) {
    if (el.closest('.fr-tether, .fr-ring, .fr-out')) continue;
    if (mine && (el === mine || mine.contains(el) || el.contains(mine))) continue;
    const words = [...el.childNodes].some(
      (n) => n.nodeType === 3 && (n.nodeValue ?? '').trim() !== '',
    );
    if (words) return el.getBoundingClientRect();
  }
  return null;
}

/**
 * THE SOFT RING. Hers out of six shapes, 08-21. A ring round the thing itself,
 * the sentence directly under it on the thing own left edge, and no line
 * anywhere: there is nothing to route, so the pointing cannot go wrong, and it
 * looks the same in a small window as in a large one. The glow on the sentence
 * is hers in the same breath, and it is deliberately slight. */
/**
 * THE FIRST SELECTOR THAT MATCHES, IN THE ORDER GIVEN. Measured on,
 * 2026-08-21. */
function firstOf(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * ONE KEY CAP, WITH ITS NAME ON IT WHEN THE GLYPH DOES NOT SAY ITS OWN NAME.
 *
 *  THE NAME GOES INSIDE THE CAP, not beside it. A word next to a bordered box
 *  is two things to read and invites the question of whether the word is part
 *  of the sentence; a word inside the border is the key, drawn the way the key
 *  is labelled on the keyboard she is looking at. It is also why this is one
 *  component rather than a second way of drawing a key: every cap in the walk
 *  goes through here, so a cap can never appear with the name and without it on
 *  two screens of the same walk.
 *
 *  WHICH CAPS GET A NAME IS `keyName` IN onboarding.ts and the reasoning is
 *  written out there. In short: ⇥ and ↵, and nothing with a letter on it. */
export function Cap({ cap, className }: { cap: string; className?: string }) {
  const name = keyName(cap);
  return (
    <kbd className={className}>
      {cap}
      {name ? <span className="fr-cap-word">{name}</span> : null}
    </kbd>
  );
}

/**
 * THE CARD ITSELF. Two lines, and the key in the loud one is drawn as a key.
 * the accompanying text was "the biggest weakness", so the quiet line says
 * where you are and the loud line says the one thing to press, and neither has
 * to do the other's job. */
function Card({ say, beat, pointed, knock = 0 }: {
  say: Coach;
  /**
   * HOW MANY STRAY CLICKS THE WALK HAS ANSWERED ON THIS BEAT, from `Ringed`.
   *  It rides into the same counter a wrong KEY bumps, so the cap answers a
   *  click on the wrong thing with the one gesture it already has for pressing
   *  the wrong thing. Two rules that feel like two rules is what the founder
   *  asked us not to build; there is one answer here and it is hers. */
  knock?: number;
  /**
   * THE ROWS THIS BEAT'S KEY IS RIGHT FOR, and the row the keys would land on.
   *  The right key aimed at a row the beat is not about is answered exactly as a
   *  wrong key is, and for the reason `pressAtWrongRow` gives: the alternative
   *  is the app printing a second instruction under a card that is still giving
   *  the first one, which is what she photographed on 2026-08-27. */
  beat?: string[];
  pointed?: string | null;
}) {
  // HER TWO NOTES ON THE FEEL, BUILT RATHER THAN DESCRIBED (2026-08-23).
  // A wrong press pulses the cap and never shakes it; a cap nobody has touched
  // starts breathing after four seconds. `onboarding.ts` holds the rules and
  // the reasons.
  const [wrong, setWrong] = useState(0);
  const [breathe, setBreathe] = useState(false);
  // WHERE THE KEYS WOULD LAND, READ AT THE MOMENT OF THE PRESS. A ref rather
  // than a dependency: the pointed row changes every time the mouse crosses a
  // row, and re-registering the listener on each of those would restart the
  // breathing clock at somebody who is standing still.
  const aim = useRef<{ beat: string[]; pointed: string | null }>({ beat: [], pointed: null });
  aim.current = { beat: beat ?? [], pointed: pointed ?? null };
  useEffect(() => {
    setWrong(0);
    setBreathe(false);
    if (!say.key) return;
    let live = true;
    // THE CLOCK RESTARTS ON EVERY PRESS, right or wrong. Somebody pressing
    // things is somebody who has found the cap, and breathing at them is the
    // walk nagging.
    let idle = setTimeout(() => { if (live) setBreathe(true); }, BREATHE_AFTER_MS);
    const on = (e: KeyboardEvent) => {
      if (!pressCounts(e.target)) return;
      if (keyToken(e) === null) return;
      setBreathe(false);
      clearTimeout(idle);
      idle = setTimeout(() => { if (live) setBreathe(true); }, BREATHE_AFTER_MS);
      // A WRONG PRESS IS ANSWERED AND THEN STOPPED.This used to pulse the cap
      // and then hand the press to the app exactly as it would have had it,
      // which is how one stray E closed a real row and took the lesson with it.
      //
      // ON THE WAY DOWN, NOT ON THE WAY UP. The listener is in the capture
      // phase, so it runs before the app's own window handlers no matter which
      // order the two were registered in, and `stopImmediatePropagation` stops
      // the ones sharing this window with it. `swallowPress` decides; the rule
      // and everything it deliberately lets through are in `onboarding.ts`. AND
      // THE RIGHT KEY ON THE WRONG ROW IS THE SAME ANSWER. E is the key this
      // beat asks for, so `wrongPress` below says nothing about it and the
      // press used to go through to the app, where `closingRefused` stopped it
      // and printed a sentence in a toast. The card was still saying press E at
      // the time.
      //
      // Same treatment as her wrong key, so there is one instruction on the
      // screen and never two: the press does not reach the app, the cap pulses,
      // and the ring stays on the row the beat is about.
      if (keyToken(e) === say.key && pressAtWrongRow(aim.current.beat, aim.current.pointed)) {
        setWrong((n) => n + 1);
        if (pressCounts(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (!wrongPress(say.key, e)) return;
      setWrong((n) => n + 1);
      if (swallowPress(say.key, e, e.target)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', on, true);
    return () => { live = false; clearTimeout(idle); window.removeEventListener('keydown', on, true); };
  }, [say.key]);
  // The count is the key on the element, so two wrong presses in a row really
  // are two pulses: a class toggled off and on again inside one frame is a
  // class React never draws.
  //
  // A WRONG KEY AND A STRAY CLICK COUNT INTO THE SAME NUMBER, which is what
  // makes them one answer rather than two.
  const pulse = wrong + knock;
  return (
    <>
      {/* AND A BEAT MAY HAVE NO GREY LINE AT ALL (w-45e9cd9573, 2026-08-28). Three beats say
         nothing here now, so the span is not drawn rather than drawn empty: an empty one is
         still a 21px block above the instruction, which reads as a card that lost a
         sentence.
       */}
      {say.quiet ? <span className="fr-quiet">{say.quiet}</span> : null}
      <span className={say.quiet ? 'fr-loud' : 'fr-loud fr-alone'}>
        {say.lead}
        {say.key && (
          <Cap
            key={pulse}
            cap={say.key}
            className={`${pulse ? 'fr-wrong' : ''}${breathe ? ' fr-breathe' : ''}`.trim() || undefined}
          />
        )}
        {say.tail}
      </span>
      {/* AND NOTHING UNDER THE LIGHTS ANY MORE. There was a third line here, a `why` under a
         hairline rule, and it is gone from every beat of the walk (w-9a6ea066d6,
         2026-08-28). What each of the four `why` lines said is folded into the two that
         remain; `coach` in onboarding.ts names them one by one.
       */}
      {say.caps && say.key ? <Lights of={say.caps} cap={say.key} left={beat?.length} /> : null}
    </>
  );
}

/**
 * THE LIGHTS.
 *
 *  WHAT FILLS THEM IS THE APP, NOT A COUNTER OF KEY PRESSES. The beat is over
 *  when three rows have gone, so the lights count the rows that are left rather
 *  than the times somebody hit E. A press that closed nothing, an E typed into
 *  a field, a row closed with the mouse instead: all three would put a counter
 *  out of step with the screen, and a progress bar that disagrees with what is
 *  in front of you is worse than none.
 *
 *  AND IT COUNTS THE BEAT'S OWN ROWS, NOT EVERY ROW ON THE SCREEN. This read
 *  `document.querySelectorAll('.list-pane .row').length` and subtracted it from
 *  the number of lights, which is right only while the list holds exactly the
 *  rows this beat is about. It has not held that since the snooze row went in
 *  on 2026-08-24: the clearing beat draws TWO lights over FOUR rows, so `2 - 4`
 *  is negative, the floor at zero catches it, and neither light has ever filled
 *  in on anybody's walk. MEASURED 2026-08-27: four rows nothing lit, three rows
 *  nothing lit, two rows nothing lit. The shot in the harness called
 *  "the first light filled in" is a photograph of two empty keys.
 *
 *  `left` is `beat.length` from the app, which is the finished rows still in
 *  the drawn inbox. So this is still the app being read rather than a tally of
 *  key presses, which is the part that matters and the reason for the paragraph
 *  above; it is just being read off the right rows. The DOM count stays as the
 *  fallback for a caller that names no rows.
 *
 *  It reads the list on the same 200ms beat `Ringed` re-measures on, for the
 *  same reason: nothing tells this component that a row went.
 *
 *  AND THESE CAPS ARE NOT NAMED, unlike the one in the line above them. A light
 *  is a counter, not an instruction: the line has already said which key and,
 *  where the glyph needed it, what the key is called (`Cap`, and `keyName` in
 *  onboarding.ts). Printing the name twice on the same card would widen a row
 *  of two boxes into a row of two sentences, on the one beat the founder
 *  already told us carries too much text. The only beat with lights is `clear`,
 *  whose cap is E, which has no name in the map anyway. */
function Lights({ of, cap, left: given }: { of: number; cap: string; left?: number }) {
  const [seen, setSeen] = useState(of);
  useEffect(() => {
    if (given !== undefined) return;
    const read = () => setSeen(document.querySelectorAll('.list-pane .row').length);
    read();
    const t = setInterval(read, 200);
    return () => clearInterval(t);
  }, [given]);
  const left = given ?? seen;
  const lit = Math.max(0, Math.min(of, of - left));
  return (
    // DOTS, NOT KEYS (2026-10-01). Two more E caps under "Press E to close it"
    // showed a persona test "E E", two keys where one was meant. A dot is a count
    // and nothing else; the key is already named once on the line above.
    <span className="fr-lights" aria-hidden="true" data-key={cap}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < lit ? 'fr-dot fr-lit' : 'fr-dot'} />
      ))}
    </span>
  );
}

/**
 * WHERE THE CARD SETTLES. Her first complaint about it was never the ring, it
 *  was "they're sometimes touching the borders of their tasks", so after the
 *  card is placed it is pushed down off anything the app drew with a border of
 *  its own until it clears by FLOOR. Measured in the window rather than
 *  guessed, because the thing it has to clear is whatever she has on screen. */
/**
 * AND THE OTHER WAY, WHEN THE CARD RUNS OFF THE BOTTOM OF THE WINDOW.
 *
 *  `ring` decides whether the card goes under the thing or over it by asking
 *  whether TWO LINES fit below (`LINE_H * 2 + 16 <= view.h`), and that estimate
 *  is the whole of it. Most beats really are two lines and it has been right
 *  since the walk was built. Beat thirteen's second half is not: it carries a
 *  quiet line, a lead line and a `why` under a rule, five lines all told, and
 *  the thing it points at is the strip of options on the floor of the reading
 *  pane. Photographed on 2026-08-24 at 1752x986: the ring finished at 904, the
 *  card started at 922 with 64px of room, and the sentence printed at 1113 with
 *  the bottom half of it off the screen.
 *
 *  MEASURED, NOT ESTIMATED AGAIN. A second guess at how tall a card is going to
 *  be would be the same bug with a better number in it. This runs after the
 *  card is really on the screen, reads its real height, and lifts it by exactly
 *  what hangs over. Nothing moves on any beat that already fits, which is every
 *  beat that was ever shot before this one. */
/*
 * AND THE SECOND WAY A CARD OVERHANGS IS ONTO THE THING IT IS ABOUT. `ring`
 * places the sentence above rather than below when two lines will not fit
 * under the thing, and it reserves exactly ONE line of room up there (`ty = y
 * - TEXT_GAP - LINE_H`). That is the same estimate the paragraph above says
 * never to make twice: a card is a quiet line and a loud line and its own
 * padding, so one line of room leaves the bottom of it on top of whatever the
 * ring is round.
 *
 *  MEASURED on the beat that teaches how a task ends, the first beat ever to
 *  flip above, at 1752x986: the ring on the reply box ran 885 to 955, the card
 *  started at 845, and its bottom printed 27 points inside the box the same
 *  sentence invites her to type in. The rig prints that overlap as `overDock`
 *  and it is the number this clears.
 *
 *  So the same measurement the window overhang gets: read the card's real
 *  height once it is on the screen, and take whichever of the two overhangs is
 *  worse. A beat whose card sits under its ring is untouched, which is every
 *  beat but one. */
function lift(card: HTMLElement | null, geo: { ring: { y: number }; below: boolean } | null = null): number {
  if (!card) return 0;
  card.style.removeProperty('--fr-lift');
  const box = card.getBoundingClientRect();
  const off = Math.round(box.bottom - window.innerHeight + FLOOR);
  const onto = geo && !geo.below ? Math.round(box.bottom - (geo.ring.y - TEXT_GAP)) : 0;
  const over = Math.max(off, onto);
  if (over <= 0) return 0;
  // Never off the top instead: a card that has nowhere to go stays where it is
  // and loses its bottom, which is at least the half with the key in it.
  const up = Math.min(over, Math.max(0, box.top - FLOOR));
  if (up <= 0) return 0;
  card.style.setProperty('--fr-lift', `${-up}px`);
  return up;
}

/* * ------------------- THE LIST OPENS A GAP FOR THE CARD ---------------------
 w-45e9cd9573, 2026-08-28.

   WHAT WAS MEASURED, on the built walk at 1752x986, as the distance from the
   edge of the ring to the edge of the card:

     eighteen beats     18px
     the note           99px
     the snooze beat   107px
     the second close  182px
     the first close   256px

   Eighteen is the design. 256 is a card sitting under four rows saying "This
   one is finished", with the ring on the first row and three other rows in
   between, each of them a candidate for "this one". The card was nearer the
   rows it did NOT mean than the one it did.

   WHY IT HAPPENED, and the old fix was right about the problem. `UNDER` drops
   the card below the whole stack, because a card hung 18px under the first of
   four rows prints across the second and third: "two of the three tasks she was
   being told to clear sat behind the words telling her to clear them". So the
   choice was cover a row or leave the ring behind, and it took the second.

   THIS IS THE THIRD OPTION AND IT COSTS NOTHING. The rows under the ringed one
   slide down by exactly the height of the card, the card sits in the gap they
   left, 18px under its own ring, and nothing is covered. It is the app making
   room for the sentence rather than the sentence going to find room, which is
   what "the user stays in flow" asks for: the eye never leaves the row it is
   being told about.

   The rows move, they do not disappear, and they come straight back when the
   beat does. `clearRoom` runs on every placement and on unmount, so a beat that
   ends leaves no attribute and no variable behind.
*/

function clearRoom(): void {
  for (const el of document.querySelectorAll('[data-fr-room]')) el.removeAttribute('data-fr-room');
  const pane = document.querySelector('.list-pane') as HTMLElement | null;
  pane?.style.removeProperty('--fr-room');
}

/* `makeRoom`, which slid the rows under the ringed one down by the card's
   height, is deleted (w-ec62ab6b38). The card floats over the list now; see
   the comment where it was called. `clearRoom` above stays so a list left
   shifted by an older build is put back. */

/**
 * WHERE A CARD THAT SITS BESIDE ITS RING STARTS. The right edge of the tab
 *  strip, or of the ring if the strip is somehow not drawn, plus a gap. Read
 *  off the strip rather than off the ring so the card holds one position
 *  across all three of the beat's presses. */
/*
 * THE BAR IT STANDS OFF IS A PARAMETER, AND THE TAB TOUR IS THE ONLY CALLER
    LEFT (w-175e109e7c, 2026-09-01). It became a parameter on 2026-08-28 for the
    beat that teaches how a task ends, which had the tab tour's shape: a ring on
    one control in a row of them, where hanging the card off that one control
    prints it over its neighbour.

    That beat no longer stands beside anything. The row of buttons it was about
    was taken out of the reading pane on 2026-08-27, so its ring is the reply box
    now and its card goes above rather than beside. The argument stays because
    the next beat that needs it will need it for the same reason, and the tabs
    stay the default because they are what is asking today. */
function besideLeft(geo: { ring: { x: number; w: number } }, sel = '.tabs'): number {
  const all = [...document.querySelectorAll(sel)];
  const bar = all.length ? all[all.length - 1].getBoundingClientRect().right : 0;
  return Math.round(Math.max(geo.ring.x + geo.ring.w + 10, bar) + 26);
}

function settle(card: HTMLElement | null): number {
  if (!card) return 0;
  card.style.removeProperty('--fr-drop');
  const gap = () => {
    const b = card.getBoundingClientRect();
    let d: number | null = null;
    for (const el of document.querySelectorAll(FLOOR_OF)) {
      const e = el.getBoundingClientRect();
      if (e.width < 8 || e.height < 8) continue;
      if (!(b.left < e.right && b.right > e.left)) continue;
      const g = Math.round(b.top - e.bottom);
      if (g >= -40 && g < 200 && (d === null || g < d)) d = g;
    }
    return d;
  };
  const before = gap();
  if (before === null || before >= FLOOR) return 0;
  const drop = FLOOR - before;
  card.style.setProperty('--fr-drop', `${drop}px`);
  return drop;
}

/**
 * THE VEIL, WITH ITS HOLE ON THE RING.
 *
 *  The hole is a mask rather than a cut, so its edge is a fade and not a
 *  rectangle: a hard-edged spotlight is the shape every other product's tour
 *  uses and it is what her design law calls a dense screen.
 *
 *  AN ELLIPSE ROUND THE RING, NOT A CIRCLE ON ITS LONGEST SIDE. A row in the
 *  list is about a thousand pixels wide, so a circle big enough to clear it is
 *  bigger than the window and nothing is dimmed at all. */
/*
 * AND IT IS WHAT THE WALK ANSWERS A STRAY CLICK WITH. a tester clicked into
 * other agents' conversations while the card told her what to press, and the
 * founder's answer is that the walk should not let her. A click that does
 * nothing AT ALL is a dead app, so the refusal has to say something, and the
 * one thing worth saying is where to look: for 620ms — WRONG_MS, the same half
 * second a wrong key gets — the veil deepens, so everything she reached for
 * goes quiet and the one thing she is meant to press does not.
 *  the wrong thing — everything else recedes from it instead. */
function Veil({ box, knocked = '' }: {
  box: { x: number; y: number; w: number; h: number } | null;
  /**
   * ' fr-knock' while the walk is answering a stray click, and empty the rest
   *  of the time. It arrives as the class rather than as a count because the
   *  caller keys this component on the same count, and one number cannot be
   *  read two ways in one place without somebody later reading it the wrong
   *  one. */
  knocked?: string;
}) {
  if (!box) return <div className={`fr-veil${knocked}`} aria-hidden="true" />;
  const cx = Math.round(box.x + box.w / 2), cy = Math.round(box.y + box.h / 2);
  const rx = Math.round(box.w / 2 + 26), ry = Math.round(box.h / 2 + 26);
  const mask = `radial-gradient(${rx + 150}px ${ry + 150}px at ${cx}px ${cy}px,`
    + ` rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${Math.round((100 * rx) / (rx + 150))}%, rgba(0,0,0,1) 100%)`;
  return (
    <div
      className={`fr-veil${knocked}`}
      style={{ WebkitMaskImage: mask, maskImage: mask } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

/*
 * AND ONE BEAT PUTS THE CARD BESIDE THE RING RATHER THAN UNDER IT.
   Everything the walk points at until the last beat sits in the middle of the
   window with room under it, so hanging the card off the bottom of the ring has
   always been right. The tab strip is not like that: it is the top inch of the
   window and what is directly under it is the list, so a card hung under a tab
   lands on the rows.

   PHOTOGRAPHED BEFORE IT WAS FIXED (2026-08-24, 1752x986): on the In progress
   tab the card printed over the one row it was talking about, "Delete 340 lines
   of dead code?", and on Closed it covered the first of the three. A card
   describing something it is standing on top of is the fault this whole round
   is about, so it cannot ship on the beat that fixes it.

   `settle` does not catch this and should not be widened to. It exists for a
   card resting just BELOW a row and touching it, and its window is a gap of
   -40 to 200; a card fully over a row measures -192 and is skipped on purpose,
   because a general "push it clear" rule would push this one further into the
   list rather than out of it.

   So the card goes to the right of the ring, vertically centred on it, out in
   the empty half of the strip the tabs live in. */
/** How long a beat may have nothing to point at before its card is printed anyway. */
const ADRIFT_MS = 900;

/** The top of the list, under the team layout's tabs when they are drawn. */
function adriftAt(): { x: number; y: number; w: number } {
  const pane = document.querySelector('.list-pane') ?? document.querySelector('.body');
  const r = pane ? pane.getBoundingClientRect() : null;
  const bar = document.querySelector('.th-bar');
  const top = bar ? bar.getBoundingClientRect().bottom + 28 : (r && r.height > 0 ? r.top + 48 : 120);
  const left = r && r.width > 0 ? r.left + 40 : 80;
  const right = r && r.width > 0 ? r.right : window.innerWidth;
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(Math.max(TEXT_MIN, Math.min(TEXT_MAX + 120, right - left - 40))),
  };
}

function Ringed({
  selector, boundsSel, underSel, makesRoom, say, beside, besideRing, besideOf, beat, pointed,
  hold, also,
}: {
  selector: string[]; boundsSel?: string; underSel?: string; say: Coach;
  /**
   * THE LIST OPENS A GAP RATHER THAN THE CARD LEAVING ITS RING. See
   *  `makeRoom` above for the measurements. This is set on the beats that ring
   *  one row out of a stack, and it REPLACES `underSel` on them: a beat cannot
   *  do both, because dropping the card below rows that have just moved down
   *  chases them down the window. */
  makesRoom?: boolean;
  beside?: boolean;
  /**
   * Stand the card off the RING rather than off the tab strip. Only the last
   *  beat wants this; see the note beside `left` below. */
  besideRing?: boolean;
  /** WHICH ROW OF CONTROLS TO CLEAR, when it is not the tabs. See `besideLeft`. */
  besideOf?: string;
  /*
   * Passed straight through to the card, which is where the press is answered.
     See `Card` and `pressAtWrongRow`. */
  beat?: string[]; pointed?: string | null;
  /**
   * WHETHER THE APP IS HELD TO THIS BEAT, which is `practising` and nothing
   *  else: the eleven beats the practice band is up for. The setup screens, the
   *  look picker, the introduction slabs and the finish card are not the app
   *  and have nothing to wander into. */
  hold?: boolean;
  /** The second thing this beat is about, when its card names one. `ALSO`. */
  also?: string[];
}) {
  const [geo, setGeo] = useState<ReturnType<typeof ring> | null>(null);
  // WHERE THE CARD GOES WHEN THE THING IT POINTS AT IS NOT ON THE SCREEN.
  const [adrift, setAdrift] = useState<{ x: number; y: number; w: number } | null>(null);
  const lostAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLParagraphElement>(null);
  // HOW MANY STRAY CLICKS THIS BEAT HAS ANSWERED. It is a count rather than a
  // flag for the reason the cap's own count is: the class comes off with the
  // element, so two clicks in a row really are two answers, where a class
  // toggled off and on inside one frame is a class React never draws.
  const [knock, setKnock] = useState(0);
  useEffect(() => { setKnock(0); }, [selector.join('|')]);

  useLayoutEffect(() => {
    let live = true;
    /* A BEAT WITH NOTHING TO POINT AT STILL SAYS WHAT TO DO (2026-10-01).
       This returned nothing, and a persona test on the team build sat on a
       blank inbox for over thirty seconds after "Start the tutorial", because
       the first beat's button was drawn under a name this list did not know.
       So after a short grace, long enough for the render between two beats,
       the card is printed with no ring at the top of the list. It stays quiet
       while something else is open over the app, which is the rule below. */
    const lost = () => {
      setGeo(null);
      if (document.querySelector('.modal-backdrop')) { lostAt.current = null; setAdrift(null); return; }
      const t = Date.now();
      if (lostAt.current === null) lostAt.current = t;
      if (t - lostAt.current >= ADRIFT_MS) setAdrift(adriftAt());
    };
    const measure = () => {
      if (!live) return;
      const el = firstOf(selector);
      if (!el) { lost(); return; }
      // AND NOT OVER WHATEVER SHE HAS OPENED ON TOP OF THE APP.The walk draws
      // at z-index 301, above the palette and the compose card, so a ring
      // round a row behind ⌘K cut across the palette and its sentence ran
      // underneath it. When something is open over the app the coaching line
      // draws only if the thing it is pointing at is INSIDE that thing, which
      // is the compose card step, and otherwise it waits. The walk has not
      // stopped, it is just not talking over her.
      const over = [...document.querySelectorAll(".modal-backdrop")];
      if (over.length && !over.some((o) => o.contains(el))) { lostAt.current = null; setAdrift(null); setGeo(null); return; }
      const box = anchorOf(el);
      if (!box) { lost(); return; }
      lostAt.current = null;
      setAdrift(null);
      const b = boundsSel ? document.querySelector(boundsSel) : null;
      const br = b ? b.getBoundingClientRect() : null;
      const view = { w: window.innerWidth, h: window.innerHeight };
      const room = roomFor(box, neighboursOf(el));
      const g = ring(box, { left: br ? br.left : 0, right: br ? br.right : view.w }, view, room);
      // A CARD UNDER A WIDE THING COVERS WHAT IS UNDER THE WIDE THING. On beat
      // nine the ring is on the first of three waiting rows and the card landed
      // squarely on the second and third, so two of the three tasks she was
      // being told to clear sat behind the words telling her to clear them.
      const under = underSel && !makesRoom ? document.querySelector(underSel) : null;
      if (under) g.text.y = Math.round(under.getBoundingClientRect().bottom + padFor(box) + TEXT_GAP);
      // AND THEN LOOK WHETHER ANYTHING IS ALREADY THERE. Three points across the
      // first line, because one point in the middle of a line misses a title
      // that stops short of it. Four tries, so a stack of rows is walked rather
      // than only its first.
      //
      // A BEAT THAT OPENS A GAP DOES NOT ALSO RUN THIS, and that is not a
      // preference. The rows below the ring have moved down by the height of
      // the card; if the card then walked down off the ink it finds, the next
      // pass would move the rows again from the card's new place and the two
      // would chase each other down the window. The gap already guarantees
      // there is nothing under the card, which is the only thing this loop is
      // for.
      if (g.below && !under && !makesRoom) {
        for (let i = 0; i < 4; i += 1) {
          const xs = [g.text.x + 4, g.text.x + Math.min(g.text.w, 300) / 2, g.text.x + Math.min(g.text.w, 300) - 4];
          const hits = xs
            .map((x) => inkAt(x, g.text.y + LINE_H / 2, el))
            .filter(Boolean) as DOMRect[];
          if (!hits.length) break;
          const moved = clearOf(g.text.y, LINE_H, hits, view);
          if (moved === g.text.y) break;
          g.text.y = moved;
        }
      }
      setGeo(g);
      // AND THE GAP IS RE-OPENED ON EVERY PASS OF THIS LOOP, not only when this
      // component happens to render. It was in a layout effect for one build
      // and photographed: on the FIRST shot of the clearing beat the four rows
      // sat at 258, 333 and 408, exactly where they start, and on the next shot
      // of the SAME beat they were at 456, 531 and 605 with the gap fully open.
      // The rows arrive at that beat, so React builds new elements for them,
      // and an attribute this file put on the old element goes with it. The
      // mark has to be re-applied against whatever is on the screen now, which
      // is the same reason everything else here is measured on a loop rather
      // than remembered.
      // THE LIST NO LONGER MOVES (w-ec62ab6b38, 2026-09-28). The tutorial card
      // is an overlay, and opening a gap for it made it take up space and push
      // the list out of the way. So the card still sits just under the row it
      // names and floats over the rows below; `makeRoom` is never called.
      clearRoom();
    };
    measure();
    // The thing being pointed at moves: the compose card grows as she types,
    // the reading pane actions sit wherever the body ended. A frame loop is
    // the only honest way to stay on it, and it stops when the step does.
    const t = setInterval(measure, 200);
    window.addEventListener('resize', measure);
    return () => { live = false; clearInterval(t); window.removeEventListener('resize', measure); };
  }, [selector.join('|'), boundsSel, underSel, makesRoom]);

  // AND ONCE MORE THE MOMENT THE CARD IS REALLY ON THE SCREEN, so the first
  // frame of a beat does not wait up to 200ms for the loop above. Its depth is
  // the card's own height and nothing but the card knows that, which is why
  // this runs after the placement rather than inside it, the same as `lift`.
  useLayoutEffect(() => {
    clearRoom();
  });
  // AND THE GAP CLOSES WHEN THE WALK STOPS, whatever happened. Nothing in the
  // list is left transformed and no variable is left on the pane.
  useLayoutEffect(() => () => clearRoom(), []);

  // WHETHER THE RING IS ACTUALLY ON THE SCREEN, read at the moment of a click
  // rather than watched. A ref so the listener below is registered once per
  // beat: `geo` is re-measured every 200ms and a dependency on it would tear
  // the listener down and stand it up again five times a second.
  const drawn = useRef(false);
  drawn.current = !!geo;

  /* --------------- AND A CLICK IS HELD THE WAY A KEY IS ------------------ */
  /* CAPTURE PHASE, ON THE WINDOW.

     AND IT HOLDS NOTHING WHILE THERE IS NOTHING DRAWN TO POINT AT. `drawn` is
     false in the render between two beats and while something the beat is not
     about is open over the app. In that state the walk has no ring to send
     anybody back to, so a swallowed click would be a click that did nothing
     with nothing to look at, which is the dead app this is trying not to be.
  */
  useEffect(() => {
    if (!hold) return undefined;
    const on = (e: Event) => {
      if (!drawn.current) return;
      const live = [
        firstOf(selector),
        ...(also ?? []).flatMap((s) => [...document.querySelectorAll(s)]),
      ];
      if (!strayClick(e.target, live)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      // ONE PRESS OF THE MOUSE IS ONE ANSWER. All five events are the same
      // press arriving five times, so the walk answers on the last of them
      // that means "she pressed this", and stops the other four in silence.
      if (e.type === 'click') {
        e.preventDefault();
        setKnock((n) => n + 1);
      }
    };
    for (const t of HELD_EVENTS) window.addEventListener(t, on, true);
    return () => { for (const t of HELD_EVENTS) window.removeEventListener(t, on, true); };
  }, [hold, selector.join('|'), (also ?? []).join('|')]);

  // The floor is measured off the card once it is really on the screen, so it
  // runs after every placement rather than inside the one that made it.
  useLayoutEffect(() => { settle(cardRef.current); lift(cardRef.current, geo); });

  if (!geo) {
    if (!adrift) return null;
    return (
      <p
        ref={cardRef}
        className="fr-tether fr-adrift"
        style={{ left: adrift.x, top: adrift.y, maxWidth: adrift.w }}
        role="status"
      ><Card say={say} beat={beat} pointed={pointed} knock={knock} /></p>
    );
  }
  const pad = 10;
  // WHAT A STRAY CLICK IS ANSWERED WITH, and it is three parts of one gesture,
  // all of them 620ms and none of them a word: the veil deepens so what she
  // reached for goes quiet, the ring swells once so the thing to press does
  // not, and the cap pulses exactly as it does for a wrong key. No modal, no
  // sentence, no alarm colour — the walk says no in the language it already
  // has. The count is the element's key on both, so the second click really is
  // a second answer.
  const knocked = knock ? ' fr-knock' : '';
  return (
    <>
      <Veil key={knock} box={geo.ring} knocked={knocked} />
      <svg
        className="fr-ring"
        style={{ left: geo.ring.x - pad, top: geo.ring.y - pad }}
        width={geo.ring.w + pad * 2} height={geo.ring.h + pad * 2} aria-hidden="true"
      >
        <rect
          key={knock}
          className={`halo${knocked}`}
          x={pad} y={pad} width={geo.ring.w} height={geo.ring.h} rx={geo.ring.r}
        />
      </svg>
      {beside ? (
        // 18 clear of the ring's own halo, and centred on the ring rather than
        // aligned to its top, so a two-line card and a five-line one both sit
        // level with the tab and neither reaches the list. The half it is
        // centred by is in the class's transform, not here, because the drop
        // and the lift ride in that same transform.
        <p
          ref={cardRef}
          className="fr-tether beside"
          style={{
            // CLEAR OF THE WHOLE STRIP, NOT JUST OF THE RING. Ringing In
            // progress and hanging the card 18 off its own right edge printed
            // the card over Closed, which is the next tab the same beat is
            // about to send somebody to. Shot that way once.
            //
            // And clearing the strip has a second effect worth more than the
            // first: the card lands in the SAME PLACE all three times. Three
            // presses, one card that does not move, and only the ring travels.
            // AND THE LAST BEAT STANDS OFF ITS OWN RING INSTEAD OF OFF THE
            // STRIP. The palette is a panel in the middle of the window, not a
            // row of tabs along the top, so there is no strip to clear and the
            // rule above would drop the card on top of the commands.
            // Photographed that way once: the card covered the search field and
            // the first command in the list it was talking about. `besideRing`
            // puts it in the empty half of the window to the right of the
            // panel, where it covers nothing.
            left: besideRing ? Math.round(geo.ring.x + geo.ring.w + 26) : besideLeft(geo, besideOf),
            top: geo.ring.y + geo.ring.h / 2,
            maxWidth: besideRing
              ? Math.max(240, window.innerWidth - (geo.ring.x + geo.ring.w + 26) - 40)
              : Math.max(240, window.innerWidth - besideLeft(geo, besideOf) - 200),
          }}
          role="status"
        ><Card say={say} beat={beat} pointed={pointed} knock={knock} /></p>
      ) : (
        <p
          ref={cardRef}
          className={geo.text.right === null ? 'fr-tether' : 'fr-tether right'}
          style={geo.text.right === null
            ? { left: geo.text.x, top: geo.text.y, maxWidth: geo.text.w }
            : { right: geo.text.right, top: geo.text.y, maxWidth: geo.text.w }}
          role="status"
        ><Card say={say} beat={beat} pointed={pointed} knock={knock} /></p>
      )}
    </>
  );
}

/* * BEAT EIGHT'S SECOND HALF IS GONE, AND `Centred` WITH IT. It was the empty inbox held for
 four seconds under a card reading "This is inbox zero. Get back here every day.", the one
 beat with no ring because there was nothing left to point at.
*/


/* * --------------------------- THE LAST QUESTION -----------------------------
   THIS CARD IS THE AGENTS QUESTION AND NOTHING ELSE, SINCE 2026-08-24.

   What he read was a headline saying he was ready, a line about inbox zero, a
   rule, and then, four rows down, the only thing on it that wanted an answer.
   Nothing about it looked like a question, so he treated it as one of the
   hundred success pages he has pressed past this year, which is exactly what it
   was shaped like.

   So the celebration came off it and went where she asked for it: `Landed`
   below, over her own inbox, in her own project. What is left here is one
   question, and the first line of the card is that question.

   AND A MAC WITH NO AGENT FILES GETS NO CARD AT ALL. That is the same rule she
   set on 2026-08-23 — a screen offering an import to somebody with nothing to
   import is a screen that contradicts itself — read one step further along now
   that the celebration is not holding the card up on its own. `finishCard`
   answers `straightIn` and the walk ends itself.

 AND A MAC WITH NO AGENT FILES IS OFFERED NOTHING. There is no offer to draw when there is
 nothing behind it, so that state is not reworded here, it is gone: the card is the ending
 and nothing else.

 The button is a real button, and the return key ends it too.

 AND ON A MAC WITH NO CLAUDE CODE ON IT, THIS CARD IS NOT AN ENDING AT ALL.

   So the card has two shapes and `finishCard` in ../onboarding picks between
   them. The ending she approved is untouched and it is what almost everybody
   sees. The other one has no confetti, no headline about being ready, no
   agents to import and no way into the inbox: it names the one thing standing
   in the way, and its two buttons are get it and check again.
*/
/* * THE LAST CARD OF THE WALK, AND IT IS THE IMPORT CARD NOW (
   2026-08-27).

   She was right. Six rounds of this row rebuilt the agent import — two doors, a
   section per project, nothing ticked at open — and every one of them rebuilt
   the card ⌘K opens. This screen kept a second, older copy: one flat list under
   a two-sided switch, everything ticked, no way to reach a folder that was not
   already a project. The note at the top of ../agent-import-card.ts argued the
   walk's shape was right inside a setup, where there is one project and one
   folder. That argument is now overruled by the person it was written for, and
   it was wrong on its own terms anyway: the Mac she ran this on had four agents
   in her home folder and dev folders full of others that the walk's card could
   not see or offer.

   So this component keeps the three things that are the WALK's and hands the
   rest to <ImportAgents walk={...}>: the gate when Claude Code is missing, the
   straight-in when there is nothing to offer, and ending the walk.

   WHAT WENT WITH THE OLD MARKUP, and it is written down in decisions.md rather
   than only deleted: the `all`/`project` switch with its counts, the two empty
   sides (`agentsNoneAll`, `agentsNoneHere`), and everything-ticked-at-open. The
   new card opens with nothing ticked, which she approved on 08-26 and which is
   what makes one project one press.
*/
function Finished({
  found, folders, claude, products, project, onDone, onFiled, onProjectMade, onRecheck,
}: {
  found: { user: AgentFile[]; project: AgentFile[] } | null;
  /**
   * Every folder on this Mac with agents in it, read by the walk a beat early.
   *  Null while it is still reading. */
  folders: AgentFolder[] | null;
  /*
   * `kept` was here and it is deleted. It was the
     list of agents to file when the walk ended, it has been the shared empty
     array since the import card started filing its own, and the last thing
     reading it was a button this card no longer draws. */
  /**
   * Whether Claude Code is missing, and where to get it. `missing` is only
   *  ever true here after the whole search has run and come back sure, and this
   *  card is the only screen in the walk that reads it. Nothing less than
   *  certainty closes the gate: a Mac that shows any sign of Claude Code at all
   *  leaves this false and gets the ending. */
  claude: { missing: boolean; url: string };
  /**
   * HER OWN PROJECT, AND ONLY IT. The practice project is still in the app's
   *  list at this point — it is archived by `finishRun` a moment later — and a
   *  card offering to file her agents into "Wt 77df" is the same fault as the
   *  tutorial project's name on a screen headed "This is a practice project".
   *  One project also means the home-folder section states where its rows go
   *  without drawing a picker to change it. */
  products: { slug: string; name: string; repoPath: string | null }[];
  project: string | null;
  /** The way out with nothing brought in, and the end of the walk. */
  onDone: (chosen: string[]) => void;
  /**
   * The import card filed them itself, into however many inboxes, making the
   *  projects it needed. Nothing is left to file, so this ends the walk without
   *  a second import, and says whether anything landed so the confetti knows. */
  onFiled: (p: { added: number; already: number; inboxes: number; made: string[]; noun?: string }) => void;
  /** A project was made on the card. The app redraws its sidebar. */
  onProjectMade?: (slug: string) => void;
  /**
   * Look for Claude Code again, from scratch. Answers with whether it is
   *  still missing, so the card can say something different the second time. */
  onRecheck: () => Promise<boolean>;
}) {
  // WHAT COUNTS AS SOMETHING TO OFFER IS WIDER THAN IT WAS. It used to be her
  // home folder and this project's folder, which is all the old card could
  // draw. The new card reaches every folder on the Mac with agents in it, so a
  // Mac whose agents are all in ~/Desktop/dev/whatever now gets the offer
  // instead of being walked straight past it.
  const some = (!!found && anyAgents(found)) || !!folders?.some((f) => f.count > 0);
  const card = finishCard(claude, { read: found !== null && folders !== null, some });
  // The two things the gate needs to remember: whether a search is running
  // right now, and whether one has already come back empty.
  const [checking, setChecking] = useState(false);
  const [tried, setTried] = useState(false);
  const recheck = async () => {
    if (checking) return;
    setChecking(true);
    try { setTried(await onRecheck()); }
    finally { setChecking(false); }
  };
  // THE STRAIGHT-IN IS GONE. A Mac with no agent files used to end the walk
  // here with no card at all, and MEASURED on that Mac it meant the person with
  // no agents yet was never told Agentbox takes them. The card below is drawn on
  // every Mac now, and on an empty one it answers rather than offers. See
  // `finishCard` in ../onboarding.
  //
  // NOTHING AT ALL WHILE HER MAC IS STILL BEING READ. An empty veil over the app
  // for a frame would be a flicker on the way into her own inbox.
  if (!card.show) return null;

  // HER AGENTS, ON THE CARD SHE APPROVED, and it is the same component ⌘K
  // opens. Everything above this line is the walk's: the gate and the read.
  // Everything below it is the import, empty or full, and the import card owns
  // the keyboard while it is up — ⌘↵ is its first door, or the way on when there
  // is no door, and Escape steps back off its second screen.
  if (!card.blocked) {
    return (
      <>
        <Veil box={null} />
        <ImportAgents
          products={products}
          filter={project}
          walk={{
            line: COPY.agentsOffer,
            skip: COPY.finishGo,
            onSkip: () => onDone([]),
            folders,
          }}
          onDone={onFiled}
          onProjectMade={onProjectMade}
          // Neither can happen in here: she has a project, because she made one
          // four screens ago, and there is no closing a card that is a step of
          // the walk. Both are the component's ⌘K doors and both are dead ends
          // on purpose rather than by omission.
          onNewProject={() => {}}
          onClose={() => {}}
        />
      </>
    );
  }
  return (
    <>
      <Veil box={null} />
      <div className={card.blocked ? 'fr-finish gate' : 'fr-finish'} role="status">
        <h1 className="fr-finish-head">{card.head}</h1>
        {/* ONE LINE, AND IT IS THE ONE `finishCard` PICKED. The card used to fork here
           between two lessons about inbox zero; both of them are on the landing now, where
           they are true of what is behind them, and what is left is the sentence that says
           where these names came from.
         */}
        <p className="fr-finish-line">{card.line}</p>
        {/* HER AGENTS USED TO BE DRAWN HERE, under a two-sided switch, and they
            are on <ImportAgents> above now. See the note on this component. What
            is left below is the gate, which is the one state of this card that
            is about Claude Code rather than about agents. */}
        {/* THE WAY INTO THE INBOX IS NOT DRAWN HERE AT ALL, because this card is now only
           ever the gate.
         */}
        {/* AND WHEN IT IS BLOCKED, THE TWO REAL MOVES. Get it, which opens the
            install page, and check again, which really searches again: the
            remembered shell answer is thrown away first, so somebody who
            installs Claude Code and presses this straight away is answered by a
            search and not by a thirty second old memory (main/settings.mjs,
            `recheckClaude`).

            The line under them appears only after a press. Repeating the
            headline's own sentence at somebody who has just pressed a button
            reads as a screen that did not notice. */}
        {card.blocked && (
          <>
            <p className="fr-gate-do">{COPY.gateDo}</p>
            <div className="fr-gate-acts">
              <a
                className="fr-finish-go"
                href={claude.url}
                target="_blank"
                rel="noreferrer"
                autoFocus
              >{COPY.missingLink}</a>
              <button className="fr-gate-again" onClick={recheck} disabled={checking}>
                {checking ? COPY.gateChecking : COPY.gateCheck}
              </button>
            </div>
            {tried && !checking && <p className="fr-gate-still">{COPY.gateStill}</p>}
          </>
        )}
      </div>
    </>
  );
}

/**
 * THE PRACTICE BAND. It is on the screen for every second the practice
 *  project is, and it is the whole of what tells somebody the app in front of
 *  them is not theirs yet.
 *
 * This draws nothing over the app at all: the app is full size and real, and
 * one strip sits above it saying whose it is.
 *
 *  WHY IT HAS TO BE SAID AT ALL is a tester, on a call: they saw a real task on a
 *  real screen and read it as work, then tried to answer the placeholder text.
 *
 *  It is rendered beside the walk rather than inside it because it belongs to
 *  the PROJECT and not to the step: it has to be there through six beats and
 *  through everything those beats open. */
/* * ----------------------- LANDING IN HER OWN PROJECT ------------------------

 This is the end of the walk and it is the first second of the app. The practice project has
 just been archived, the agents she kept have just been filed, and what is on the screen
 behind these words is her own inbox in her own project.

   NOTHING HAS TO BE PRESSED TO GET PAST IT, and that is the whole difference
   from the card it came off. There is no veil, no panel and no button: the
   words sit over the running app, the layer takes no clicks, and it takes
   itself down. A key takes it down sooner, so somebody who starts working
   straight away never has our confetti in the way of their first task.

   THE LINE IS THE ONE THAT IS TRUE OF WHAT IS BEHIND IT. With agents kept, the
   inbox behind these words has a row per agent in it, so it cannot say the
   inbox is empty; that is w-27e3ab9c48's fault read on the new surface.
*/
/* LONG ENOUGH TO READ WHAT TO DO NEXT (2026-10-01). It was 5.2 seconds for two
   lines; it carries two more now, the next thread and the Team page, and a
   persona test reached the end of the tutorial with nothing saying it was over. Any key or any click
   still takes it down at once, and the click still reaches the app. */
export const LANDED_MS = 14_000;

export function Landed({ agents, onGone }: {
  /**
   * Whether she kept any agents, which decides which of her two lines is
   *  true of the inbox behind this. */
  agents: boolean;
  onGone: () => void;
}) {
  // The pieces are drawn once and never again, so the burst does not restart
  // under a re-render. Their spread is fixed here rather than in the
  // stylesheet because each one needs its own drift. Same forty pieces and the
  // same 1.6 seconds the finish card had.
  const pieces = useRef<{ left: number; delay: number; drift: number; spin: number; hue: number; fall: number }[]>(
    Array.from({ length: 40 }, (_, i) => ({
      left: 4 + ((i * 97) % 92),
      delay: ((i * 53) % 40) / 100,
      drift: ((i * 31) % 120) - 60,
      spin: ((i * 71) % 540) - 270,
      hue: [199, 267, 42, 158, 12][i % 5],
      fall: 62 + ((i * 17) % 26),
    })),
  );
  useEffect(() => {
    const t = setTimeout(onGone, LANDED_MS);
    // ANY KEY TAKES IT DOWN, and the key still reaches the app underneath: this
    // does not preventDefault and does not stop the event. Somebody who presses
    // C to write their first task gets the compose card AND their screen back.
    const on = () => onGone();
    const armed = setTimeout(() => window.addEventListener('keydown', on), 0);
    const armedClick = setTimeout(() => window.addEventListener('pointerdown', on), 0);
    return () => {
      clearTimeout(t); clearTimeout(armed); clearTimeout(armedClick);
      window.removeEventListener('keydown', on);
      window.removeEventListener('pointerdown', on);
    };
  }, [onGone]);
  return (
    <div className="fr-landed" aria-live="polite">
      <div className="fr-burst" aria-hidden="true">
        {pieces.current.map((p, i) => (
          <span
            key={i}
            className="fr-bit"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              ['--fr-drift' as string]: `${p.drift}px`,
              ['--fr-spin' as string]: `${p.spin}deg`,
              ['--fr-fall' as string]: `${p.fall}vh`,
              background: `hsl(${p.hue} 78% 62%)`,
            }}
          />
        ))}
      </div>
      <div className="fr-landed-say">
        <h1 className="fr-landed-head">{COPY.finishHead}</h1>
        <p className="fr-landed-line">{agents ? COPY.finishLineAgents : COPY.finishLine}</p>
        <ul className="fr-landed-next">
          {COPY.finishNext.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function PracticeBand() {
  return (
    <div className="fr-band" role="note">
      {/* THE PART OF THE STRIP THAT PICKS THE WINDOW UP, AND IT STOPS SHORT OF
          THE WAY OUT (w-9a6ea066d6, 2026-08-28).

          THE BAND WAS DRAGGABLE ACROSS THE WHOLE WINDOW AND SKIP SAT INSIDE IT.
          A drag region in Electron is not a CSS effect, it is a native region on
          the window: on macOS a mousedown inside it is taken by the window
          server as "pick this window up" and the page is never told. `.fr-out`
          already said `-webkit-app-region: no-drag`, and that was not enough,
          because Electron builds ONE region by walking the reported rectangles
          IN ORDER (shell/browser/ui/drag_util.mm, DraggableRegionsToSkRegion:
          kUnion_Op for a draggable rect, kDifference_Op for a non-draggable
          one). App.tsx draws <WayOut> before <PracticeBand>, so the button's
          no-drag rect was subtracted first and the band's full-width drag rect
          was added back over it a moment later. Measured on the built app by
          scripts/shot-skip-really-skips.mjs:

            no-drag  button.fr-out   36x38 at 1700,0
            drag     div.fr-band   1752x38 at 0,0     <- puts it back

          Skip was, natively, a piece of the title bar. There was nothing there
          to press, which is exactly what she reported: no card, nothing.

          SO THE FIX IS GEOMETRY, NOT ORDER. The strip itself no longer drags;
          this lane does, and it stops 120px short of the right edge, so NO
          draggable rectangle covers the button at all and the question of which
          rectangle was reported first never has to be answered again. 120 is
          the number because `.fr-out` sits 16px in from that edge and is one
          short word wide, and because `.fr-band-pill` reserves 260px of the
          window and is centred, so it keeps at least 130px of clear strip on
          each side at every width the app will open at (980, main/main.mjs).
          The window is still picked up by the strip everywhere else, which is
          the whole of what the strip was for.
       */}
      <div className="fr-band-drag" aria-hidden="true" />
      <span className="fr-band-pill">
        <span className="fr-band-dot" aria-hidden="true" />
        <span className="fr-band-tag">{COPY.bandTag}</span>
        <span className="fr-band-say">{COPY.band}</span>
      </span>
    </div>
  );
}

/* * `folderOf` WAS HERE AND IT IS DELETED. The card that replaced it prints the real folder
 on EVERY section rather than one for the side you happen to be looking at, off
 `Destination.where` and `fold` in ../agent-import-card.ts. Same promise, kept in more
 places.
*/

/**
 * THE PART OF THE PRODUCT THE SLAB BESIDE IT IS TALKING ABOUT.
 *
 * NOTHING HERE IS A PICTURE AND NOTHING HERE IS SHRUNK. Every element below
 * wears the app's own class, so it is drawn by the app's own stylesheet at the
 * app's own size: a row is 19px of padding over a 15px title exactly as it is
 * in the inbox, because it is the same rule doing it. What makes it fit is the
 * right edge of the window, which cuts it off mid-row the way the real inbox is
 * cut off by the reading pane.
 *
 *  THE ROWS ARE THE PRACTICE ROWS, not invented ones. They are the same three
 *  she meets four screens later, so the introduction is a promise the walk then
 *  keeps rather than a separate piece of fiction. */
/**
 * THE SIDEBAR, AS A STILL. The pictures before the tutorial used to draw the old
 *  top tab strip and the project rail, neither of which anybody sees after the
 *  walk (w-ec62ab6b38, 2026-09-28). This is the sidebar's own markup and
 *  classes, Inbox and In progress at the top and Closed at the foot, so the
 *  first sight of the app is the app they will use. */
function PieceNav({ count = 0, on = 'inbox' }: { count?: number; on?: 'inbox' | 'progress' }) {
  const row = (view: 'inbox' | 'progress' | 'done', label: string, active = on === view) => (
    <button
      className={`workspace-tab${active ? ' active' : ''}${view === 'inbox' && count > 0 ? ' has-count' : ''}`}
      type="button" tabIndex={-1}
    >
      <SidebarIcon view={view} /><span>{label}</span>
      {view === 'inbox' && count > 0 && <small className="workspace-running">{count}</small>}
    </button>
  );
  return (
    <div className="workspace-navigation fr-piece-nav" aria-hidden="true">
      <nav className="workspace-tabs">
        {row('inbox', 'Inbox')}
        {row('progress', 'In progress')}
      </nav>
      <div className="fr-piece-nav-foot">{row('done', 'Closed')}</div>
    </div>
  );
}

/**
 * MORE THAN ONE PROJECT IN THE FIRST PICTURE (w-ec62ab6b38). The product is an
 *  inbox for dozens of agents at once, and four rows from one pretend project
 *  said the opposite. The practice rows still come first, so the promise the
 *  tutorial keeps is intact; these sit under them, from invented projects.
 */
// A TEAM'S WORK, NOT ONLY AN ENGINEER'S (2026-10-01). These were all code:
// database drivers, push providers, React upgrades. They are the first picture
// of the product, and most of the team it is for does not code.
const INTRO_MORE: Array<{ title: string; result: string; agoMs: number; project: string }> = [
  { title: 'Drafted the agenda for the offsite.', result: 'Three sessions and a working lunch. I left the dinner spot for you to pick.', agoMs: 38 * 60_000, project: 'Operations' },
  { title: 'Which launch date should we announce?', result: 'The 14th clears every review. The 7th is a week tighter but still possible.', agoMs: 44 * 60_000, project: 'Launch' },
  { title: 'Rewrote the pricing page.', result: 'All three plans now say the same thing in the same order. Ready for you to read.', agoMs: 52 * 60_000, project: 'Website' },
  { title: 'Summarised this week of customer calls.', result: 'Five calls, and two of them asked for the same thing. One page of notes.', agoMs: 61 * 60_000, project: 'Research' },
];

/**
 * THE SECOND SLIDE'S PICTURE: IN PROGRESS, FULL (w-ec62ab6b38). "You only see
 *  an agent when it needs you" is shown as the other half, the agents that do
 *  not need you, working on their own with their current step under each.
 */
const INTRO_WORKING: Array<{ title: string; step: string; project: string }> = [
  { title: 'Tidy the vendor contact list.', step: 'Removing duplicates.', project: 'Operations' },
  { title: 'Draft the release notes for March.', step: 'Reading what changed this month.', project: 'Launch' },
  { title: 'Find why checkout is slow on Safari.', step: 'Timing the payment form.', project: 'Website' },
  { title: 'Book rooms for the team offsite.', step: 'Comparing three hotels.', project: 'Operations' },
  { title: 'Turn the survey answers into a chart.', step: 'Counting answers by team.', project: 'Research' },
  { title: 'Fix the broken link in the welcome email.', step: 'Checking every link in it.', project: 'Website' },
  { title: 'Write up the hiring plan.', step: 'Drafting the timeline.', project: 'Launch' },
];

function IntroPiece({ kind }: { kind: 'list' | 'ask' | 'empty' | 'progress' }) {
  if (kind === 'progress') {
    return (
      <div className="fr-piece fr-piece-with-nav" aria-hidden="true">
        <PieceNav on="progress" count={3} />
        <div className="list-pane">
          <div className="list">
            <div><div className="day-label">Working now</div></div>
            {INTRO_WORKING.map((r) => (
              <div className="row" key={r.title}>
                <div className="row-main">
                  <div className="subject">{r.title}</div>
                  <div className="preview">{r.step}</div>
                </div>
                <div className="row-end">
                  <span className="product">{r.project}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'ask') {
    return (
      <div className="fr-piece fr-piece-ask" aria-hidden="true">
        <div className="modal compose">
          <div className="compose-text">{PRACTICE_TASK.title}</div>
          <div className="compose-sentence quiet rest-project">
            <span className="compose-clauses">
              <span className="clause clause-project">For {PRACTICE_NAME}.</span>
            </span>
            <button className="dock-send" type="button" tabIndex={-1}>
              Start it <kbd>⌘↵</kbd>
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fr-piece fr-piece-with-nav" aria-hidden="true">
      <PieceNav count={kind === 'list' ? PRACTICE_ROWS.length + INTRO_MORE.length : 0} />
      {kind === 'list' ? (
        <div className="list-pane">
          {/* .list IS WHERE THE ROW'S MEASUREMENTS LIVE: --gutter, --text-x and
              --row-r are declared on it and nowhere else, so a row outside one
              is drawn with no left inset and no right one. Measured the first
              time this was shot without it: three titles hard against the card's
              edge and the summaries touching them. */}
          <div className="list">
            <div><div className="day-label">Today</div></div>
            {[...PRACTICE_ROWS.map((r) => ({ ...r, project: PRACTICE_NAME })), ...INTRO_MORE].map((r) => (
              <div className="row" key={r.title}>
                <div className="row-main">
                  <div className="subject">{r.title}</div>
                  <div className="preview">{r.result}</div>
                </div>
                <div className="row-end">
                  <span className="product">{r.project}</span>
                  <span className="time">{Math.round(r.agoMs / 60_000)}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // THE GOAL, AS A PICTURE: an inbox with nothing in it, because the whole
        // lesson of the goal is getting to inbox zero. The "Active agents"
        // list that stood under it was the project rail, which is retired, so
        // it went with w-ec62ab6b38.
        // THE APP'S OWN INBOX ZERO NOW (w-ec62ab6b38). The old "nothing is
        // waiting on you" screen looked poor beside the app's real inbox zero.
        // So it is the real idle page's markup and classes: the figure, the line
        // saying seven agents are still at work, and the field for the next.
        <div className="list-pane bare fr-piece-empty">
          <div className="zero-state idle">
            <div className="idle-zero-col">
              <b className="idle-zero">0</b>
              <span className="idle-zero-say">Inbox zero · {INTRO_WORKING.length} agents working</span>
              <span className="idle-field">
                <span className="idle-ph">What do you need done?</span>
                <span className="idle-key">N</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* * ---------------------------- PICKING THE LOOK -----------------------------

 ROUND TWO, AND SHE SENT US TO SOMEBODY ELSE'S DRAWING FOR IT.

 FOUR TILES, NOT EIGHTEEN. The row is the picture being shown, then Dark, Light and Match my
 system, and it never wraps and never grows.

 THE TILES ARE THE PRODUCT.

 AND THE SCREEN BEHIND IS THE PRODUCT TOO.

   THE BACKGROUND IS NOT AN IMAGE HERE, WHICH IS BETTER THAN THE DRAWING. The
   page had to photograph it; this is the app's own `.tabs`, `.list-pane` and
   `.rail` with the practice rows in them, so it is right at any window size and
   cannot go stale. It is also why the step can stay at beat four: standing on
   the REAL inbox would have meant moving to beat eight, because this early
   somebody's own inbox is empty.

   IT PAINTS THE WINDOW AS IT IS PRESSED. `onPick` writes the look through
   App.tsx the same way Settings does, so the whole screen is the answer rather
   than a preview of it, and the four screens after this one arrive already
   wearing it.
*/

/**
 * THE APP, WITH NOTHING OF ANYBODY'S IN IT. Placeholder data was her word for
 *  it and it settles something real: the four rows below are the same four the
 *  walk hands over at beat twelve, so this is a first sight of them rather than
 *  an invention that appears once and is never seen again. */
function LookApp() {
  return (
    <div className="fr-look-app" aria-hidden="true">
      <div className="body">
        <PieceNav count={PRACTICE_ROWS.length + INTRO_MORE.length} />
        <div className="list-pane">
          {/* `.list` IS WHERE THE ROW'S MEASUREMENTS LIVE: --gutter, --text-x and
              --row-r are declared on it and nowhere else, so a row outside one is
              drawn with no left inset and no right one. */}
          <div className="list">
            <div><div className="day-label">Today</div></div>
            {[...PRACTICE_ROWS.map((r) => ({ ...r, project: PRACTICE_NAME })), ...INTRO_MORE].map((r) => (
              <div className="row" key={r.title}>
                <div className="row-main">
                  <div className="subject">{r.title}</div>
                  <div className="preview">{r.result}</div>
                </div>
                <div className="row-end">
                  <span className="product">{r.project}</span>
                  <span className="time">{Math.round(r.agoMs / 60_000)}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* The plain Dark, Light and "Match my system" tiles are off this row: "match"
   is retired app-wide, and Dark and Light gave way to two hazes at her word
   (w-ec62ab6b38). See `others` in `Look`. */

function Look({ look, onPick, onNext }: {
  look: LookId; onPick: (l: LookId) => void; onNext: () => void;
}) {
  // ENTER CARRIES IT, like every other screen in the walk, and from the next
  // tick for the reason written on `Slab` below: the press that opened this
  // screen must not be the press that leaves it.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onNext();
    };
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  }, [onNext]);

  // WHICH OF THE SIXTEEN IS IN THE FIRST TILE. It starts on the one the app is
  // already wearing, which on a first run is the default she picked
  // (`DEFAULT_SKIN`), so the tile that is ticked when the screen opens is the
  // picture the window is actually showing and not a seventeenth one.
  // THE PICKER OPENS ON THE LANDSCAPE THE SETUP WORE (w-ec62ab6b38). A new Mac
  // is seeded Ember, and the screens before this one wear Gouache Valley
  // (`walkSkin`), so opening on the stored look snapped the whole window from a
  // landscape to near black on arrival, the flip her 08-26 answer ruled out. So
  // an unpicked default is answered with the landscape, ticked in the first
  // tile, and Ember sits beside it one press away.
  const opensOn = walkSkin(look as SkinChoice) as LookId;
  const [slot, setSlot] = useState(() => {
    const at = SKINS.findIndex((s) => s.id === opensOn);
    return at === -1 ? Math.max(0, SKINS.findIndex((s) => s.id === DEFAULT_SKIN)) : at;
  });
  useEffect(() => {
    if (opensOn !== look && SKINS.some((s) => s.id === opensOn)) onPick(opensOn);
    // Once, on arrival. Every later press is hers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // RANDOM, AND THE WORD IS TRUE.So the next picture is drawn out of a bag
  // rather than taken in order, and the bag is drained before it is refilled:
  // nobody is shown the same photograph twice before they have seen all
  // sixteen, and pressing it sixteen times shows every one of them.
  const bag = useRef<number[]>([]);
  const roll = () => {
    if (!bag.current.length) {
      bag.current = SKINS.map((_, i) => i).filter((i) => i !== slot);
      for (let i = bag.current.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag.current[i], bag.current[j]] = [bag.current[j], bag.current[i]];
      }
    }
    const next = bag.current.pop() as number;
    setSlot(next);
    // The picture in the slot is what they are being shown, so it is what they
    // get if they press nothing else. Showing without applying would be a row of
    // four where one tile is a lie.
    onPick(SKINS[next].id as LookId);
  };

  // THE SECOND TILE IS THE LANDSCAPE THE SETUP WAS WEARING (w-ec62ab6b38), so
  // the picture somebody has just spent six screens looking at is one press
  // away, beside the default. When the rolled slot lands on it, the second tile
  // shows the default instead, so the row never shows one look twice.
  //
  // AND THE LAST TWO ARE VALLEY HAZE AND PEACH HAZE, NOT PLAIN DARK AND LIGHT.
  // Plain Dark and Light stay in Settings
  // and ⌘K. Whatever the rolled slot is, the other three are the first three of
  // these four that it is not, so no look is ever on the row twice.
  const others = [WALK_PICTURE, DEFAULT_SKIN, 'valley-haze', 'peach-haze-2']
    .filter((id) => id !== SKINS[slot].id)
    .slice(0, 3);
  const row: Array<{ id: LookId; name: string }> = [
    { id: SKINS[slot].id as LookId, name: SKINS[slot].name },
    ...others.map((id) => ({ id: id as LookId, name: SKINS.find((s) => s.id === id)?.name ?? String(id) })),
  ];

  // LEFT AND RIGHT MOVE THE TICK ALONG THE ROW, because the arrow keys are the
  // first thing people reach for to switch themes. Each press
  // applies the look, the same as a click, so the window changes under the
  // hand. Armed on the next tick like every key on the walk.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const at = Math.max(0, row.findIndex((l) => l.id === look));
      const next = e.key === 'ArrowRight' ? Math.min(row.length - 1, at + 1) : Math.max(0, at - 1);
      if (row[next].id !== look) onPick(row[next].id);
    };
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  });

  return (
    <div className="fr-screen fr-screen-look">
      <LookApp />
      <div className="fr-look-veil" aria-hidden="true" />
      {/* NO `.fr-brand` ON THIS SCREEN. The other setup screens are a photograph
          with a word in the corner and need one; this one is the app, and the app
          already carries its own top bar. Shot with it on 2026-08-24: "the app"
          printed across the tab strip of the window underneath it. */}
      <div className="fr-look-mid">
        <h1 className="fr-look-q">{COPY.lookQ}</h1>
        <div className="look-row fr-look-row">
          {row.map((l) => (
            <button
              key={l.id}
              className={`look${look === l.id ? ' on' : ''}`}
              aria-pressed={look === l.id}
              onClick={() => onPick(l.id)}
            >
              <span className={`look-swatch shot ${l.id}`} aria-hidden="true">
                {l.id === 'match' && <MatchMark />}
                <span className="look-tick" aria-hidden="true">
                  <Tick />
                </span>
              </span>
              <span className="look-name">{l.name}</span>
            </button>
          ))}
        </div>
        <button className="fr-look-more" onClick={roll}>{COPY.lookMore}</button>
        <p className="fr-look-clause">{COPY.lookClause}</p>
        <button className="fr-go" onClick={onNext}>{COPY.lookGo} <Cap cap="↵" /></button>
      </div>
    </div>
  );
}

/**
 * THE THREE INTRODUCTION SLABS, THE RULE, AND THE HAND-OFF.
 *
 * A tester asked for the same thing in their own words: they would rather meet the
 * lesson before the app opens at all.
 *
 *  THE SLAB IS WORDS ON THE LEFT AND THE PRODUCT ON THE RIGHT, which is hers of
 *  2026-08-24 and is what round two did. It is written up on `IntroPiece` above,
 *  including why a session took it off and why that was a misreading.
 *
 * the sentence in one corner and the way on in the other. */
function Slab({ n, head, line, piece, onNext }: {
  n: number; head: string; line: string;
  piece: 'list' | 'ask' | 'empty' | 'progress'; onNext: () => void;
}) {
  // ENTER CARRIES THE WHOLE WALK, the same rule every setup screen keeps: a
  // walk you can finish without reaching for the mouse is the difference
  // between a demo and a product. It is also the screen two beats before the
  // one that asks somebody to put the mouse down.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onNext();
    };
    // AND IT LISTENS FROM THE NEXT TICK, NOT THIS ONE. Measured driving the
    // built walk on 2026-08-23: one press of Enter on the name screen went
    // straight past the first slab to the second, and one on the rule screen
    // skipped the practice hand-off outright. React flushes this effect while
    // the press that caused the render is still travelling, so the screen that
    // just opened catches the key that opened it. Handing the listener to the
    // next tick lets that press finish first. The same trick and the same
    // reason as `walkAgain` in App.tsx.
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  }, [onNext]);
  return (
    <div className="fr-screen fr-screen-intro">
      <div className="fr-brand"><ProductMark name={NAME} size={18} />{NAME}</div>
      <IntroPiece kind={piece} />
      <div className="fr-corner">
        <div>
          <div className="fr-intro-on">{COPY.introOn(n, COPY.intro.length)}</div>
          <h1 className="fr-head">{head}</h1>
          <p className="fr-intro-line">{line}</p>
        </div>
        <button className="fr-go" onClick={onNext}>{COPY.introNext} <Cap cap="↵" /></button>
      </div>
    </div>
  );
}

/**
 * ONE STATEMENT AND ONE BUTTON. The rule and the hand-off are both this: no
 *  choice on them, nothing to read twice, and the same card shape the finish
 *  uses so the walk has one kind of card in it rather than three. */
function Statement({ head, line, go, onNext }: {
  head: string; line: string; go: string; onNext: () => void;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onNext();
    };
    // AND IT LISTENS FROM THE NEXT TICK, NOT THIS ONE. Measured driving the
    // built walk on 2026-08-23: one press of Enter on the name screen went
    // straight past the first slab to the second, and one on the rule screen
    // skipped the practice hand-off outright. React flushes this effect while
    // the press that caused the render is still travelling, so the screen that
    // just opened catches the key that opened it. Handing the listener to the
    // next tick lets that press finish first. The same trick and the same
    // reason as `walkAgain` in App.tsx.
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  }, [onNext]);
  return (
    <div className="fr-screen">
      <div className="fr-brand"><ProductMark name={NAME} size={18} />{NAME}</div>
      <div className="fr-stack">
        <div className="fr-finish" role="status">
          <h1 className="fr-finish-head">{head}</h1>
          <p className="fr-finish-line">{line}</p>
          <button className="fr-finish-go" onClick={onNext} autoFocus>{go}</button>
        </div>
      </div>
    </div>
  );
}

export function Onboarding({
  run, claude, home, opened, waiting, later, picking, palette, view, tabs, look, products = [],
  beat, pointed,
  onEvent, onStep, onSkipToApp, onPractice, onDone, onFiled, onProjectMade, onRecheck, onSetLook,
}: {
  run: FirstRun;
  /**
   * EVERY PROJECT THE APP HAS. The last card files into one, so it needs the
   *  name and the code folder; it takes only the one this walk made (see
   *  `Finished`), and the app's whole list is what it takes it out of. */
  products: Project[];
  /**
   * WHAT THE WINDOW IS WEARING RIGHT NOW, so the fourth step can show which
   *  tile is on. It is the app's own state, not a copy: picking on that screen
   *  writes through `onSetLook` exactly the way Settings does, and the window
   *  behind the tiles repaints under the hand. */
  look: LookId;
  /**
   * WHETHER A TASK IS OPEN IN THE READING PANE RIGHT NOW. Beat fourteen is one
   *  beat with two sentences, in the list and then in the pane, so it is the
   *  one thing the walk needs to know about the screen behind it. */
  opened?: boolean;
  /**
   * The stopped row's own id, so beat fourteen rings THAT row rather than
   *  whichever one the list happens to have left. Null before the rows exist. */
  waiting?: string | null;
  /**
   * The snoozeable row's own id, for the same reason `waiting` exists: beat
   *  fourteen rings THAT row rather than whichever one is left after the two
   *  finished ones have gone. Null before the rows exist. */
  later?: string | null;
  /**
   * WHETHER THE SNOOZE PICKER IS OPEN. Beat fourteen is one beat with two
   *  sentences, the row and then the picker over it, the same shape as beat
   *  fifteen's list and pane. */
  picking?: boolean;
  /**
   * WHETHER THE COMMAND PALETTE IS OPEN. The last beat is one beat with two
   *  sentences for the same reason the two above are: the second half is a
   *  thing that opens over the app, and until 2026-08-28 the walk said nothing
   *  at all once it was open. See `command` in `coach`. */
  palette?: boolean;
  /**
   * THE ROWS THE CURRENT BEAT'S KEY IS RIGHT FOR, in the order they are drawn,
   *  and the row the row-keys would actually land on. Both come from the app,
   *  because the app is what decides the second one: `pointed` is the row under
   *  the POINTER when there is one and the keyboard's row otherwise.
   *
   * This pair is what stopped the screen giving two instructions at once. The
   * ring goes round `beat[0]`; a press of the beat's key anywhere outside
   * `beat` is answered by the cap and never reaches the app, so no toast can
   * contradict the card. See `beatRows` and `pressAtWrongRow` in onboarding.ts.
   * */
  beat?: string[];
  pointed?: string | null;
  /**
   * THE APP'S OWN Tab ROTATION, so the walk can say where the next press
   *  lands without keeping a second copy of the order. The second copy is what
   *  broke on 2026-08-24: the snooze beat put a Scheduled tab on the screen and
   *  the tour still believed there were two other tabs. */
  tabs?: string[];
  /**
   * WHICH TAB IS UP. Beat fifteen walks every other tab and comes back, and
   *  both what the card says and where the ring sits are read off this rather
   *  than off a count of presses, so the card can never get out of step with
   *  the screen it is describing. */
  view?: string;
  claude: { missing: boolean; url: string };
  home: string;
  /** Something really happened: a folder chosen, a project made. */
  onEvent: (e: { t: 'start' } | { t: 'folder'; path: string } | { t: 'noFolder' } | { t: 'name'; name: string }) => void;
  /** Move to a step. Separate from onEvent because a move records nothing. */
  onStep: (step: FirstRun['step']) => void;
  /* * * The name screen's Next: make the project for real, then walk on. Answers * with the
     reason it did NOT happen, or null when it did.
  */
  onSkipToApp: (p: { name: string; folder: string | null }) => Promise<string | null> | void;
  /**
   * THE HAND-OFF SCREEN'S ONE BUTTON: make the practice project for real, put
   *  its three rows in it, and open it. It is the walk's second real write to
   *  the store and the last one before the app itself takes over. */
  onPractice: () => void;
  /**
   * END THE WALK, with the agents named here still to be filed. That list is
   *  empty on every path that reaches it now: `Open my inbox` on the last card
   *  brings nothing in, and a Mac with no agents at all has nothing to bring.
   *  The argument stays because the walk may end from three places and only one
   *  of them is the import card. */
  onDone: (chosen: string[]) => void;
  /**
   * END THE WALK, WITH THE AGENTS ALREADY IN THEIR INBOXES. The import card
   *  files them itself, into as many projects as it had to make, so there is
   *  nothing here that could repeat the work correctly — it knows one project
   *  and the card knew six. What it needs to know is whether anything landed,
   *  because that is what the confetti is about. */
  onFiled: (p: { added: number; already: number; inboxes: number; made: string[]; noun?: string }) => void;
  /**
   * A project was made on the last card, out of a folder with agents in it.
   *  The app redraws its sidebar so it is there when the walk lets go. */
  onProjectMade?: (slug: string) => void;
  /**
   * Look for Claude Code again, from scratch, and answer with whether it is
   *  still missing. Only the finish card uses it, and only when it is holding
   *  the inbox shut. Optional so a test or a story can draw the walk without
   *  standing a main process up behind it; the button is still real, it simply
   *  reports that nothing changed. */
  onRecheck?: () => Promise<boolean>;
  /**
   * Set the look, for real and for keeps.*/
  onSetLook: (l: LookId) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // WHY THE PROJECT WAS NOT MADE, when it was not. Null the rest of the time.
  const [notMade, setNotMade] = useState<string | null>(null);
  // Why a folder pick was turned down, on the screen that asked for it.
  const [refused, setRefused] = useState<string | null>(null);
  // Up when there is no Mac picker to open, which is a browser tab.
  const [browsing, setBrowsing] = useState(false);
  // THE FOLDERS SHE ALREADY RUNS AGENTS IN (w-ec62ab6b38). Null while being
  // read, so the list never flashes empty. Read from the welcome on, because
  // the conversation walk takes about two seconds on a busy Mac and the
  // welcome is where there is time to spare.
  const [recent, setRecent] = useState<RecentFolder[] | null>(null);
  const [lit, setLit] = useState(0);
  const wantsRecent = run.step === 'welcome' || run.step === 'folder';
  useEffect(() => {
    if (!wantsRecent || recent) return;
    let live = true;
    import('../api').then(({ api }) => api.agentThreads())
      .then((threads) => { if (live) setRecent(recentFolders(threads, { home })); })
      .catch(() => { if (live) setRecent([]); });
    return () => { live = false; };
  }, [wantsRecent, recent, home]);
  const [now, setNow] = useState(() => Date.now());
  // HER AGENTS, read once. Null while it is being read, so the card never
  // flashes an empty list at a Mac that has eight.
  const [found, setFound] = useState<{ user: AgentFile[]; project: AgentFile[] } | null>(null);
  // Bumped when Check again turns Claude Code up. It is the one moment in the
  // walk when a Mac that had nothing to import might now have something, and
  // both reads below watch it.
  const [lookedAgain, setLookedAgain] = useState(0);
  // AND EVERY OTHER FOLDER ON THIS MAC WITH AGENTS IN IT, read at the same beat
  // and for the same reason. The last card is the import card now and it
  // reaches those folders, so a walk that only read the home folder and this
  // project's would draw a card that fills in under her eyes on the last screen
  // of a setup. Null while it is being read.
  const [folders, setFolders] = useState<AgentFolder[] | null>(null);
  // `kept` AND `NOTHING_KEPT` WERE HERE AND THEY ARE GONE. Nothing is left
  // to file when the walk ends: the import card files its own, and the last
  // reader of the empty list was an effect that ended the walk on a Mac with
  // no agents, which is the behaviour this row reverses.

  /**
   * ON TO WHATEVER IS NEXT IN THE ONE LIST. Every Next in the walk goes
   *  through here rather than naming the screen it hands to, so moving a screen
   *  is one edit to `STEPS` and nothing else. See `nextStep`. */
  const go = (from: FirstRun['step']) => { const n = nextStep(from); if (n) onStep(n); };

  // The working line changes at fifteen seconds, so this step has a clock.
  useEffect(() => {
    if (run.step !== 'working') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run.step]);

  useEffect(() => { if (run.step === 'name') nameRef.current?.focus(); }, [run.step]);

  /*
   * ESCAPE IS NOT A WAY BACK ON THESE SCREENS, AND THAT IS DELIBERATE.
   *
   * There WAS a listener here for one afternoon, and there was a private one on
   * the name field before that. Both are gone. Somebody halfway through setup
   * presses Escape to shake off a folder chooser, a menu or a stray focus ring,
   * and answering that press by walking them back a screen is the app deciding
   * they meant something they did not.
   *
   * So the arrow is the whole of it, and `stepBack` is only asked WHETHER there
   * is anywhere to go and WHERE, never by a key. Do not add one back without
   * her: the walk's other Escape, the one that closes the leave card in
   * `WayOut`, is a different screen and a different question. */
  const backTo = stepBack(run.step);

  // THE LAST SCREEN READS HER MAC, once: her home folder, this project's
  // folder, and every other folder on the disk that has agents in it.
  //
  // AND IT IS READ ONE BEAT EARLY, on ⌘K, so the finish card is whole the
  // moment it appears. The offer is part of that card now, and a list of her
  // agents popping into a card she is already reading is the same defect as a
  // screen that says there are none before it has looked.
  //
  // NOTHING IS TICKED FROM THIS ANY MORE. The old card opened with everything
  // on and remembered what she took last time (`chosenAtOpen`); the card she
  // approved on 08-26 opens with nothing on, which is what makes one project
  // one press, so what she took last time is no longer read here.
  //
  // AN EMPTY ANSWER IS NOT LATCHED, AND THAT IS ESTHER'S BULLET.
  //
  // The read ran ONCE and its result was kept whatever it was, so an empty
  // `{user: [], project: []}` was a finished answer that could never be looked
  // at again. a tester reached the last card on a Mac with no Claude Code on
  // it, which is exactly the Mac with no `~/.claude/agents` on it either.
  // Claude Code was then installed in front of her, she pressed Check again,
  // the gate opened on the binary, and the offer stayed empty for the rest of
  // the walk because this effect had already decided. Nothing on the screen
  // said we had looked before there was anything to look at.
  //
  // So a read that FOUND something is final, and a read that found nothing is
  // provisional: it is taken again when the last card opens, and again every
  // time Check again turns Claude Code up, which is the exact moment a Mac
  // that had no agents on it might have some. It is a directory listing, so
  // asking twice costs nothing, and the beat-early read still fills the card
  // for the normal case where she has agents all along.
  const again = readAgentsAgain(found);
  useEffect(() => {
    if (run.step !== 'command' && run.step !== 'done') return;
    if (!again) return;
    let live = true;
    (async () => {
      const { api } = await import('../api');
      const r = await api.agentFiles({ folder: run.folder, product: run.product });
      if (!live) return;
      // A second read that found nothing again is the same nothing, so the
      // card is left exactly as it is rather than redrawn in a loop on the very
      // Mac this rule exists for.
      const now = { user: r.user, project: r.project };
      if (!keepSecondRead(found, now)) return;
      setFound(now);
    })();
    return () => { live = false; };
  }, [run.step, run.folder, run.product, found, again, lookedAgain]);

  // THE DISK SCAN IS ITS OWN READ, because it is much the slower of the two and
  // the card must not wait on it to say what it already knows. Measured on the
  // ⌘K card 2026-08-26 with twenty folders on the disk: the scan came back
  // after the file read every time.
  //
  // AND IT WAITS FOR THE IMPORT CARD. It used to start one beat early, on the
  // ⌘K card, so the import card would be whole when it opened. But this is the
  // one read in the walk that leaves the folder she picked: it lists the folder
  // BESIDE her project, and on a Mac where that is `~/Desktop/dev`, macOS puts
  // up its Desktop panel. Measured on the "the app new user" build 2026-09-01
  // 20:23:39: the panel landed on the ⌘K card, over a screen that says nothing
  // about agents.So the permission is asked on the card that needs it, and the
  // card fills in while it is on screen, which it already knows how to do
  // (`folders` is null until then).
  useEffect(() => {
    if (run.step !== 'done') return;
    if (folders) return;
    let live = true;
    (async () => {
      const { api } = await import('../api');
      let f: AgentFolder[] = [];
      try { f = await api.agentFolders(); } catch { f = []; }
      if (live) setFolders(f);
    })();
    return () => { live = false; };
  }, [run.step, folders]);

  // ENTER CARRIES THE WHOLE WALK. Every setup screen's one button is also the
  // return key, because a walk you can finish without reaching for the mouse is
  // the difference between a demo and a product.
  useEffect(() => {
    if (run.step !== 'welcome') return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onEvent({ t: 'start' }); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [run.step, onEvent]);

  // AND THE FOLDER SCREEN'S OWN ⌘↵. Measured on, 2026-08-21, off the shipping
  // build: with a folder already chosen and Next live, ⌘↵ left the screen
  // exactly where it was. Nothing listened for it. That is the same fault she
  // reported one line above it on the ⌘O, and the walk's rule is that a hint
  // on a key is a promise the key does something. Only with a folder in hand,
  // because Next is dead without one. AND PLAIN ↵ AS WELL, from round four,
  // because the card now shows a bare ↵ in its corner where the Command-Enter
  // button used to be. A key drawn on a screen is a promise that the key does
  // something; ⌘↵ still works, since it is the key every other screen in the
  // walk takes.
  //
  // THE LIST TAKES THE KEYS NOW (w-ec62ab6b38). Arrows move the highlight down
  // the recent folders and onto "Choose another folder"; Return takes the
  // highlighted one. Armed on the next tick, like every screen of the walk, so
  // the Return that arrived here does not also leave.
  const rows = recent?.length ?? 0;
  useEffect(() => {
    if (run.step !== 'folder' || recent === null) return;
    const on = (e: KeyboardEvent) => {
      // One row past "Choose another folder": the way past for somebody with no folder.
      if (e.key === 'ArrowDown') { e.preventDefault(); setLit((i) => Math.min(rows + 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setLit((i) => Math.max(0, i - 1)); }
      // The row past the chooser is the way past with no folder.
      if (e.key === 'Enter' && lit > rows) { e.preventDefault(); skipFolder(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (lit < rows && recent[lit]) takeFolder(recent[lit].folder);
        else pickFolder();
      }
    };
    const t = setTimeout(() => window.addEventListener('keydown', on), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  });

  const pickFolder = async () => {
    const { api } = await import('../api');
    const { path: picked, refused: why, browse } = await api.chooseFolder(run.folder ?? undefined);
    // NO MAC PICKER TO OPEN, which is a browser tab and not a failure. The app
    // draws its own, on the same disk, through the same process.
    if (browse) { setRefused(null); setBrowsing(true); return; }
    // TURNED DOWN, AND SAID SO. This picker opens on the home folder, so
    // pressing Open without navigating anywhere used to make the home folder
    // the project. That is macOS asking about each guarded folder in turn,
    // because the worker started in the home folder and listed it. Main refuses
    // the path; this shows why.
    if (why) { setRefused(why); return; }
    // Cancelling is not an answer, so it changes nothing.
    if (picked) takeFolder(picked);
  };

  // PICKING IS MOVING ON (w-ec62ab6b38). The old screen held a chosen folder in
  // a box and waited for Submit, which is the step people could not read. A
  // folder picked from the list or from the Mac chooser goes straight to the
  // name, where the folder is shown again with a way to change it.
  // NO FOLDER, AND THAT IS FINE (2026-10-01). The project is made without one
  // and its agents work in a folder the app keeps for it, so somebody with no
  // code folder still ends the setup with a project that works.
  const skipFolder = () => {
    setRefused(null);
    onEvent({ t: 'noFolder' });
    onStep('name');
  };

  const takeFolder = (picked: string) => {
    setRefused(null);
    onEvent({ t: 'folder', path: picked });
    onStep('name');
  };

  const make = async () => {
    if (!run.name.trim() || busy) return;
    setBusy(true);
    setNotMade(null);
    try {
      const why = await onSkipToApp({ name: run.name.trim(), folder: run.folder });
      // A reason means the walk did not move, and the card is the only surface
      // she can see while it is up. Nothing here throws: App.tsx catches and
      // answers with words, so the one failure this screen has is a value.
      if (why) setNotMade(why);
    } finally { setBusy(false); }
  };

  // It stands between the name and the introduction, which is the last moment
  // where changing it changes something somebody is about to look at.
  if (run.step === 'look') {
    return <Look look={look} onPick={onSetLook} onNext={() => go('look')} />;
  }

  // ---- the introduction, before the app is ever on the screen --------------
  // Four slabs and the hand-off. Nothing here touches the store except the last
  // button, and nothing here is the app.
  //
  // WHERE NEXT GOES IS READ OFF `STEPS`, NEVER OFF A LIST WRITTEN OUT HERE.
  // This was `const next: Step[] = ['away', 'goal', 'hand']`, a second copy of
  // the order kept in step with the real one by nothing at all, and adding the
  // sidebar slab on 2026-08-24 broke it in both directions at once: slab two's
  // Next skipped the new screen entirely, and slab four's Next ran off the end
  // of the list and called `onStep(undefined)`, which stopped the walk dead on
  // the last introduction screen. Both were photographed before either was
  // noticed, which is the whole argument for driving it.
  //
  // IT READ `INTRO` FOR A DAY AND THAT WAS STILL A SECOND COPY, one screen
  // long. Moving the look between the introduction and the hand-off on
  // 2026-08-25 would have walked straight past it, because `INTRO` ends at the
  // hand-off and knows nothing about what she put in front of it. `go` asks the
  // walk's own order, which is the only list there is.
  const slab = SLAB_OF[run.step];
  if (slab != null) {
    const it = COPY.intro[slab];
    return (
      <Slab
        n={slab + 1}
        head={it.head}
        line={it.line}
        piece={it.piece}
        onNext={() => go(run.step)}
      />
    );
  }

  // THE MOUSE RULE HAD A SCREEN HERE AND SHE CUT IT.Its copy is in
  // onboarding.ts where the deleted keys used to be, and in decisions.md
  // verbatim.

  // THE HAND-OFF. It says nothing in here is theirs and their own project is
  // untouched, and it names NEITHER of them: naming the project they made one
  // screen earlier is what put "Wt 77df" on a screen headed "This is a practice
  // project". See COPY.handLine.
  if (run.step === 'hand') {
    return (
      <Statement
        head={COPY.handHead}
        line={COPY.handLine}
        go={COPY.handGo}
        onNext={onPractice}
      />
    );
  }

  // ---- the app itself, with one card beside it -----------------------------
  if (COACHED.includes(run.step)) {
    // HOW MANY FINISHED ROWS ARE LEFT, so the second clearing card says "too"
    // rather than the first card word for word. `beat` is the list of rows this
    // beat's key is right for and it is counted off the drawn inbox, so it is
    // the same number the lights are showing. AND THE TAB STRIP GOES IN WITH
    // IT, so the tab tour's sentences name the tab the next press really opens
    // rather than the one that came next in a list. Same `tabs` the ring below
    // is drawn off, which is the point of handing it to both.
    // THE TEAM LAYOUT'S TAB STRIP, when it is the one on the screen. A card
    // beside one of its tabs sits on the tabs after it, which is the "hints
    // covered the tabs" a persona test reported, so there the card goes under
    // the strip, and it names the tab as well as the key (2026-10-01).
    const teamStrip = run.step === 'where' && typeof document !== 'undefined'
      && !!document.querySelector('.th-bar .tm-tabs');
    const say = coach(run.step, run.sentAt ? now - run.sentAt : 0, {
      opened, view, picking, palette, left: beat?.length, tabs,
      tabNames: teamStrip ? TEAM_TAB_NAMES : undefined,
    });
    if (!say) return null;
    // HER TASK'S OWN ROW FIRST. The walk knows which item it made, so on the
    // two beats about that one row it points at it by id and falls back to the
    // list only if it is not drawn yet. Without this the ring went round
    // whatever was at the top of the list, which on a Mac with agents already
    // running is somebody else's work.
    const own = (run.step === 'working' || run.step === 'open') && run.item;
    // AND THE SAME FOR THE STOPPED ROW ON BEAT FOURTEEN. Once it is open the
    // strip of options wins, because that is what she is being told to press.
    // AND ON BEAT FIFTEEN THE RING IS ON THE TAB THE PRESS GOES TO, which is
    // the next one round the app's own rotation: Inbox, In progress, Closed and
    // back. Ringing the tab somebody is standing on would tell them where they
    // are, which they can see; ringing the next one tells them what Tab does,
    // which is the beat.
    // WHERE THE NEXT PRESS LANDS, read off the app's own rotation rather than
    // worked out here. It was `progress, done, inbox` written down in this
    // file, and the snooze beat put a Scheduled tab between the first two on
    // 2026-08-24, so the ring pointed at the tab after the one Tab was actually
    // about to open. Same shape of fault as the introduction's next list, found
    // in the same run.
    //
    // AND IT MOVED OUT OF THIS FILE ON 2026-09-02, because the card's own
    // sentences need the same answer and were working it out from a list of
    // their own. `nextTab` in ../onboarding is the one copy now, and the ring
    // and the words below cannot come apart.
    const goingTo = run.step === 'where' ? nextTab(tabs, view) : null;
    // AND THE CLEARING BEAT RINGS THE ROW IT IS ABOUT. It used to ring
    // `.list-pane .row`, which is whichever row the list drew first, over a
    // card reading "close the two that are finished" — so the ring said one
    // thing, the card said two, and neither said which. `beat[0]` is the
    // first finished row still in the inbox, so the ring walks down them one
    // press at a time the way it already does on the two beats below.
    const clearing = run.step === 'clear' ? beat?.[0] ?? null : null;
    const sel = own
      ? [`.list-pane .row[data-item-id="${run.item}"]`, ...ANCHOR[run.step] ?? []]
      : clearing
      ? [`.list-pane .row[data-item-id="${clearing}"]`, ...ANCHOR.clear ?? []]
      : run.step === 'unblock' && waiting && !opened
        ? [`.list-pane .row[data-item-id="${waiting}"]`, ...ANCHOR.unblock ?? []]
        // AND BEAT FOURTEEN RINGS THE ROW THAT IS NOT FOR TODAY, until the
        // picker is over it, at which point the picker is what the press is
        // about and ANCHOR.snooze has it first.
        : run.step === 'snooze' && later && !picking
          ? [`.list-pane .row[data-item-id="${later}"]`, ...ANCHOR.snooze ?? []]
          : goingTo
            // THE TEAM LAYOUT'S TAB FIRST (2026-10-01): its strip has no
            // data-tab, so `teamTab` finds the tab by its place in the strip.
            ? [...(teamTab(goingTo) ? [teamTab(goingTo) as string] : []), `.workspace-navigation [data-tab="${goingTo}"]`, `.tabs .tab[data-tab="${goingTo}"]`, ...ANCHOR.where ?? []]
            : ANCHOR[run.step];

    if (!sel || !sel.length) return null;
    return (
      <Ringed
        selector={sel}
        // THE TAB TOUR STANDS THE CARD OFF THE STRIP; THE PALETTE STANDS IT OFF
        // ITSELF. Both are things the card must not land on top of, and they
        // are different shapes, so they take the two different rules in
        // `Ringed`. AND THE BEAT THAT TEACHES HOW A TASK ENDS IS NOT ONE OF
        // THEM ANY MORE. It stood beside `.focus-actions button` from
        // 2026-08-28, because its ring was round a close-this-task button in a
        // row of buttons and a card under that button printed 12 and then 46
        // points into the reply box. Both the button and the bar are gone from
        // the reading pane since 2026-08-27, so that rule was aiming the card
        // off an element the page no longer has, on a beat whose ring had
        // stopped being drawn at all. The ring is the reply box itself now, and
        // the reply box sits on the bottom edge of the window, so `ring`
        // already flips the sentence above it into the empty middle of the
        // pane. There is nothing beside it to stand off and nothing under it to
        // cover: the overlap the rig prints as `overDock` is 0 by construction.
        beside={(run.step === 'where' && !teamStrip) || (run.step === 'command' && !!palette)}
        besideRing={run.step === 'command' && !!palette}
        // The tour's tabs are the sidebar's rows now, so the card stands off
        // the sidebar's right edge and holds one x for every press.
        besideOf={run.step === 'where' ? '.workspace-navigation, .tabs' : undefined}
        boundsSel={BOUNDS[run.step]}
        // AND THE CARD GOES UNDER THE WHOLE PICKER, NOT UNDER THE LIST INSIDE
        // IT. The ring is on the options, which is what the press is about, but
        // a card TEXT_GAP under the options prints across the last two of them
        // — photographed on 2026-08-24 with "Tomorrow" half behind the words
        // telling her to pick one. Same fault as the answer card covering two
        // of three options a round earlier, and the same fix: clear the whole
        // thing the ring is inside.
        underSel={run.step === 'snooze' && picking ? '.modal.snooze' : UNDER[run.step]}
        // AND ON THE TWO BEATS THAT RING ONE ROW OUT OF A STACK, THE LIST MOVES
        // INSTEAD OF THE CARD. `UNDER` above put the card below every row so it
        // covered none of them, and the price was the card ending up 256px from
        // its own ring with three rows in between, each of them a candidate for
        // the "this one" the card was talking about. Now the rows under the
        // ringed one slide down by the card's height and the card sits in the
        // gap, 18px under the row it names. See `makeRoom`.
        //
        // NOT WHILE THE PICKER IS OPEN. Then the ring is inside a modal over
        // the list, the rows behind it are not what anybody is reading, and
        // moving them would animate the room behind a screen she is looking at.
        makesRoom={(run.step === 'clear' || (run.step === 'snooze' && !picking)) && !!UNDER[run.step]}
        say={say}
        beat={beat}
        pointed={pointed}
        /* * AND THE APP IS HELD TO THIS BEAT WHILE THE PRACTICE BAND IS UP (w-9a6ea066d6,
           2026-08-28).
        */
        hold={practising(run)}
        also={ALSO[run.step]}
      />
    );
  }

  if (run.step === 'done') {
    return (
      <Finished
        found={found}
        folders={folders}
        claude={claude}
        products={walkProject(products, run)}
        project={run.product}
        onDone={onDone}
        onFiled={onFiled}
        onProjectMade={onProjectMade}
        onRecheck={async () => {
          const missing = onRecheck ? await onRecheck() : true;
          // Claude Code has just turned up, so look at her agents again: the
          // first read ran on a Mac that did not have it, and on such a Mac
          // ~/.claude/agents does not exist either.
          //
          // AND FORGET THE EMPTY ANSWER FIRST. Keeping it let the card end the
          // walk on the very press that was supposed to fill it, before the
          // fresh read could land.
          if (!missing) {
            setFound((f) => forgetAgentsWhileLookingAgain(f, missing));
            // AND THE DISK SCAN IS FORGOTTEN WITH IT. It looks for folders that
            // hold agent files, so on a Mac without Claude Code it came back
            // empty for the same reason the file read did, and an empty scan
            // kept is half of what sends her straight past the offer.
            setFolders((f) => forgetFoldersWhileLookingAgain(f, missing));
            setLookedAgain((n) => n + 1);
          }
          return missing;
        }}
      />
    );
  }

  if (run.step === 'landed') return null;

  // ---- the three setup screens --------------------------------------------
  const folderShown = run.folder ? shortPath(run.folder, home) : null;

  /* * THE WAY BACK, SAID OUT LOUD. The key above is the whole of
     the behaviour; this is the half that makes it findable, and a tester is the
     reason both are needed.

     IT IS THE APP'S OWN BACK CONTROL AND NOTHING NEW.

     That control already exists and she settled it twice. So this is that button, in that
     stylesheet rule, with the walk's own class only for where it sits. Redrawing it would
     have been the fourth round of a question she has answered twice.

     TOP LEFT MEANS BESIDE THE WORDMARK, NOT AT THE CORNER. The window is
     `titleBarStyle: 'hiddenInset'`, so the corner itself belongs to the red,
     amber and green buttons; `.fr-brand` already starts at 64px to clear them
     and the arrow takes that place with the mark moving along behind it.
  */
  const backWord = backTo && (
    <button
      type="button"
      className="back-esc fr-back"
      onClick={() => onStep(backTo)}
      /*
       * No key is named, because none does this any more. A control that
         promises esc and does nothing when it is pressed is the dead key
         `tests/the-walk-promises-no-dead-keys.test.mjs` exists to forbid. */
      aria-label={COPY.back}
      title={COPY.back}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
    </button>
  );

  return (
    <div className={backWord ? 'fr-screen has-back' : 'fr-screen'}>
      {/* THE ARROW FIRST, THEN WHOSE APP THIS IS. One control for both setup
          screens rather than one drawn inside each of them, because it belongs
          to the WINDOW's corner and not to either card. The welcome screen has
          nothing behind it, so `stepBack` answers null there and this is not
          drawn at all. */}
      {backWord}
      <div className="fr-brand"><ProductMark name={NAME} size={18} />{NAME}</div>

      {run.step === 'welcome' && (
        // CORNER TO CORNER, chosen out of eight welcomes. The
        // sentence in one corner, the way on in the other, and the whole window
        // between them doing nothing, which is the point of it.
        <div className="fr-corner">
          <div>
            <h1 className="fr-head">{COPY.head}</h1>
            {/* THE PRIVACY LINE IS GONE (w-ec62ab6b38, 2026-09-28). Three
                stacks of text made the welcome cluttered, and the line about
                the privacy policy was the most disruptive of them. What a released
                build counts is still switchable in Settings, "Counts and crash
                reports", and written out in the README's "What this sends". */}
            <p className="fr-sub">{COPY.headSub}</p>
          </div>
          <button className="fr-go" onClick={() => onEvent({ t: 'start' })}>
            {COPY.getStarted} <Cap cap="↵" />
          </button>
        </div>
      )}

      {/* The app's own picker, over the walk, when there is no Mac one. It
          takes the whole screen the same way the Mac's dialog would. */}
      {browsing && (
        <FolderPicker
          startIn={run.folder ?? null}
          onPick={(picked) => { setBrowsing(false); takeFolder(picked); }}
          onClose={() => setBrowsing(false)}
        />
      )}

      {run.step === 'folder' && (
        // REBUILT FROM SCRATCH (w-ec62ab6b38, 2026-09-28). The old screen was
        // a heading, a box labelled "Where is your code?", a path that was also
        // a button, and a Submit that only appeared after a pick. Now: the real
        // question, one line under it, and the folders she already runs agents
        // in as rows to click. The Mac chooser is the last row. A click is the
        // answer; there is no Submit. The old markup is in decisions.md, 09-28.
        <div className="fr-stack fr-stack-folders">
          <h1 className="fr-page">{COPY.folderHead}</h1>
          <p className="fr-lede">{COPY.folderLede}</p>
          <div className="fr-card fr-folders" role="listbox" aria-label={COPY.folderHead}>
            {recent && recent.length > 0 && (
              <div className="fr-folders-label">{COPY.folderRecent}</div>
            )}
            {(recent ?? []).map((f, i) => (
              <button
                key={f.folder}
                type="button"
                role="option"
                aria-selected={lit === i}
                className={`fr-folder${lit === i ? ' lit' : ''}${run.folder === f.folder ? ' on' : ''}`}
                onMouseEnter={() => setLit(i)}
                onClick={() => takeFolder(f.folder)}
              >
                <span className="fr-fold"><FolderGlyph /></span>
                <span className="fr-folder-name">{f.name}</span>
                <span className="fr-folder-path">{f.short}</span>
                {/* NO TOOL NAMES ON THE ROW (2026-10-01). It said which agent
                    app the folder was found through, which means nothing to
                    most of the team. The cell stays so the grid holds. */}
                <span className="fr-folder-via" />
                <span className="fr-folder-key">{lit === i && <Cap cap="↵" />}</span>
              </button>
            ))}
            <button
              type="button"
              role="option"
              aria-selected={lit === (recent?.length ?? 0)}
              className={`fr-folder fr-folder-other${lit === (recent?.length ?? 0) ? ' lit' : ''}`}
              onMouseEnter={() => setLit(recent?.length ?? 0)}
              onClick={pickFolder}
            >
              <span className="fr-fold"><PlusGlyph /></span>
              <span className="fr-folder-name">{recent && recent.length ? COPY.folderOther : COPY.folderFirst}</span>
              <span className="fr-folder-key">{lit === (recent?.length ?? 0) && <Cap cap="↵" />}</span>
            </button>
            <button
              type="button"
              role="option"
              aria-selected={lit === (recent?.length ?? 0) + 1}
              className={`fr-folder fr-folder-other fr-folder-none${lit === (recent?.length ?? 0) + 1 ? ' lit' : ''}`}
              onMouseEnter={() => setLit((recent?.length ?? 0) + 1)}
              onClick={skipFolder}
            >
              <span className="fr-fold"><SkipGlyph /></span>
              <span className="fr-folder-name">{COPY.folderNone}</span>
              <span className="fr-folder-key">{lit === (recent?.length ?? 0) + 1 && <Cap cap="↵" />}</span>
            </button>
          </div>
          {refused && <p className="fr-note fr-refused">{refused}</p>}
        </div>
      )}

      {run.step === 'name' && (
        <div className="fr-stack fr-stack-folders">
          {/* NAME SECOND, ALREADY FILLED IN, unchanged since round two.
              Rebuilt with the folder screen (w-ec62ab6b38): the question is
              the heading, the field is the card, and the folder it is for sits
              under it with a way back to change it. */}
          <h1 className="fr-page">{COPY.nameQ}</h1>
          {folderShown ? (
            <p className="fr-lede">
              {COPY.nameIn} <span className="fr-lede-path">{folderShown}</span>.{' '}
              <button type="button" className="fr-lede-link" onClick={() => onStep('folder')}>{COPY.nameChange}</button>
            </p>
          ) : (
            <p className="fr-lede">
              {COPY.nameInNone}{' '}
              <button type="button" className="fr-lede-link" onClick={() => onStep('folder')}>{COPY.nameChoose}</button>
            </p>
          )}
          <div className="fr-card fr-name-card">
            <input
              ref={nameRef}
              className="fr-name"
              value={run.name}
              spellCheck={false}
              onChange={(e) => { setNotMade(null); onEvent({ t: 'name', name: e.target.value }); }}
              /*
               * ESCAPE IS NOT HERE ANY MORE, and that is not a deletion of the
                 behaviour. It used to be this field's own handler, which meant
                 the walk's only backwards move lived inside a text box on the
                 third screen and did not exist on the second one at all. It is
                 one window listener now, above, so both setup screens have it
                 and neither depends on where the focus happens to be
                 (w-18f4ab24c0). */
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); make(); }
              }}
            />
            {/* THE SAME BUTTON AS THE FOLDER CARD, in the same corner and with
                the same word. Enter in the field still makes the project, and
                this does the one thing Enter does. */}
            <button className="fr-submit" onClick={make} disabled={!run.name.trim() || busy}>
              {COPY.nameGo} <Cap cap="↵" />
            </button>
          </div>
          {/* THE ONLY THING THIS SCREEN CAN GET WRONG, SAID WHERE SHE IS
              LOOKING. Under the card, the same place and the same shape as the
              Claude Code line on the screen before it, so there is one kind of
              footnote in the walk rather than two. */}
          {notMade && (
            <p className="fr-note fr-notmade" role="alert">{notMade}</p>
          )}
        </div>
      )}
    </div>
  );
}
