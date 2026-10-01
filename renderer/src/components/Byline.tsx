// The task header stays plain text. only the lowest working indicator, at
// the conversation foot in Live.tsx, may use lattice + shimmer. Byline
// still owns the same status, timing, location and change figures.

import { useContext, useEffect, useState, type ReactNode } from 'react';
import { bylineFacts, WHERE_LINE, type BylineFacts, type EngineFacts, type WhereFacts } from '../byline';
import { TeamContext } from '../team/people';
import { AddPeople, TeamPeople, TeamSaid, teamHeld } from '../team/TeamFocus';
import { isTroubleRow } from '../trouble-row';
import { isUpdateRow } from '../update-row';
import type { LiveFacts } from '../live-line';
import type { WorkItem } from '../types';

// The clock, while a run is up: the same 15 seconds `Live.tsx` uses, and for
// the same reason. The reading is in whole minutes, so this only has to be fast
// enough that a minute boundary is not visibly late.
const TICK_MS = 15_000;

/**
 * The dotted list, from whichever fragments are true. ONE element, so the flex
 * row cannot break it wherever it likes: that was a measured finding, where a row of
 * loose text nodes beside a 339px card wrapped onto three lines. `.fm-said`
 * shortens this with an ellipsis instead. */
function Said({ parts }: { parts: (string | null)[] }) {
  const kept = parts.filter(Boolean) as string[];
  return <span className="fm-said">{kept.join(' · ')}</span>;
}

export function Byline({ item, facts, returned, figures, tail, onAddPeople }: {
  item: WorkItem;
  facts: LiveFacts & WhereFacts & EngineFacts;
  /**
   * She snoozed it and its moment came round. The line does not say this in
   *  words; the chip beside it does, exactly as it did before. */
  returned?: boolean;
  /** The change figures, drawn by Focus and passed in whole. */
  figures?: ReactNode;
  /** WHAT SHE CAN DO TO THE TASK ITSELF, at the right-hand end of the line that
   *  says what the task is (w-581dbc6cc4). Closing a task had no control
   *  anywhere inside an opened task: E did it and the palette did it, and
   *  nothing on the screen said so, so a task could not be closed by anyone who
   *  did not already know the E shortcut.
   *
   *  It goes on this line rather than under the conversation because closing is
   *  a verdict on the row and not something said to the agent, and this line is
   *  where the row's own state is already written. It follows `figures` for the
   *  same reason figures is last: both close the byline at the pane's right
   *  edge, which is where a control on this line belongs. */
  tail?: ReactNode;
  /** Opens New thread with a conversation's people already in To. Only a
   *  conversation draws the control that calls it (../team/TeamFocus AddPeople),
   *  so passing it on a task page adds nothing to the line. */
  onAddPeople?: (who: { to: string; also: string[] }) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const running = !!facts.session;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const f: BylineFacts = bylineFacts(item, { ...facts, now });
  // A TASK GIVEN TO A PERSON (the team version) says who it is with and when
  // it is due instead, and nothing about agents: none is on it.
  const team = useContext(TeamContext);
  // ADD PEOPLE SITS BESIDE THE FACES, on a conversation and nowhere else. It is
  // in both branches because whether this line is the team's one depends on the
  // row having been handed to somebody, and a conversation's page is a
  // conversation either way. The control itself draws nothing off a
  // conversation, so the second copy costs no ink.
  const addPeople = onAddPeople
    ? <AddPeople product={team?.products.get(item.product) ?? null} onAdd={onAddPeople} />
    : null;
  if (teamHeld(item, team)) {
    return <div className="focus-meta by-lead">
      <TeamSaid item={item} />
      <TeamPeople item={item} />
      {addPeople}
      {figures}
      {tail}
    </div>;
  }

  return (
    // The whole thing said at length, because a mark and three fragments is a
    // picture and a picture has to be captioned.
    <div className="focus-meta by-lead" aria-label={f.line} title={WHERE_LINE[f.where]}>
      {f.stateWord && <span className="live-word">{f.stateWord}</span>}
      {f.span && <span className="live-span">{f.span}</span>}
      {/* THE QUIET FACTS BEHIND IT. `age` is null while a run is up, so a
          running row carries one clock and not two — see `lastChange` in
          byline.ts for the measurement that caused that. */}
      {/* THE ROW THAT SAYS NOTHING IS RUNNING READS ITS CLOCK THE OTHER WAY
          (w-cf0e8821b3). "Last moved 1h ago" is a sentence about a row that has
          moved, and this one has never moved: the time on it is how long her
          tasks have been stopped, which is the only fact it exists to carry. */}
      {/* AND SO DOES THE ROW THAT SAYS A NEW VERSION IS READY (w-86452550e5).
          Its clock is how long the download has been sitting on the disk
          waiting for her, which is the one fact "last moved" would get wrong. */}
      <Said parts={[f.project, f.whereWord, f.engineWord, f.age
        ? (isTroubleRow(item) ? `nothing has started for ${f.age}`
          : isUpdateRow(item) ? `downloaded ${f.age} ago`
            : `last moved ${f.age} ago`)
        : null]} />
      {/* THE BLOCKED CHIP IS GONE AND THE WORD IS NOT. The old line had no room
          for the fact anywhere, so it was carried by a red chip on the end; this
          line says "Blocked" in the where slot, in the same place it says "In
          progress" and "In your inbox", which is where she looks for it. Drawing
          both would be the same word twice on a line that is already too
          crowded. The snooze chip stays: nothing on the line says that. */}
      {returned && <span className="chip chip-returned">back from snooze</span>}
      {addPeople}
      {/* THE FIGURES COME FIRST AND THE VERB LAST, because the verb is the one
          that closes the line at the right-hand end now (w-581dbc6cc4). That
          end is the slot directly under the three corner marks, and Done has
          it because the Done mark matters more than the code figures, which
          can sit elsewhere. Which of the two takes
          the free space is a margin: `.change-figures` carries the auto one
          and nothing else on this line may. */}
      {figures}
      {tail}
    </div>
  );
}
