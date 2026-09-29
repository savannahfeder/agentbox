// WHICH WALK HAS ALREADY BEEN HANDED ITS WAITING ROWS.
//
// Three lines of logic in a file of their own, for the same reason
// ./compose-project.ts is: the bug it replaces was invisible in a diff.
//
// WHAT IT REPLACES. Beat twelve of the walk — the person has just closed the
// task they sent themselves — is where the four waiting rows are let through
// into the inbox, and the effect that does it in App.tsx guarded itself with
// `const staging = useRef(false)`, flipped true the first time it ran and never
// put back. A ref outlives a walk. ⌘K "Run the onboarding again" sets a brand
// new run on the SAME mounted component, so on a SECOND walk the effect
// returned at the door, `staged` never fired, and the one thing that moves the
// walk off beat twelve never happened. Nothing else fires it and nothing else
// steps to `command`.
//
// The founder's note on a tester's second run: "it ended abruptly in the sense
// of it only had one task and after she hit E she hit inbox zero." That is
// this, exactly: the one task is the one she sent herself at beat nine, E
// closes it, and the inbox is empty because the four rows are held back by
// `walkRows` until the beat that never came. Beats thirteen, fourteen and
// fifteen — the sidebar note, snoozing, unblocking a stopped agent — were all
// missing from her second walk, which is most of what the walk is for.
//
// A RELOAD HID IT. `?firstrun=1` remounts and the ref starts false again, so it
// only ever bit the way she actually re-runs the walk, from ⌘K.
//
// THE KEY IS THE WALK'S OWN TASK. It is a fresh work item per walk and it is
// always set by the time this beat is reached: beat eleven will not advance
// until the row it names is really open. Keyed on it, the guard means what it is
// for — "this walk has already staged" — instead of "this window has".

/**
 * Just enough of a run to answer the question. The walk's own type lives in
 *  ./onboarding.ts and this deliberately does not import it: this module is
 *  about a ref, and coupling it to the walk's whole shape is how a small guard
 *  becomes a thing nobody dares move. */
export interface StagingRun {
  step: string;
  item: string | null;
}

/**
 * THE ONE KEY FOR THIS WALK'S STAGING, or null when the beat is not on.
 *
 *  `opened` is whether a row is open in the reading pane. The beat is reached
 *  with the task still open — that is how it was reached — so staging waits
 *  until it is closed, which is the keypress the beat is about.
 *
 *  A walk with no task id behind it (fixtures, a walk driven straight to a step
 *  by `?firstrun=answer`) gets a constant key rather than null, so it still
 *  stages exactly once instead of every render. */
export function walkStageKey(run: StagingRun | null | undefined, opened: boolean): string | null {
  if (!run || run.step !== 'answer' || opened) return null;
  return run.item ?? 'no-task';
}

/**
 * Whether this key is one the ref has not seen. Separate from the assignment so
 *  a test can drive the same two-walk sequence the founder drove. */
export function needsStaging(seen: string | null, key: string | null): boolean {
  return !!key && seen !== key;
}
