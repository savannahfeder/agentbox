// WHO GETS OFFERED THE TUTORIAL, AND WHERE THEY LAND WHEN IT IS OVER.
//
// Three small rules in a file of their own, for the same reason
// ./walk-staging.ts and ./compose-project.ts are: each one is a branch that
// would be invisible in a diff and is the whole of a behaviour the founder
// asked for by name.
//
// WHERE IT COMES FROM. The founder ran the onboarding with a tester, the least
// technical user she has interviewed. a tester wanted the practice round again
// and could not find it:
//
// a tester: "Okay, so I thought when I press, um, go back to practice, I go to
// practice, I can start again....
//
// She found it because she was told out loud, mid-call.
//
// ---------------------------------------------------------------------------
// THE JUDGEMENT THIS FILE HOLDS: HOW LOUDLY, AND TO WHOM.
//
// a dense screen is a failed screen, and nothing may read as nagging. And the
// specific one on this row: a person making their fifth project must not be
// offered a tutorial the same way a person making their first is.
//
// The rule is therefore NOT A COUNT OF PROJECTS. A count answers the wrong
// question. a tester was not on her first project — she had been through the
// whole onboarding and had projects already — and she is precisely the person
// the offer is for. What separates her from the power user on their fifth
// project is not how many projects they have. It is whether this app has ever
// ASKED THEM. a tester had never been asked. The power user has.
//
// So the offer is a card the first time, and after it has been answered — taken
// or turned down, it does not matter which — it is never a card again. It is
// asked once, ever, on the one moment in the app where somebody has just said
// they are about to start work somewhere new.
//
// AND FINISHING THE WALK COUNTS AS AN ANSWER. Somebody who has just been shown
// around does not need offering; that is the same nagging read one step later.
// SKIPPING IT DOES NOT COUNT, and that is deliberate: the way out of the walk
// is low-key by her design, somebody who took it has seen none of the practice,
// and the next project they make is exactly the moment they might want it after
// all. That is one card, once, and then never.
//
// WHAT THE PERSON WHO SAYS NO IS TOLD is the other half of her ask, and it is
// the only place in the app where saying where the tutorial lives is worth a
// sentence: they have just proved they know it exists and decided not to take
// it. `COPY.offerLater` names the key AND the word to type, because "hit
// Command+K" on its own is what did not work on the call.

const OFFER_KEY = 'zero.tutorial.offered';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * WHETHER THE CARD MAY BE DRAWN AT ALL. Unwritten means never asked, which is
 *  every install that existed before this row, including the founder's own —
 *  so the first project she makes after this lands offers it once, which is
 *  what she asked for. */
export function neverOffered(store: Store): boolean {
  try { return store.getItem(OFFER_KEY) !== '1'; } catch { return false; }
}

/**
 * THE ANSWER, WRITTEN DOWN. Called on both buttons and at the end of any walk
 *  that reached the practice, so the question is asked once and then never.
 *
 *  A refusal to write is swallowed, and the fallback is the QUIET one: a full
 *  disk means the card may be offered again, which is a repeated question, and
 *  a repeated question is the thing being avoided. `neverOffered` therefore
 *  answers false when the store cannot be read at all. */
export function rememberOffered(store: Pick<Storage, 'setItem'>): void {
  try { store.setItem(OFFER_KEY, '1'); } catch { /* see above */ }
}

/**
 * WHETHER MAKING THIS PROJECT OFFERS THE TUTORIAL.
 *
 *  `walking` is whether a walk is on the screen right now, and it vetoes
 *  everything: the onboarding makes projects of its own on the way through, and
 *  a card offering the practice round to somebody eight beats into it would be
 *  the app interrupting itself. It cannot happen today — the new project card
 *  is not reachable during the walk — but the veto is stated rather than
 *  assumed, because "not reachable" is a fact about this month's screens.
 *
 *  `made` is whether the store really took the project. Nothing is offered off
 *  the back of a failure. */
export function offerOnNewProject(p: { made: boolean; walking: boolean; offered: boolean }): boolean {
  return p.made && !p.walking && !p.offered;
}

/**
 * WHERE THE PERSON COMES BACK TO WHEN THE TUTORIAL IS OVER.
 *
 *  The walk points the compose card at the practice project for the beats that
 *  file into it, and `finishRun` hands that slot back to `run.product` at the
 *  end. An onboarding run has a product because it made one; a TUTORIAL run
 *  makes nothing, so it has to carry the project the person was already in, or
 *  the slot is handed back to null and their next task is addressed to whatever
 *  happens to be first on the row.
 *
 *  Two candidates in order: the project the app is filtered to (they are
 *  looking at it) and the project the compose card is already pointed at. A
 *  practice project is refused outright — handing the slot back to the very
 *  thing the walk is about to delete is the fault this whole round was opened
 *  about — and so is a slug naming nothing, because a slot pointing at a
 *  project that is not there is worse than an empty one. */
export function comeBackTo(
  products: readonly { slug: string; practice?: boolean }[],
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const slug of candidates) {
    if (!slug) continue;
    const found = products.find((p) => p.slug === slug);
    if (found && found.practice !== true) return found.slug;
  }
  return null;
}
