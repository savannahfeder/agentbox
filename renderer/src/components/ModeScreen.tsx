// THE WALK ASKS WHAT AGENTS MAY DO — THREE TREATMENTS OF ONE SCREEN.
//
// Status: proposed, awaiting. Nothing here is decided and nothing here is in
// the walk.
//
// WHY IT IS BUILT AT ALL RATHER THAN DRAWN.The round before this one handed
// her hand-written HTML that sampled the app's colours and invented everything
// else. So every treatment below is the walk's own markup, the walk's own
// classes and the app's own stylesheet, over the same Lake the three setup
// screens wear. What she looks at is the screen.
//
// THREE, AND THEY DIFFER IN WHAT THEY COST HER USERS, NOT IN DECORATION:
//
//   A  a card of its own, six positions, one beat added to the walk
//   B  a card of its own, two positions, the other four left to Settings
//   E  on the finish card, over the agents she is already importing
//
// A and B are the "page during onboarding" she named. E puts it where she
// already agreed the last question of the walk goes.
//
// THERE WERE FIVE. Both are written out verbatim in decisions.md under 08-26.
//
// WHAT THAT LEAVES IS A PLACEMENT QUESTION, NOT A WORDING ONE: the folder card
// is not where this is asked. A, B and E are each somewhere else.

import type { PermissionMode } from '../types';
import { MODE_ORDER, MODE_SENTENCE, MODE_WORDS, RULES_ALWAYS_APPLY } from '../modes';
import { COPY } from '../onboarding';
import { AppMark } from './AppMark';
import { NAME, Name } from '../../../shared/product-name.mjs';

export type ModeVariant = 'a' | 'b' | 'e';

export const MODE_VARIANTS: ModeVariant[] = ['a', 'b', 'e'];

export function isModeVariant(s: string | null): ModeVariant | null {
  return s && (MODE_VARIANTS as string[]).includes(s) ? (s as ModeVariant) : null;
}

/**
 * THE COPY, kept together so what each treatment says can be read without
 *  reading the markup. Every line is ours and provisional; she has picked none
 *  of it. */
export const MODE_COPY = {
  page: 'What may your agents do?',
  q: 'While you are not watching.',
  note: 'You can change this any time, for everything or for one message.',
  // The same caveat Settings prints. A mode sentence without it reads as a
  // promise that something is blocked, and none of the six can promise that.
  rules: RULES_ALWAYS_APPLY,
  // E's line over the same list the finish card already carries.
  finishQ: 'What your agents may do.',
  tick: 'Recommended',
} as const;

// THESE SCREENS NO LONGER COUNT THEMSELVES, BECAUSE THE WALK STOPPED DOING IT.
// They used to end on a row of dots copied from the walk, off `N_STEPS` and
// `DOT`. Both were deleted from `../onboarding` by the walk's own redesign
// (08-24 and 08-25: the theme picker moved to beat seven, the introduction
// slabs went in front of it, and `Lights` replaced the dots), and there is no
// step dot anywhere in `Onboarding.tsx` now. Drawing one here would put
// furniture in the photograph that the app does not have, which is the exact
// fault she rejected the hand-drawn round for.

/**
 * THE SIX, AS ROWS. Same shape as the agent list on the finish card, which
 *  is the only list the walk has ever drawn, so this is not a new component
 *  she has to read: a tick box, a name, and the sentence under it. */
