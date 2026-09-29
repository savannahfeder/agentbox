// THE PRACTICE PROJECT.
//
// So this is not a mock and not a card. It is a real project in the real store,
// with real work items in it, and the whole app is scoped to it for the length
// of the walk. What tells somebody it is not theirs is a band across the top
// that never leaves, not the size of it.
//
// WHY IT EXISTS AT ALL is a tester, on a call of 2026-08-23: they opened Agentbox,
// saw a real task on a real screen and read it as work. Their words were that they
// thought the task was to set up the project and that it was asking them
// questions to do the setup, and they tried to answer the placeholder text.
//
// Everything here is content, no window and no filesystem, so both halves can
// read it: the renderer draws the walk off ../renderer/src/onboarding.ts and
// the main process writes the rows off here.

/**
 * What the practice project is called, on its own row in the rail and in the
 *  compose card. The slug is derived from it the same way any project's is. */
import { NAME } from '../shared/product-name.mjs';
export const PRACTICE_NAME = 'Practice';
export const PRACTICE_SLUG = 'practice';

/**
 * The mark in project.json. `listProducts` reads it out so the rest of the app
 *  can tell a practice project from a real one without matching on a name
 *  somebody could give a real project of their own. */
export const PRACTICE_FLAG = 'practice';

/**
 * THE ONE TASK THEY SEND THEMSELVES. Written for them, because the beat is
 *  about pressing ⌘↵ and not about thinking of something to ask.
 *
 * AND IT NAMES THE PRETEND APP, WHICH IS THE WHOLE FIX. It read `Add a sign-out
 * button to the header.` over `This one is written for you. Both halves failed
 * her at once. The title is an imperative sentence with no subject and no app
 * in it, so the only app on the screen — the one she is looking at — is the one
 * it appears to be about; and the reassurance underneath is about the CARD
 * rather than about the sentence above it, so it reads as being about some
 * other thing entirely.
 *
 *  IT STAYS A REQUEST, AND THAT IS DELIBERATE. It was written in the past tense
 *  for one build, to match the four rows already waiting in the practice
 *  inbox, and it broke the beat it belongs to. THIS IS THE ONE ROW SHE SENDS:
 *  she reads it, presses ⌘↵ on a button that says `Start it`, and two seconds
 *  later `PRACTICE_ANSWER` comes back saying `Done, and the tests pass.` A
 *  title reading `Added a sign-out button` sits above a Start button asking her
 *  to start something the card says is already finished, and is then answered
 *  `Done`; the three sentences stop making sense as a sequence. The other four
 *  rows are past tense because they are already answered when she meets them.
 *  This one is a request because a request is what it is, and every real work
 *  item in Agentbox is named that way.
 *
 *  SO THE APP'S NAME IS THE FIX, NOT THE TENSE. `Practice` is the pretend project — the name in the
 *  rail, in the band across the top, in the compose card's own "For Practice."
 *  clause, and in the sidebar note's `practice.local:4000`. There is no second
 *  pretend name to invent; the one the walk already says everywhere is the one
 *  that goes in the sentence. The body then says the two things that kill her
 *  reading outright: it is not her code, and it is not Agentbox.
 *
 *  BOTH STRINGS SHOW AT ONCE. `Compose` types the title into the box and then
 *  appends a blank line and the body (renderer/src/components/Compose.tsx), so
 *  what she reads at beat ten is these two paragraphs together, under the
 *  practice band and over a "Start it ⌘↵" button. They have to make sense as
 *  one card, which is why the body opens by naming the app the title names. */
export const PRACTICE_TASK = {
  title: 'Add a sign-out button to the Practice app.',
  body: `Practice is a pretend project, not your code and not ${NAME}. This one is written for you already.`,
};

/**
 * AND WHAT COMES BACK. The old walk read a readme out of the folder they chose
 *  (main/first-run.mjs) because the task ran against their own project. This
 *  one runs against a project that is not real, so the answer is written down
 *  here: it is a decision an agent made on its own and told them about, which
 *  is the shape the next beat teaches them to close.
 *
 * IT STILL TAKES TWO SECONDS AND IT IS STILL A REAL ROW WITH A REAL RESULT ON
 * THE REAL LEDGER.*/
export const PRACTICE_ANSWER =
  'Done, and the tests pass. I put it next to the avatar rather than inside the menu. Say the word and I will move it.';

