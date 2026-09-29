// THE TUTORIAL, OFFERING ITSELF ON A NEW PROJECT.
//
// WHY THIS IS A CARD AND NOT A SCREEN. The walk's setup screens are corner to
// corner and opaque, and they are right to be: they are for a Mac that has
// never had Agentbox on it and there is nothing behind them worth seeing. A
// person who has just made their fourth project has an inbox with work in it,
// and taking their window away to ask a question they did not ask for is the
// app deciding what they are doing. So this is 360 points in the middle of the
// screen with their own app behind it, and Escape puts it away.
//
// IT IS THE WAY-OUT CARD'S OWN SHAPE, down to the class names. `.fr-stay` is
// the card the walk draws when somebody presses Skip: two lines, two buttons,
// an outline on one and a plain word on the other, no fill and no colour
// anywhere. That register was argued out with her on 2026-08-25 for a card
// asking almost exactly this question from the other side, so it is the same
// card rather than a second design of one. Nothing is added to styles.css.
//
// THE DRAWN BUTTON IS THE ONE THAT PRACTISES, and that is the only place this
// differs from the way-out card, which draws the one the person already asked
// for by pressing Skip. Nobody pressed anything to get here, so the weight goes
// on the thing the founder wants taken. It is still an outline and a plain
// word: recommending by drawing rather than by telling anybody off is her rule
// and it is intact.
//
// WHAT IT IS OFFERED FOR, AND HOW OFTEN, IS NOT HERE. It is ../tutorial.ts,
// where the reasoning for asking once and never again is written down.

import { useEffect, useRef } from 'react';
import { COPY } from '../onboarding';

export function TutorialOffer({ onStart, onNot }: {
  /**
   * Take it: the practice project is made and the walk opens on the hand-off
   *  card, which is the screen whose button this one is named after. */
  onStart: () => void;
  /**
   * Turn it down. The caller says where the tutorial lives on the way out
   *  (`COPY.offerLater`), because this is the one moment somebody has proved
   *  they know it exists and chosen not to take it. */
  onNot: () => void;
}) {
  const go = useRef<HTMLButtonElement>(null);

  // ESCAPE IS "NOT NOW", and it is the capture phase for the same reason the
  // way-out card's is: Escape reaches App.tsx's own handlers too, and a card
  // over the inbox must not close a task on its way to closing itself.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onNot();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [onNot]);

  // AND THE FOCUS ARRIVES ON THE NEXT TICK, NOT THIS ONE. Same trick and same
  // reason as `Statement` in ./Onboarding.tsx and `walkAgain` in ../App.tsx:
  // this card opens on the Return that submitted the new project card, and a
  // button focused inside the dispatch of that press is a button that can catch
  // it. Measured there twice; not measured here, and that is exactly why it is
  // written the safe way round rather than argued about.
  useEffect(() => {
    const t = setTimeout(() => go.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fr-stay-scrim" role="dialog" aria-modal="true" aria-label={COPY.offerHead}>
      <div className="fr-stay">
        <div className="fr-stay-head">{COPY.offerHead}</div>
        <div className="fr-stay-line">{COPY.offerLine}</div>
        <div className="fr-stay-row">
          <button ref={go} type="button" className="fr-stay-go" onClick={onStart}>
            {COPY.offerGo}
          </button>
          <button type="button" className="fr-stay-keep" onClick={onNot}>
            {COPY.offerNot}
          </button>
        </div>
      </div>
    </div>
  );
}
