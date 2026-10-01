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
// EVERYDAY WORK, NOT CODE (2026-10-01). It was a sign-out button for a pretend
// app, and the four rows below were a sign-in route, a flaky test, a slow CI run
// and dead code. A persona test of an executive assistant found all of it
// written for programmers. A meeting summary, a reply, a tidy list, a budget and a
// date are work everybody on a team does, engineers included.
export const PRACTICE_TASK = {
  title: 'Add a summary to the Practice meeting notes.',
  body: `Practice is a pretend project, not your work and not ${NAME}. This one is written for you already.`,
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
  'Done, and it is five lines at the top of the notes: three decisions and two open questions. Say the word and I will make it shorter.';

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
    title: 'Drafted a reply to the venue.',
    body: 'Draft a reply to the venue for the offsite. We want Thursday, not Friday, and ask whether lunch is included.',
    trace: [
      'Reading what the venue has already said before I write anything.',
      '[Read] Venue emails.pdf',
      '[Read] Offsite plan.docx',
      '[Grep] lunch',
      'They offered Friday twice, and their price list says lunch costs extra on weekdays, so I asked rather than guessed.',
      '[Write] Reply to the venue.docx',
      'Four sentences, ready for you to send.',
    ],
    result: 'The draft asks for Thursday and whether lunch is included. It is ready for you to send.',
    agoMs: 6 * 60_000,
  },
  {
    kind: 'task',
    title: 'Tidied the team contact list.',
    body: 'Clean up the team contact sheet. Remove the duplicates and sort everyone by last name.',
    trace: [
      '[Read] Team contacts.xlsx',
      'Forty two rows, and six of them are the same person twice with a different spelling.',
      '[Edit] Team contacts.xlsx',
      '[Read] Team contacts.xlsx',
      'Thirty six people now, sorted by last name.',
      '[Grep] email',
      'Two people have no email address, so I put them at the bottom rather than guess one.',
    ],
    result: 'Six duplicates are gone and everyone is sorted by last name. Two people have no email, so they are at the bottom.',
    agoMs: 14 * 60_000,
  },
  /* * THE ONE THAT IS NOT FOR TODAY, and snoozing it is the point of beat fourteen.

     IT HAD TO BE A FOURTH SHAPE OF ROW, not one of the three already here. Two
     of those are finished, so E is right on them, and the third is an agent
     stopped, where answering is the only right move. This one is real work, it
     is nobody's emergency, and a week is the reason to put it off rather than
     an excuse: that is the row S exists for. */
  {
    kind: 'task',
    later: true,
    title: 'The budget draft for next quarter is ready.',
    body: "Pull last quarter's spending into a first draft of next quarter's budget.",
    trace: [
      '[Read] Spending last quarter.xlsx',
      '[Read] Plan for next quarter.docx',
      'Spending was close to plan except travel, which ran about a fifth over.',
      '[Write] Budget draft.xlsx',
      '[Edit] Budget draft.xlsx',
      'Every line is filled in. It needs about an hour of your time to check, and nothing is due until next week.',
    ],
    result: 'It is ready for you to check. It needs about an hour, and nothing is due until next week.',
    agoMs: 22 * 60_000,
  },
  /*
     THE ONE AN AGENT IS STOPPED ON, and it stays stopped until somebody answers.
     Its result carries the options, because `optionsFrom` in
     renderer/src/format.ts reads the offer off the result first, and the
     options are what make answering it one key. */
  {
    kind: 'question',
    waiting: true,
    title: 'Which date should I send for the team dinner?',
    body: 'Find a date for the team dinner that works for everyone, and ask me before you send it.',
    trace: [
      '[Read] Team calendar.ics',
      '[Grep] out of office',
      '[Read] Restaurant bookings.pdf',
      'Two evenings work for everyone: Thursday the 12th and Tuesday the 17th.',
      'The restaurant has a table for twelve on both, but only the 12th has the private room.',
      'I have not sent anything yet, as you asked.',
    ],
    result: [
      'Two dates work for everyone. I would pick the 12th, because it is the only one with the private room.',
      '',
      '## Options',
      '1. Thursday the 12th (recommended)',
      '2. Tuesday the 17th',
      '3. Ask the team to vote',
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
  '[Read] Meeting notes.docx',
  '[Grep] decided',
  'Three things were decided and two were left open, so the summary says which is which.',
  '[Edit] Meeting notes.docx',
  'Five lines at the top. I kept the name of whoever owns each open question.',
];