function ModeRows({ modes, value, onPick }: {
  modes: PermissionMode[];
  value: PermissionMode;
  onPick: (m: PermissionMode) => void;
}) {
  return (
    <div className="fr-list fr-modes">
      {modes.map((m) => (
        <button
          key={m}
          className={m === value ? 'fr-agent fr-mode on' : 'fr-agent fr-mode'}
          onClick={() => onPick(m)}
        >
          <span className="fr-tick">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12.5 9.5 18 20 6.5" />
            </svg>
          </span>
          <span className="grow">
            <span className="fr-agent-name">{MODE_WORDS[m]}</span>
            <span className="fr-agent-line">{MODE_SENTENCE[m]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ModeScreen({ variant, value, onPick }: {
  variant: ModeVariant;
  value: PermissionMode;
  onPick: (m: PermissionMode) => void;
}) {
  return (
    <div className="fr-screen">
      <div className="fr-brand"><AppMark size={22} />{NAME}</div>

      {/* A — A CARD OF ITS OWN, ALL FOUR. The strongest thing to show on a
          call, and the most expensive: it is a whole beat, and the beat is
          spent on a question most people will answer by pressing Submit. */}
      {variant === 'a' && (
        <div className="fr-stack">
          <h1 className="fr-page">{MODE_COPY.page}</h1>
          <div className="fr-card">
            <div className="fr-q">{MODE_COPY.q}</div>
            <ModeRows modes={MODE_ORDER} value={value} onPick={onPick} />
            <button className="fr-submit">{COPY.submit}</button>
          </div>
          <p className="fr-note">{MODE_COPY.note}</p>
          <p className="fr-note" style={{ marginTop: 6 }}>{MODE_COPY.rules}</p>
        </div>
      )}

      {/* B — THE SAME CARD, TWO DOORS. Manual, Accept edits, Plan and Don't ask
          are all real Claude Code modes and almost nobody picks one on their
          first day; leaving them to Settings turns a six way decision into a
          yes or no. The switch is the walk's own control, the one the finish
          card uses for Every project and Only this project. */}
      {variant === 'b' && (
        <div className="fr-stack">
          <h1 className="fr-page">{MODE_COPY.page}</h1>
          <div className="fr-card">
            <div className="fr-switch">
              <button className={value === 'bypassPermissions' ? 'fr-side' : 'fr-side on'} onClick={() => onPick('auto')}>
                {MODE_WORDS.auto}
                <span className="fr-side-n">{MODE_COPY.tick}</span>
              </button>
              <button className={value === 'bypassPermissions' ? 'fr-side on' : 'fr-side'} onClick={() => onPick('bypassPermissions')}>
                {MODE_WORDS.bypassPermissions}
              </button>
            </div>
            <p className="fr-q" style={{ padding: '12px 18px 16px' }}>
              {MODE_SENTENCE[value === 'bypassPermissions' ? 'bypassPermissions' : 'auto']}
            </p>
            <button className="fr-submit">{COPY.submit}</button>
          </div>
          <p className="fr-note">Manual, Accept edits, Plan and Don't ask are in Settings, with everything else.</p>
          <p className="fr-note" style={{ marginTop: 6 }}>{MODE_COPY.rules}</p>
        </div>
      )}

      {/* E — ON THE FINISH CARD, over the agents she is already being offered.
       */}
      {variant === 'e' && (
        <>
          <div className="fr-finish wide" role="status">
            <h1 className="fr-finish-head">{COPY.finishHead}</h1>
            <p className="fr-finish-line">{COPY.finishLine}</p>
            {/* THE MODE BLOCK, in the same shape as the agent block under it:
                one line saying what it is, the switch, and the sentence at the
                foot. It is the offer block's own markup with two words instead
                of a list, so the card gains a section and no new component. */}
            <div className="fr-offer">
              <div className="fr-offer-say">{MODE_COPY.finishQ}</div>
              <div className="fr-switch" role="tablist">
                <button
                  role="tab"
                  aria-selected={value !== 'bypassPermissions'}
                  className={value === 'bypassPermissions' ? 'fr-side' : 'fr-side on'}
                  onClick={() => onPick('auto')}
                >{MODE_WORDS.auto}</button>
                <button
                  role="tab"
                  aria-selected={value === 'bypassPermissions'}
                  className={value === 'bypassPermissions' ? 'fr-side on' : 'fr-side'}
                  onClick={() => onPick('bypassPermissions')}
                >{MODE_WORDS.bypassPermissions}</button>
              </div>
              <p className="fr-offer-read">
                {MODE_SENTENCE[value === 'bypassPermissions' ? 'bypassPermissions' : 'auto']}{' '}
                {MODE_COPY.rules}
              </p>
            </div>
            <div className="fr-offer">
              <div className="fr-offer-say">{COPY.agentsOffer}</div>
              <div className="fr-switch" role="tablist">
                <button role="tab" aria-selected className="fr-side on">
                  {COPY.agentsAll}<span className="fr-side-n">3</span>
                </button>
                <button role="tab" aria-selected={false} className="fr-side">
                  {COPY.agentsHere}<span className="fr-side-n">0</span>
                </button>
              </div>
              <div className="fr-list">
                {[
                  ['Leon Okafor QA', `QA agent that embodies the persona of Leon Okafor, a founder being onboarded to ${NAME}.`],
                  ['Localhost QA', 'Validate frontend changes against the running app.'],
                  ['Docs Reviewer', 'Review developer documentation for accuracy against the codebase.'],
                ].map(([name, line]) => (
                  <button key={name} className="fr-agent on">
                    <span className="fr-tick">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12.5 9.5 18 20 6.5" />
                      </svg>
                    </span>
                    <span className="grow">
                      <span className="fr-agent-name">{name}</span>
                      <span className="fr-agent-line">{line}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="fr-offer-read">{COPY.agentsRead}</p>
            </div>
            <button className="fr-finish-go">{COPY.finishGo}</button>
          </div>
        </>
      )}
    </div>
  );
}