/**
 * WHAT IS IN THE PRACTICE PROJECT'S SIDEBAR NOTE.
 *
 * AND IT IS NOT A GOALS FORM, which is what the first cut of it turned into. The
 * sentence above is her saying what SHE keeps in hers, as an example; the note
 * that shipped had two headings, **Goals this week** and **Next steps**, and
 * nothing else, which reads as the two things this panel is for. So the sample
 * shows a MIX now — a decision, a number, a link, one thing to do next —
 * because the lesson is that anything can go here, and a sample of one kind
 * teaches the opposite.
 *
 *  So the practice project's note is not a placeholder and not a lorem line. It
 *  is what a founder's own note looks like, and it is on the screen for every
 *  beat of the practice, because the panel it draws in is per project and the
 *  whole app is scoped to this one while the walk is on.
 *
 *  IT IS THE SAME TEXT IN BOTH PLACES. `createPractice` writes it to the
 *  project's `pinned.md`, which is the real file the sidebar reads
 *  (main/rail-note.mjs), and the third introduction slab draws it beside the
 *  words. A note the introduction promises and the practice project then does
 *  not have is the sort of quiet lie the walk has been caught in twice.
 *
 *  SHORT ON PURPOSE. The panel is 322px wide with 12px of padding either side,
 *  so a line much past forty characters wraps, and a wrapped goal reads as a
 *  paragraph rather than a goal. */
export const PRACTICE_NOTE = [
  'Sessions are cookies, not tokens.',
  '',
  '15 new users this week. At 6.',
  '',
  'Staging: practice.local:4000',
  '',
  'Next: talk to the five who churned.',
].join('\n');

