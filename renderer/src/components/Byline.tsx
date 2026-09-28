// The task header stays plain text. only the lowest working indicator, at
// the conversation foot in Live.tsx, may use lattice + shimmer. Byline
// still owns the same status, timing, location and change figures.

import { useEffect, useState, type ReactNode } from 'react';
import { bylineFacts, WHERE_LINE, type BylineFacts, type EngineFacts, type WhereFacts } from '../byline';
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
 * row cannot break it wherever it likes: that is's finding, where a row of
 * loose text nodes beside a 339px card wrapped onto three lines. `.fm-said`
 * shortens this with an ellipsis instead. */
function Said({ parts }: { parts: (string | null)[] }) {
  const kept = parts.filter(Boolean) as string[];
  return <span className="fm-said">{kept.join(' · ')}</span>;
}

export function Byline({ item, facts, returned, figures }: {
  item: WorkItem;
  facts: LiveFacts & WhereFacts & EngineFacts;
  /**
   * She snoozed it and its moment came round. The line does not say this in
   *  words; the chip beside it does, exactly as it did before. */
  returned?: boolean;
  /** The change figures, drawn by Focus and passed in whole. */
  figures?: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  const running = !!facts.session;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const f: BylineFacts = bylineFacts(item, { ...facts, now });

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
      <Said parts={[f.whereWord, f.engineWord, f.age
        ? (isTroubleRow(item) ? `nothing has started for ${f.age}`
          : isUpdateRow(item) ? `downloaded ${f.age} ago`
            : `last moved ${f.age} ago`)
        : null]} />
      {/* THE BLOCKED CHIP IS GONE AND THE WORD IS NOT. The old line had no room
          for the fact anywhere, so it was carried by a red chip on the end; this
          line says "Blocked" in the where slot, in the same place it says "In
          progress" and "In your inbox", which is where she looks for it. Drawing
          both would be the same word twice on a line she has already called too
          crowded. The snooze chip stays: nothing on the line says that. */}
      {returned && <span className="chip chip-returned">back from snooze</span>}
      {figures}
    </div>
  );
}
