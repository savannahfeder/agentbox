// PURE. WHAT THE APP CAN HAVE OPEN OVER IT, and why none of it may outlive the
// first run.
//
// THE CARD IS <NewProject>, which is the only thing in Agentbox that asks both of
// those in one breath: a field saying "What is the project called?" over a
// sentence saying "Its code is in <folder>". What is worth writing down is not
// which card it was. It is how a card gets onto her inbox without anybody
// opening it there, and the route is three ordinary steps with no mistakes in
// them:
//
// 1. She presses Return, which is the key the eighteen beats before this one
// have been teaching. With nothing typed, the first row of the palette is "New
// project…" (components/Palette.tsx), so Return opens that card and closes the
// palette. 3. Closing the palette is the exact event that ends the ⌘K beat, so
// the finish card arrives in the same frame. The walk is drawn last in App's
// tree, so the finish card covers the new project card completely and nobody
// can tell it is there.
//
// Then the walk ends, the finish card goes, and what is underneath it is a
// card asking for a project name on top of her own inbox. Measured on the
// built renderer, 2026-09-02:
// `scripts/probe-the-card-left-over-the-inbox.mjs`.
//
// SO THE RULE IS APPLIED TO THE STATE, ONCE, and not to the door. There are
// four doors into that card — the composer, the palette, the Settings screen
// and the import card — and the palette alone has rows that open the theme
// picker, the standing instructions, Settings and the import card as well.
// Patching the one a tester found is how the next one gets missed. This is the
// same lesson `./modal-scope.ts` writes down about a modal outliving its task,
// and it is written here rather than there because that rule is about leaving a
// TASK and this one is about leaving the WALK.
//
// AND IT HOLDS AT BOTH ENDS. The walk covers the whole window, so a screen that
// is open when a walk STARTS is just as invisible and comes back just as
// surprisingly at the end of it. `walkAgain` and `startTutorial` both close
// what floats for that reason; they already closed `modal` and nothing else,
// which is the same half-applied rule from the other side.

/**
 * Everything the app can have drawn OVER the inbox. One name per `{x && (…)}`
 *  overlay in App.tsx, so the list can be checked total against the file:
 *  `tests/nothing-the-app-had-open-outlives-the-walk.test.mjs` fails on an
 *  overlay that has been added and not sorted. */
export const FLOATS_OVER_THE_APP = ['modal', 'settings', 'importAgents', 'newProject'] as const;

export type Floating = (typeof FLOATS_OVER_THE_APP)[number];

/**
 * What is open right now. `modal` is one piece of state with several values
 *  (see `EVERY_MODAL` in ./modal-scope); the other three are their own flags. */
export type OpenOverTheApp = {
  modal: string | null;
  settings: boolean;
  importAgents: boolean;
  newProject: boolean;
};

export const NOTHING_OVER_THE_APP: OpenOverTheApp = {
  modal: null, settings: false, importAgents: false, newProject: false,
};

/** Whether anything at all is drawn over the app. */
export function anythingOverTheApp(open: OpenOverTheApp): boolean {
  return !!open.modal || open.settings || open.importAgents || open.newProject;
}

/**
 * WHAT IS OPEN ONCE THE WALK LETS GO, which is nothing.
 *
 *  IT IS CONSTANT ON PURPOSE, and it is still a function rather than a bare
 *  value because a rule with one answer is only worth having if a test can be
 *  total over it. Nothing here is a judgement call about which overlay is
 *  friendly: the walk owned the whole window, so it hands the whole window
 *  back, and anybody who wanted one of these screens is one press away from it
 *  in an app they can now see. */
export function afterTheWalk(_open: OpenOverTheApp): OpenOverTheApp {
  return NOTHING_OVER_THE_APP;
}