/* * * THE FOUR WAITING ROWS, and processing them is the point of beats thirteen, * fourteen
 and fifteen. * * EACH ONE IS A WHOLE CONVERSATION NOW, NOT A TITLE AND A LINE.What she had
 * opened was beat twelve, where the reading pane said "Nothing has been said * here yet."
 under the title. These rows were a title, a one-line result and * nothing else, so the one
 surface in the whole walk that shows what Agentbox * actually holds was blank. * * So every
 row carries three things: `body`, the sentence a person typed to * start it; `trace`, the
 lines the run wrote while it worked, in the exact * shape `traceStreamLine` in
 main/supervisor.mjs writes a real one; and * `result`, the finished word. The store writes
 all three (`stagePracticeRows` * and the trace beside it), and the reading pane draws them
 with the same * components it draws a real run with. NOTHING IS MOCKED AND NO COMPONENT *
 KNOWS THESE ROWS EXIST. * * THE TRACE LINE FORMAT IS NOT DECORATION. `HH:MM:SS [Tool]
 argument` is what * the supervisor writes and what renderer/src/item-thread.ts parses back
 into * the quiet work lines of a thread; a line that is not a tool call is the * agent
 talking. Get the two spaces wrong and the thread draws the timestamp * as part of the
 sentence. * * THEY NO LONGER SAY "Example" IN THEIR OWN TITLES, and that is a deliberate *
 change with her older word behind it. These sit in a project called Practice, * under a
 band reading "nothing in here is saved", in a walk that said the same * thing on a screen
 of its own two beats earlier. The band is the stronger * version of her fix, and it is on
 screen the whole time. The old copy is kept * in decisions.md, 2026-08-23. * * AND EACH ONE
 IS A DIFFERENT SHAPE, WITH A DIFFERENT RIGHT MOVE ON IT. The * flags are fields here rather
 than guesses made from the kind, because which * row is which IS the lesson and it must not
 be inferable wrongly: * * two are FINISHED, and E is right on them (`clear`) * one is
 `later`, real work that is nobody's emergency (`snooze`) * one is `waiting`, an agent
 stopped on a question (`unblock`) * * Closing the last two is the one move the product
 exists to stop somebody * making, which is why they get beats of their own rather than a
 fourth press * of E.
*/
export const PRACTICE_ROWS = [
  {
    kind: 'task',
    title: 'Added the sign-in route. Tests green.',
    body: 'Add a sign-in route at /sign-in. Reuse whatever we already have for sessions.',
    trace: [
      'Reading how auth works here before I touch anything.',
      '[Read] src/server/auth.ts',
      '[Read] src/server/routes.ts',
      '[Grep] createSession',
      'There is already a signed session cookie in here, seven days, refreshed on use. I will reuse it rather than adding tokens, because two ways to be signed in is the bug that follows.',
      '[Write] src/server/routes/sign-in.ts',
      '[Edit] src/server/routes.ts',
      '[Edit] src/server/auth.ts',
      '[Bash] npm test -- auth',
      'Fourteen tests, all green, and nothing else in the suite moved.',
    ],
    result: 'I reused the session cookie rather than tokens. Say if you disagree.',
    agoMs: 6 * 60_000,
  },
  {
    kind: 'task',
    title: 'Fixed the flaky checkout test.',
    body: 'checkout.spec.ts fails about one run in five on CI and passes every time on my Mac. Find out why.',
    trace: [
      '[Bash] npx vitest run checkout.spec.ts --repeat 20',
      'Three failures in twenty, every one of them on the same assertion, so it is a race and not the assertion.',
      '[Read] tests/checkout.spec.ts',
      '[Read] tests/fixtures/cart.ts',
      'The fixture writes the cart and returns before the write lands. The test reads it straight away, so on a slow machine it reads an empty cart.',
      '[Edit] tests/fixtures/cart.ts',
      '[Bash] npx vitest run checkout.spec.ts --repeat 40',
      'Forty for forty. I changed the fixture and nothing in the test itself.',
    ],
    result: 'It was a race on the fixture. It awaits now. Nothing else changed.',
    agoMs: 14 * 60_000,
  },
  /* * THE ONE THAT IS NOT FOR TODAY, and snoozing it is the point of beat fourteen.

     IT HAD TO BE A FOURTH SHAPE OF ROW, not one of the three already here. Two
     of those are finished, so E is right on them, and the third is an agent
     stopped, where answering is the only right move. Snoozing either would be
     teaching the key on a row it is wrong for, which is the exact fault round
     four was opened about. This one is real work, it is nobody's emergency, and
     half a day is the reason to put it off rather than an excuse: that is the
     row S exists for.
  */
  {
    kind: 'task',
    later: true,
    title: 'The check runs are 40 seconds slower than Monday.',
    body: 'CI got slower this week and nobody changed the workflow. Find out what did it.',
    trace: [
      '[Bash] gh run list --limit 40 --json databaseId,createdAt,conclusion',
      'Monday it was 2m14s and today it is 2m54s, and the step that grew is the type check rather than the tests.',
      '[Read] .github/workflows/ci.yml',
      '[Read] tsconfig.json',
      '[Bash] npx tsc --noEmit --extendedDiagnostics',
      'The type check now runs over every package instead of the ones that changed, because the project references came out of tsconfig in the pnpm move.',
      'Putting them back means splitting the config per package and re-pointing the workflow. It is about half a day and nothing is broken while it waits.',
    ],
    result: 'It is the type check running over every package. The fix is half a day of config, and nothing breaks while it waits.',
    agoMs: 22 * 60_000,
  },
  /*
   * THE ONE THAT IS WAITING. It is a question, it is not finished, and an agent
     is stopped on it until somebody answers. Its result carries the options,
     because `optionsFrom` in renderer/src/format.ts reads the offer off the
     result first, and the options are what make answering it one key. */
  {
    kind: 'question',
    waiting: true,
    title: 'Delete 340 lines of dead code?',
    body: 'Have a look for anything in src/ that nothing imports.',
    trace: [
      '[Bash] npx knip --include files,exports',
      '[Read] src/lib/legacy-client.ts',
      '[Grep] legacy-client',
      '[Read] src/lib/format-old.ts',
      '[Grep] formatOld',
      'Three files, 340 lines. Nothing in src/ imports any of them and nothing in tests/ does either.',
      'The legacy client is the one I would ask about: it is the only thing left that speaks to the v1 API, so if anything outside this repository still calls that, deleting it is the end of it.',
    ],
    result: [
      'Nothing imports any of the three, so this is safe on my side, but the legacy client is the last thing that speaks v1 and I would rather you said so.',
      '',
      '## Options',
      '1. Delete all three (recommended)',
      '2. Keep the legacy client, delete the other two',
      '3. Leave all of it alone',
    ].join('\n'),
    agoMs: 31 * 60_000,
  },
];

/**
 * THE WALK'S OWN TASK, AS A CONVERSATION. The person sends it at beat nine and
 *  opens it at beat eleven, and until 2026-08-24 what they opened was the words
 *  "Nothing has been said here yet." under the title: the row had a result and
 *  no thread at all. This is the run behind `PRACTICE_ANSWER`, in the same
 *  shape as the traces above, so the first task anybody opens in Agentbox shows
 *  them what a task holds. */
export const PRACTICE_TASK_TRACE = [
  '[Read] src/components/Header.tsx',
  '[Grep] useSession',
  'The header already knows who is signed in, so this is one button and one call.',
  '[Edit] src/components/Header.tsx',
  '[Bash] npm test -- header',
  'Green. I put it beside the avatar rather than inside the menu, because the menu is three clicks deep on mobile.',
];
