// Canned data for developing and reviewing the UI without live agents.
// Shapes match types.ts exactly; content is written the way the worker brief
// tells real agents to write, so the fixtures double as a schema preview.

import type { AgentSession, FolderListing, Snapshot, WorkspaceSettings } from './types';
// The engine ids, labels and the default are read off the one file that holds
// them rather than typed again here. A fixture that spelled "Claude Code" for
// itself is a fixture that could go on saying it after the app had stopped.
import { DEFAULT_ENGINE, ENGINES } from '../../shared/engines.mjs';
import { BUILT_MODELS } from './models';

const now = Date.now();
const min = 60_000;
const hr = 3_600_000;

export const fixtureSnapshot: Snapshot = {
  products: [
    { slug: 'kestrel', dir: '/fixtures/kestrel', name: 'Kestrel', oneLiner: 'Collectible card games, made beautiful', repoPath: '/Users/you/Desktop/dev/kestrel' },
    { slug: 'onboard', dir: '/fixtures/onboard', name: 'Onboard', oneLiner: 'Employee onboarding that runs itself', repoPath: null },
    { slug: 'thicket', dir: '/fixtures/thicket', name: 'Thicket', oneLiner: 'Strength programming for busy people', repoPath: null },
  ],
  items: [
    // A THREAD, which is the case that had no fixture and therefore no review.
    {
      id: 'w-p0', product: 'kestrel', productName: 'Kestrel', status: 'done', kind: 'question',
      title: 'The card art is finished and nothing is built. The build menu is the step you named before code.',
      body: 'You said "not yet, we still need to design and plan before building." Design ended when you took the economy, so the menu is the only thing between Kestrel and its first line of code. Approving this gets you one page that says what the build menu makes.',
      labels: [], priority: 2, epoch: 4, claim: null,
      createdAt: now - 40 * min, updatedAt: now - 27 * min,
    },
    {
      id: 'w-p1', product: 'kestrel', productName: 'Kestrel', status: 'blocked', kind: 'task',
      parent: 'w-p0',
      title: 'The build menu has never started, six schedules in. One tap tomorrow may be all it needs.',
      body: [
        'Every session this product has been given for two days started within fifteen seconds of you pushing the menu\'s hour, and at that instant the menu is the one row nobody is allowed to touch. So the product gets a drive session instead, and the hour you picked passes with nothing awake to notice it. I recommend a free test: tomorrow after 8am, open the inbox and do anything except push that hour again.',
        '',
        '## Where we were',
        'You have set this row\'s hour six times, most recently a few minutes ago, for 8am tomorrow. Five drive sessions before this one read that as you picking the hour, which it is, and correctly filed nothing.',
      ].join('\n'),
      answer: 'I think the next step is to settle the art style? We may need an image tool to make the assets, not sure how best to turn our art into something we can build with',
      labels: [], priority: 2, epoch: 5, claim: null,
      wrote: { answer: { ts: now - 4 * min, source: 'founder' } },
      createdAt: now - 17 * min, updatedAt: now - 4 * min,
    },
    // The same thread before she has spoken: an agent question answering an
    // agent question. Its parent is named in one line, never quoted, because
    // the body below is that message restated.
    {
      id: 'w-p2', product: 'kestrel', productName: 'Kestrel', status: 'open', kind: 'question',
      parent: 'w-p0',
      title: 'The art needs a house style before any of it is generated.',
      body: 'Three of the five sample cards came back in different lighting, so they cannot sit in one hand together. Fixing that after generation costs more than deciding it now. I recommend one page of style rules, written from the two cards you liked, against [round 3](designs/frame-round-3.html).',
      labels: [], priority: 1, epoch: 1, claim: null,
      createdAt: now - 9 * min, updatedAt: now - 9 * min,
    },
    // CLOSED BY AN AGENT, WITH A BODY THAT NEVER CAUGHT UP. The shape of
    // (2026-08-10): she rejected the premise, the closing session wrote an
    // honest result, and left a title and an opening that still recommend the
    // thing that is not happening. The pane leads with the result for exactly
    // this row.
    {
      id: 'w-p3', product: 'kestrel', productName: 'Kestrel', status: 'done', kind: 'review',
      title: 'The card frames are built, both sizes, and the art is ready. Merging is the only thing left.',
      body: [
        'Someone who opens a booster now sees the new frame, and I recommend merging it. It is two components and one flag, and anyone who opens nothing sees pixel for pixel what they see today. The three sizes are in `designs/frame-round-3.html`.',
        '',
        '## Options',
        '1. Merge it. It rides the next deploy (recommended)',
        '2. Hold it behind the flag for a week',
      ].join('\n'),
      answer: 'Rejected. I do not want the frame changing before the art style is settled.',
      result: 'Closed, because the thing this was blocked on came back as a no. You were asked to pick one of three redesigned frames and you refused all three and the idea behind them, so there is nothing here left to build or merge.\n\nYour rejection stands fully enacted. Nothing was merged, and the branch is still on no other branch. Checked against main just now, not assumed.',
      labels: ['app', 'merge'], priority: 5, epoch: 3, claim: null,
      wrote: { answer: { ts: now - 65 * min, source: 'founder' }, status: { ts: now - 2 * min, source: 'agent' } },
      createdAt: now - 90 * min, updatedAt: now - 2 * min,
    },
    // THE OFFER AT THE END OF A RUN, ON A TASK SHE WROTE HERSELF. The shape
    // this app had no fixture for and therefore no picture of: her own
    // directive, so the body is hers and no worker may touch it, and her reply
    // from an hour ago still sitting on the row. Everything a worker has to say
    // is in the result, including the pick, and the picker reads it there
    // (format.ts, optionsFrom / offerIsLive).
    {
      id: 'w-p4', product: 'kestrel', productName: 'Kestrel', status: 'done', kind: 'directive',
      title: 'The booster opening animation is too slow on the second card.',
      body: 'The booster opening animation is too slow on the second card. It feels fine on the first and then it drags, and by the fifth I am waiting on it rather than watching it.',
      answer: 'Yes, try it at 200ms and show me.',
      result: [
        '**The second card is at 200ms and it is on the branch, ready to merge.**',
        '',
        'All five cards now turn at the same speed, which is what made the second one feel like a stall: it was the only one at 340. A full booster is 1.1 seconds faster end to end, measured on the real build over ten opens, not estimated.',
        '',
        'The one judgement left is the flip on the rare card, which still holds a beat longer on purpose. Merge it as it is, take the beat off the rare card too, or leave it on the branch until you have opened one yourself.',
        '',
        '## Options',
        '1. Merge it (recommended)',
        '2. Take the extra beat off the rare card first',
        '3. Leave it on the branch until I have opened one',
      ].join('\n'),
      labels: ['founder'], priority: 5, epoch: 2, claim: null,
      wrote: {
        body: { ts: now - 3 * hr, source: 'founder' },
        answer: { ts: now - 70 * min, source: 'founder' },
        result: { ts: now - 3 * min, source: 'agent' },
        status: { ts: now - 3 * min, source: 'agent' },
      },
      createdAt: now - 3 * hr, updatedAt: now - 3 * min,
    },
    {
      id: 'w-a1', product: 'kestrel', productName: 'Kestrel', status: 'open', kind: 'question',
      title: 'Pricing page: annual toggle default on or off?',
      body: [
        '## Where we were',
        'You asked for a pricing page draft. I proposed three tiers with annual default. You said annual-default felt presumptuous before we have testimonials.',
        '',
        '## Context',
        'The page is rebuilt with the monthly default. Simulated users (5 personas) now hesitate at the annual toggle: 3 of 5 never noticed it, which costs us the anchor. Screenshot attached shows the toggle placement.',
        '',
        '![pricing toggle](fixture://pricing.png)',
        '',
        '## Options',
        '1. Monthly default, toggle moved above the fold with a "2 months free" chip (recommended)',
        '2. Annual default, first testimonial quote placed beside it',
        '3. Ship monthly-only, add annual after the first 10 paying users',
        '',
        '## What happens next',
        'I ship the winner tonight, then re-run the 5-persona panel on the live page. Meanwhile I moved on to the checkout error copy.',
        '',
        '## Cost of being wrong',
        'Low. One-line change to revert, and the panel re-run catches a regression within the hour.',
      ].join('\n'),
      labels: ['pricing'], priority: 2, epoch: 3, claim: null,
      createdAt: now - 22 * min, updatedAt: now - 22 * min,
    },
    {
      id: 'w-b2', product: 'onboard', productName: 'Onboard', status: 'open', kind: 'review',
      title: 'Review: welcome-email sequence rewrite (3 emails)',
      body: [
        '## Where we were',
        'First draft last week read as AI-generated to you ("delve", exclamation marks). You asked for plain, specific, one idea per email.',
        '',
        '## Context',
        'Rewritten. Email 1 is 61 words. Diff and rendered previews:',
        '',
        '[View the diff](fixture://diff) · [Preview email 1](http://localhost:4801/emails/1)',
        '',
        '## What happens next',
        'On approve, these go into the drip for new signups only. No existing user is re-mailed.',
        '',
        '## Cost of being wrong',
        'Medium. Real humans receive these; a bad tone lands in inboxes we cannot unsend.',
      ].join('\n'),
      labels: ['marketing', 'email'], priority: 1, epoch: 5, claim: null,
      createdAt: now - 2 * hr, updatedAt: now - 71 * min,
    },
    {
      id: 'w-c3', product: 'thicket', productName: 'Thicket', status: 'blocked', kind: 'task',
      title: 'Stripe account: needs your identity verification to go live',
      body: [
        '## Context',
        'Test-mode checkout works end to end. Going live requires identity verification that only you can complete (government ID, ~5 minutes at the Stripe dashboard).',
        '',
        '[Open Stripe verification](https://dashboard.stripe.com/settings)',
        '',
        '## What happens next',
        'The moment the account is live I flip the publishable key and re-run the paid-signup journey.',
        '',
        '## Cost of being wrong',
        'None, but every day unverified is a day nothing can be sold.',
      ].join('\n'),
      labels: ['payments'], priority: 3, epoch: 2, claim: null,
      createdAt: now - 26 * hr, updatedAt: now - 26 * hr,
    },
    {
      id: 'w-d4', product: 'kestrel', productName: 'Kestrel', status: 'claimed', kind: 'bug',
      title: 'Card zoom flickers on Safari',
      labels: ['frontend'], priority: 1, epoch: 4,
      claim: { holder: 'zero-worker-9f2', leaseUntil: now + 4 * min },
      createdAt: now - 48 * min, updatedAt: now - 3 * min,
      body: 'Repro: hover any card in the gallery on Safari 19. The zoom transform re-triggers on every mousemove.',
    },
    {
      id: 'w-e5', product: 'onboard', productName: 'Onboard', status: 'claimed', kind: 'task',
      title: 'Instrument the new signup flow',
      labels: ['analytics'], priority: 0, epoch: 1,
      claim: { holder: 'zero-worker-b81', leaseUntil: now + 2 * min },
      createdAt: now - 31 * min, updatedAt: now - 1 * min,
    },
    {
      // HER CASE, 2026-08-20: a run drew her something, said so in prose, and
      // named no path.
      id: 'w-m12', product: 'onboard', productName: 'Onboard', status: 'open', kind: 'design',
      title: 'Onboarding: three first run flows are drawn, and one of them is yours to pick',
      body: '**Pick the walkthrough, already working, or teach as you go.**\n\nThree first run flows are drawn, in the lake skin, as screens you can actually look at.',
      note: '**Pick the walkthrough, already working, or teach as you go.**\n\nThree first run flows are drawn, in the lake skin, as screens you can actually look at. They are in your documents.\n\nThe walkthrough is six composed screens, one idea each, then the app. It is the closest to onboarding somebody in person and the most beautiful of the three.\n\nNothing is coded until you say which one.',
      labels: ['design'], priority: 5, epoch: 2, claim: null,
      createdAt: now - 40 * min, updatedAt: now - 19 * min,
    },
    {
      // HER CASE, 2026-08-24: the one document this card was about was written
      // out in full, from the root, and the file row under it was empty.
      //
      // The path below is deliberately the long form, under this product's own
      // fixture folder, because that is the only thing that was wrong with it.
      // The short form beside it in the note is the same file said the other
      // way, and the row must show ONE chip, not two.
      id: 'w-n13', product: 'onboard', productName: 'Onboard', status: 'open', kind: 'review',
      title: 'The first row a new project makes is fixed and needs your yes',
      body: '**Merge the first row change, or pick different words for it.**\n\nMaking a project used to compose a row the fleet took as work, so an agent started before you had said anything. It asks now, and nothing runs until you reply.\n\nThe page shows the row before and after:\n\n/fixtures/onboard/designs/w-n13/the-first-row.html',
      labels: ['review'], priority: 5, epoch: 2, claim: null,
      createdAt: now - 52 * min, updatedAt: now - 12 * min,
    },
    {
      // STOPPED: she answered, a worker took it, and that worker died without
      // finishing. Three of these were on her screen at once, which is what
      // resuming-by-selection is for. In Progress shows them beside the live
      // ones, and only a fixture that HAS them lets that screen be reviewed.
      id: 'w-i9', product: 'onboard', productName: 'Onboard', status: 'open', kind: 'design',
      title: 'Design the build menu: what resources make, and what unlocks it',
      answer: 'Option 1: One design pass, delivered as an HTML page you read.',
      labels: ['design'], priority: 4, epoch: 7, claim: null,
      createdAt: now - 7 * hr, updatedAt: now - 2 * hr,
    },
    {
      id: 'w-j10', product: 'thicket', productName: 'Thicket', status: 'open', kind: 'task',
      title: 'Bring back a list of name alternatives to react to',
      answer: 'Option 1: A page of twenty or so candidates, grouped by what each promises.',
      labels: [], priority: 4, epoch: 3, claim: null,
      createdAt: now - 14 * hr, updatedAt: now - 5 * hr,
    },
    {
      // A ROW AN AGENT PARKED to stop its own respawn loop, which had no
      // fixture and therefore no review either. This is as it really was on
      // 2026-08-11: an agent-written runAt nine hours out, and the only thing
      // left on it a decision of hers. It sat in Scheduled, out of sight, which
      // is the whole bug.
      //
      // It belongs in the INBOX, and opening it offers the way back out.
      id: 'w-k11', product: 'kestrel', productName: 'Kestrel', status: 'open', kind: 'directive',
      title: 'Your depth signal is built, and the sign up count was wrong',
      body: [
        'The depth signal you approved is built and verified, waiting on one thing from you.',
        '',
        'A visitor who reads the whole page now leaves marks at 25, 50, 75 and 100 carrying the',
        'campaign that brought them; a visitor who stops at the first screen leaves none. Today',
        'those two people are the same row.',
        '',
        '## What is owed',
        'Whether to merge it. Nothing else waits on this.',
      ].join('\n'),
      labels: ['gtm'], priority: 1, epoch: 4, claim: null,
      runAt: now + 9 * hr,
      wrote: { runAt: { ts: now - 12 * min, source: 'agent' } },
      createdAt: now - 5 * hr, updatedAt: now - 12 * min,
    },
    {
      // An ask SHE composed, answered by a worker and not yet read. Done, and
      // in the inbox: the answer to her own question is delivered, not filed.
      // Every fixture here used to be work an agent started, which is why the
      // one list she could not see was invisible in review too.
      id: 'w-h8', product: 'kestrel', productName: 'Kestrel', status: 'done', kind: 'directive',
      title: 'can you check our metrics? i want to see if the new pricing page moved signups',
      result: [
        'Checked, and there is real news: the first stranger off the ad reached checkout tonight.',
        '',
        'On signups themselves the honest answer is that eleven people settle nothing. 1 signup from',
        '13 visitors since the rewrite against 2 from 174 before it, our own rows excluded.',
      ].join('\n'),
      labels: ['founder'], priority: 9, epoch: 4, claim: null,
      createdAt: now - 21 * min, updatedAt: now - 4 * min,
      wrote: { status: { ts: now - 4 * min, source: 'agent' } },
    },
    {
      // A LONG MESSAGE SHE WROTE AS ONE PARAGRAPH, which is how she writes,
      // with an agent checkpoint on top of it. The title is a label taken from
      // her first sentence and the body is the paragraph entire
      // (message-split.ts). that is the case the Part 2 designs on are about,
      // and this fixture is what they get drawn against.
      id: 'w-h9', product: 'onboard', productName: 'Onboard', status: 'claimed', kind: 'directive',
      title: 'Can the welcome email wait until they finish setup?',
      body: 'Can the welcome email wait until they finish setup? Right now it goes out the second '
        + 'someone signs up, so people are getting a "you are all set" email while they are still '
        + 'halfway through the form, and two of them have written back asking what they were '
        + 'supposed to have done. I would rather it went out when they actually finish, and if '
        + 'they never finish then it should be a different email entirely, something that says '
        + 'come back and pick up where you left off.',
      note: 'Found it. The email fires on account creation in signup.ts, not on the setup step, '
        + 'so it cannot see whether anyone finished. Moving the trigger to the completion event now.',
      labels: ['founder'], priority: 5, epoch: 2, claim: null,
      createdAt: now - 55 * min, updatedAt: now - 6 * min,
      wrote: { body: { ts: now - 55 * min, source: 'founder' }, note: { ts: now - 6 * min, source: 'agent' } },
    },
    {
      // A thread she SPOKE ON, closed by the worker that answered her. Filed by
      // an agent, so it carries no 'founder' label, and the archive swallowed
      // it with a whole workstream inside. Here so both halves of that fix can
      // be reviewed: it belongs in her inbox now, and the palette can put an
      // agent back on it.
      id: 'w-k11', product: 'kestrel', productName: 'Kestrel', status: 'done', kind: 'question',
      title: 'The best one is Tripo and it costs twenty cents. The only part I cannot do myself is opening the account it needs.',
      body: 'Every one of these tools wants an account with a card on it before it will answer a single call. I hold your image key and nothing else, so that signup is the only part of this I cannot do.',
      answer: 'status?',
      result: 'Nothing is running, and nothing is waiting on me. It all sits with you.',
      labels: ['v1', 'pipeline', 'spend'], priority: 7, epoch: 9, claim: null,
      createdAt: now - 6 * hr, updatedAt: now - 34 * min,
      wrote: { answer: { ts: now - 37 * min, source: 'founder' }, status: { ts: now - 34 * min, source: 'agent' } },
    },
    {
      id: 'w-f6', product: 'thicket', productName: 'Thicket', status: 'done', kind: 'task',
      title: 'Program builder: deload weeks',
      result: 'Shipped. Deload every 4th week, user-adjustable. Panel re-run: 5/5 completed setup.',
      labels: [], priority: 0, epoch: 2, claim: null,
      createdAt: now - 3 * 24 * hr, updatedAt: now - 5 * hr,
    },
    {
      id: 'w-g7', product: 'kestrel', productName: 'Kestrel', status: 'done', kind: 'question',
      title: 'Holo effect: CSS or WebGL?',
      answer: 'Option 1. CSS. Revisit only if the panel complains.',
      result: 'Shipped CSS holo. 60fps on the test devices.',
      labels: ['frontend'], priority: 0, epoch: 6, claim: null,
      createdAt: now - 2 * 24 * hr, updatedAt: now - 26 * hr,
    },
  ],
  supervisor: {
    paused: false,
    capacity: 3,
    // The founder's running order. Fixtures carry one because with an empty
    // order the composer looks exactly like the flat list it used to be, and
    // then the one screen we check the ranking on cannot show the ranking.
    productOrder: ['onboard', 'kestrel', 'thicket'],
    // Answered, handed to a worker, and that worker died without finishing.
    // The rows read "stopped"; resuming them is a choice about which.
    stalled: ['w-i9', 'w-j10'],
    running: [
      {
        itemId: 'w-d4', product: 'kestrel', startedAt: now - 3 * min,
        activity: [{ id: 'demo-tests', label: 'Running npx vitest run', detail: 'npx vitest run', startedAt: now - 17_000 }],
        tail: ['tool: Read', 'tool: Grep', 'Found it: the transform is applied in both the hover class and the JS tilt handler.', 'tool: Edit'],
      },
      {
        itemId: 'w-e5', product: 'onboard', startedAt: now - 12 * min,
        tail: ['tool: mcp__agentbox__read_document', 'Reading the analytics contract before instrumenting.', 'tool: Edit', 'tool: Bash'],
      },
    ],
  },
  // A queue of asks, so the card, the stack behind it and the answered card's
  // exit can all be looked at without a live worker frozen mid-command.
  approvals: [
    {
      id: 'ap-1', at: now - 40_000, product: 'kestrel', item: 'w-d4', tool: 'Bash',
      input: { command: 'npx vercel deploy --prod --prebuilt', description: 'Deploy the pricing page to production' },
    },
    {
      id: 'ap-2', at: now - 22_000, product: 'onboard', item: 'w-e5', tool: 'Bash',
      input: { command: 'git push origin main', description: 'Push the analytics instrumentation commit' },
    },
    {
      id: 'ap-3', at: now - 8_000, product: 'kestrel', item: 'w-d4', tool: 'Write',
      input: { file_path: 'src/components/Pricing.tsx', description: 'Rewrite the annual toggle' },
    },
  ],
  // ONE CODING AGENT, WHICH IS THE MAC SHE RUNS. The capability gate in
  // shared/engines.mjs is shut until she writes the moment into
  // zero.config.json, so `Supervisor#engineChoices` hands over one entry on
  // every Mac that exists today, and the composer's clause, the byline's engine
  // word and the Settings row all draw nothing off it. That is the founder rule
  // (tests/one-coding-agent-draws-nothing-new.test.mjs) and it is what the
  // default world has to be a photograph of.
  //
  // THE SECOND ENGINE IS A URL MODIFIER, NOT A NEW DEFAULT. See
  // `fixtureSecondEngine` below for the three other machines and for why the
  // one she has is the one you get for free.
  engines: { choices: [ENGINES[0]], workspace: DEFAULT_ENGINE, byItem: {} },
  config: {},
};

/* --------------------------- the working notes --------------------------- */
// Session traces, in the exact shape the supervisor writes them (main/
// supervisor.mjs, traceStreamLine): "HH:MM:SS  " and then either the agent's
// own sentence or "[Tool] the thing it acted on", a "== RESULT" block at the
// end, and an exit line. The notes panel reads nothing else, so a fixture in
// this shape exercises the real parser rather than a stand-in for it.
//
// Three runs, because the panel has three faces: one working right now, one
// that finished, and one that Claude turned away.

const stamp = (at: number) => new Date(at).toTimeString().slice(0, 8);

function traceText(startedAt: number, title: string, lines: Array<[number, string]>, ending?: { at: number; code: number; result: string }) {
  const head = `# ${title}\n# fixture · spawned ${new Date(startedAt).toISOString()}\n\n`;
  const body = lines.map(([offset, text]) => `${stamp(startedAt + offset * 1000)}  ${text}`).join('\n');
  if (!ending) return `${head}${body}\n`;
  const flavor = ending.code === 0 ? 'success · 27 turns' : 'success ERROR · 1 turns';
  return `${head}${body}\n\n${stamp(ending.at)}  == RESULT (${flavor}) ==\n${ending.result}\n\n# exited (${ending.code}) ${new Date(ending.at).toISOString()}\n`;
}

export const fixtureTraces: Record<string, Array<{ startedAt: number; text: string }>> = {
  // Working now: three minutes in, four sentences among nineteen actions.
  'w-d4': [{
    startedAt: now - 3 * min,
    text: traceText(now - 3 * min, 'Card zoom flickers on Safari', [
      [0, "I'll start on the Safari flicker, reading the gallery component first."],
      [3, '[Read] src/components/Gallery.tsx'],
      [11, '[Grep] transform:'],
      [19, '[Read] src/styles/card.css'],
      [34, '[Read] src/tilt.ts'],
      [52, 'Found it: the transform is applied in both the hover class and the JS tilt handler.'],
      [58, '[Edit] src/styles/card.css'],
      [71, '[Bash] npx vitest run card'],
      [96, 'The class alone still flickers, so the tilt handler has to stop writing transform at all.'],
      [104, '[Edit] src/tilt.ts'],
      [119, '[Bash] npx vitest run card'],
      [142, 'Green on Safari 19 and Chrome. Writing the test that would have caught this.'],
      [150, '[Write] tests/card-tilt-owns-one-transform.test.ts'],
      [163, '[Bash] npx vitest run'],
    ]),
  }],
  // Finished, and closed by the agent: the shape the record wears most often.
  'w-p3': [{
    startedAt: now - 7 * min,
    text: traceText(now - 7 * min, 'The card frames are built, both sizes, and the art is ready.', [
      [0, 'Took the job. Reading your answer before anything else.'],
      [4, '[mcp__agentbox__claim_work_item] w-p3'],
      [12, '[mcp__agentbox__read_document] strategy/art-style.md'],
      [26, 'You rejected all three frames and the idea behind them, so there is nothing here to merge.'],
      [33, '[Bash] git log --oneline -5 main'],
      [39, '[Bash] git branch --contains kestrel/frames'],
      [48, 'Checked rather than assumed: the frame branch is on no other branch, and main has never carried it.'],
      [57, '[Bash] npx vitest run'],
      [96, 'Suite green at 218 tests, so nothing half-merged is sitting in the tree.'],
      [104, '[Edit] docs/decisions.md'],
      [119, 'Recording the rejection where the next session will read it, not just on the row.'],
      [126, '[Edit] docs/decisions.md'],
      [140, '[mcp__agentbox__update_work_item] w-p3'],
      [148, 'Closed the row with the result above.'],
    ], {
      at: now - 2 * min,
      code: 0,
      result: 'Closed, because the thing this was blocked on came back as a no. You were asked to pick one of three redesigned frames and you refused all three and the idea behind them, so there is nothing here left to build or merge.',
    }),
  }],
  // Turned away at the door. Nothing was read and nothing was changed, and the
  // panel has to say that rather than leave her looking at an empty diary.
  // The run behind her card: it wrote the drawing and never mentioned it again.
  // Every other line here is the noise a real run makes around the one file
  // that mattered, which is the whole reason the reader has to be choosy.
  'w-m12': [{
    startedAt: now - 40 * min,
    text: traceText(now - 40 * min, 'Onboarding: three first run flows', [
      [0, 'Now the three first run flows, drawn in the lake skin.'],
      [12, '[Read] renderer/src/styles.css'],
      [40, '[Write] /tmp/compose-flows.mjs'],
      [96, '[Bash] node /tmp/compose-flows.mjs'],
      [310, '[mcp__agentbox__write_document] designs/w-78c45faed4/first-run-flows.html'],
      [318, 'They are in your documents.'],
    ], { at: now - 19 * min, code: 0, result: 'Three first run flows drawn.' }),
  }],
  'w-i9': [{
    startedAt: now - 2 * hr,
    text: traceText(now - 2 * hr, 'Design the build menu: what resources make, and what unlocks it', [
      [0, 'Started on your answer.'],
    ], {
      at: now - 2 * hr + 3000,
      code: 1,
      result: 'API Error: Claude AI usage limit reached. Your weekly limit resets at 4pm.',
    }),
  }],
};

// THE LEDGER BEHIND THE TIME, the raw appended lines the thread history reads.
// Written to agree with the folded items above, field for field, because these
// fixtures double as a schema preview and a history that contradicts the row it
// belongs to would review nothing. The lease heartbeats are left out here for
// the same reason the main process drops them: they are not events.
export const fixtureHistory: Record<string, Array<Record<string, any>>> = {
  // the card whose one page was named in full. The ledger is here so the
  // MESSAGE is on screen beside its file row, because the whole point is that
  // the path she can read in the prose is the file she can press underneath
  // it.
  'w-n13': [
    {
      id: 'w-n13', ts: now - 52 * min, source: 'agent',
      patch: {
        title: 'The first row a new project makes is fixed and needs your yes',
        status: 'open', kind: 'review', priority: 5,
        body: '**Merge the first row change, or pick different words for it.**\n\nMaking a project used to compose a row the fleet took as work, so an agent started before you had said anything. It asks now, and nothing runs until you reply.\n\nThe page shows the row before and after:\n\n/fixtures/onboard/designs/w-n13/the-first-row.html',
      },
    },
  ],
  'w-p1': [
    {
      id: 'w-p1', ts: now - 17 * min, source: 'agent',
      patch: {
        title: 'Six schedules, no session: something is eating the build menu\'s hour',
        status: 'open', kind: 'task', priority: 2, parent: 'w-p0',
        body: 'The menu has been scheduled six times and has never started. I do not know why yet.',
      },
    },
    { id: 'w-p1', ts: now - 16 * min, source: 'agent', epoch: 5, claim: { holder: 'mcp-40122', leaseUntil: now - 11 * min }, patch: { status: 'claimed' } },
    {
      id: 'w-p1', ts: now - 12 * min, source: 'agent', epoch: 5,
      patch: { title: 'The build menu has never started, six schedules in. One tap tomorrow may be all it needs.' },
    },
    {
      id: 'w-p1', ts: now - 11 * min, source: 'agent', epoch: 5,
      patch: {
        status: 'blocked',
        note: 'Read every session this product has been given for two days. Each one started within fifteen seconds of the menu\'s hour, and at that instant the menu is the one row nobody may touch.',
      },
    },
    { id: 'w-p1', ts: now - 4 * min, source: 'founder', patch: { answer: 'I think the next step is to settle the art style? We may need an image tool to make the assets, not sure how best to turn our art into something we can build with' } },
  ],
  'w-p0': [
    {
      id: 'w-p0', ts: now - 40 * min, source: 'agent',
      patch: {
        title: 'The card art is finished and nothing is built. The build menu is the step you named before code.',
        status: 'open', kind: 'question', priority: 2,
        body: 'You said "not yet, we still need to design and plan before building."',
      },
    },
    { id: 'w-p0', ts: now - 31 * min, source: 'agent', epoch: 4, claim: { holder: 'mcp-38801', leaseUntil: now - 26 * min }, patch: { status: 'claimed' } },
    { id: 'w-p0', ts: now - 27 * min, source: 'agent', epoch: 4, patch: { status: 'done' } },
  ],
};

// Two repeating tasks and the runs behind them, so the Scheduled group and the
// run log can be reviewed without a live store. One clean, one that found
// something, one that ran late: the three states the log has to tell apart.
export const fixtureRepeats = [
  {
    id: 'r-3f9a21bc44', product: 'harbour', productName: 'Harbour',
    title: 'Every day at 9am, run a synthetic user through Harbour onboarding',
    // DICTATED, THE WAY SHE ACTUALLY WRITES ONE. Her own repeating task
    // (r-072dd1ddc0, 2026-08-21) is a paragraph, a blank line, a heading-ish
    // line and two bulleted lists, and the pane used to draw all of it as one
    // `<p>`: every newline gone, every list marker sitting inline. A one-line
    // fixture body could not show that, so it could not show the fix either.
    body: `From the landing page to the first artifact, as a new user with a fresh email.

What I want back:
- Anything that broke, with the step it broke on.
- Anything that took longer than ten seconds.
- Nothing else. If it all worked, say so and stop.

Skip:
- The billing screen, it is not wired yet.
- The invite flow.`,
    every: 'day' as const, at: '09:00', createdAt: now - 6 * 24 * hr,
    served: new Date(now).toISOString().slice(0, 10), misses: 0, alerted: 0,
    lastOccurrence: 'r-3f9a21bc44-today',
  },
  {
    id: 'r-77c1e0aa31', product: 'kestrel', productName: 'Kestrel',
    title: 'Every morning, check overnight signups against yesterday',
    every: 'day' as const, at: '08:00', createdAt: now - 12 * 24 * hr,
    served: new Date(now).toISOString().slice(0, 10), misses: 0, alerted: 0,
    lastOccurrence: 'r-77c1e0aa31-today',
  },
];

// Anchored to the rule's own hour rather than to "now minus N hours", so the
// log does not report every run as late the moment the fixtures are opened.
const dayAt = (back: number, h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export const fixtureRuns = [
  {
    id: 'r-3f9a21bc44-today', product: 'harbour', productName: 'Harbour',
    title: 'Every day at 9am, run a synthetic user through Harbour onboarding · today',
    kind: 'directive', status: 'done', labels: ['founder', 'repeat:r-3f9a21bc44'],
    priority: 5, epoch: 1, claim: null,
    result: 'email verification took 41 seconds to send · filed as its own item',
    createdAt: dayAt(0, 9, 3), updatedAt: dayAt(0, 9, 14),
  },
  {
    id: 'r-3f9a21bc44-yesterday', product: 'harbour', productName: 'Harbour',
    title: 'Every day at 9am, run a synthetic user through Harbour onboarding · yesterday',
    kind: 'directive', status: 'done', labels: ['founder', 'repeat:r-3f9a21bc44', 'clean'],
    priority: 5, epoch: 1, claim: null,
    createdAt: dayAt(1, 9, 6), updatedAt: dayAt(1, 9, 12),
  },
  {
    id: 'r-3f9a21bc44-saturday', product: 'harbour', productName: 'Harbour',
    title: 'Every day at 9am, run a synthetic user through Harbour onboarding · Sat',
    kind: 'directive', status: 'done', labels: ['founder', 'repeat:r-3f9a21bc44', 'clean'],
    priority: 5, epoch: 1, claim: null,
    createdAt: dayAt(2, 14, 41), updatedAt: dayAt(2, 14, 52),
  },
  {
    id: 'r-77c1e0aa31-today', product: 'kestrel', productName: 'Kestrel',
    title: 'Every morning, check overnight signups against yesterday · today',
    kind: 'directive', status: 'done', labels: ['founder', 'repeat:r-77c1e0aa31', 'clean'],
    priority: 5, epoch: 1, claim: null,
    createdAt: dayAt(0, 8, 2), updatedAt: dayAt(0, 8, 9),
  },
];

export const fixtureDashboards = {
  kestrel: {
    stage: 'prelaunch',
    headline: { label: 'Steps to launch', value: '3' },
    rows: [
      { label: 'Next milestone', value: 'First paying customer' },
      { label: 'Real users', value: '4' },
      { label: 'Revenue', value: '$0' },
      { label: 'Panel verdict', value: '4/5 completed checkout' },
    ],
    intent: 'Ship pricing page, then open the waitlist to the 61 signups.',
  },
  onboard: {
    stage: 'launched',
    headline: { label: 'Weekly active', value: '12' },
    rows: [
      { label: 'Next milestone', value: '20 weekly active' },
      { label: 'Signups this week', value: '5' },
      { label: 'Revenue', value: '$147 MRR' },
      { label: 'Churn', value: 'unmeasured, needs 30 days of data' },
    ],
    intent: 'Fix the drip sequence, then test the LinkedIn channel.',
  },
  thicket: {
    stage: 'prelaunch',
    headline: { label: 'Steps to launch', value: '1' },
    rows: [
      { label: 'Next milestone', value: 'Launch' },
      { label: 'Blocker', value: 'Stripe identity verification (you)' },
      { label: 'Real users', value: '0' },
    ],
    intent: 'Launch the moment payments go live.',
  },
};

/* ------------------------- the mockup, reproduced ------------------------- */
// ?fixtures=mock draws the founder's own design (2026-08-12) with its own
// words, so the built app and the picture she drew can be put side by side and
// measured against each other rather than compared from memory. It exists
// because "looks extremely different from the images" is a judgment no diff can
// answer and no test can hold; the only way to close that gap is to render both
// and look.
//
// every row carries its product name beside the time (the picture omits it),
// and the group labels are the real ones this app derives from the dates rather
// than the picture's, which puts AUG 11 under both "Last 7 days" and
// "Yesterday".
const day = 86_400_000;
const at = (daysAgo: number, h: number, m: number) => {
  const d = new Date(Date.now() - daysAgo * day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export const fixtureMock: Snapshot = {
  products: [
    { slug: 'harbour-new', dir: '/fixtures/harbour-new', name: 'Harbour (New)', oneLiner: '', repoPath: null },
  ],
  items: ([
    ['m1', 'The four pages are built. Your signup rate per page is ready.',
      'Built and tested on main. Please review the analytics and copy.', at(2, 16, 20)],
    ['m2', 'The setup cut is on today’s main, tested and green.',
      'Safe to deploy when you say go. Needs your yes to ship.', at(1, 15, 10)],
    ['m3', 'Nobody has read our heaviest user or the only users.',
      'Added a first-time user email and in-app nudges. Needs your yes to ship.', at(1, 14, 40)],
    ['m4', 'Merged and live: the privacy page describes the product.',
      'You asked for clearer language. This is live.', at(1, 13, 30)],
    ['m5', 'Our signup number counts an event that has never occurred.',
      'Fixed the event tracking and backfilled the last 7 days. Needs your yes to ship.', at(0, 10, 3)],
    ['m6', 'Standing deploys: one yes for deploying work.',
      'CI is green and staging is verified. Approve to deploy to production?', at(0, 10, 3)],
    ['m7', 'I want to open a small online shop. First, I have a few…',
      'Blocked by Stripe account verification. Your action is needed.', at(1, 11, 5)],
    ['m8', 'Can you set this up for me and keep it running? If I…',
      'Blocked by missing API key in production secrets. Your action is needed.', at(1, 10, 15)],
  ] as Array<[string, string, string, number]>).map(([id, title, body, ts]) => ({
    id, product: 'harbour-new', productName: 'Harbour (New)',
    status: 'open' as const, kind: 'question' as const,
    title, body, labels: [], priority: 5, epoch: 1, claim: null,
    createdAt: ts, updatedAt: ts,
  })),
  approvals: [],
  supervisor: { paused: false, running: [], capacity: 3 },
  // The real fixture's config, not an empty object: the browser pane maps over
  // its pins on mount, so an incomplete config takes the whole app down before
  // a single row is drawn.
  config: fixtureSnapshot.config,
} as unknown as Snapshot;

export const fixtureMockDashboards = {
  'harbour-new': {
    stage: 'launched',
    headline: null,
    rows: [
      { label: 'Next milestone', value: '20 weekly active' },
      { label: 'Signups this week', value: '5' },
      { label: 'Revenue', value: '$147 MRR' },
      { label: 'Churn', value: 'unmeasured, needs 30 days of data' },
    ],
    intent: 'Fix the drip sequence, then test the LinkedIn channel.',
  },
};

/* ---------------------------- her live agents ---------------------------- */
// SIX CLAUDE CODE SESSIONS, so the rail's "Active agents" section can be
// developed and reviewed without her machine. Before this the fixtures carried
// no `agents` at all, so the panel drew as nothing in every screenshot ever
// taken of the app.
//
// The shape is her real machine on 2026-08-19, measured, not imagined: four
// sessions that moved in the last minute or two, two that have been quiet for
// hours, and one that has sat untouched for two days. THE LAST ONE IS THE
// POINT. It is over the day cut, so it must NOT appear, and a fixture that only
// held live sessions could never show that the cut works.
//
// A session this app started has no title of its own, so its row falls back to
// its last sentence caught mid-thought; a session she started elsewhere and
// attached carries a real one. Both are here, because they read very
// differently and the difference is the whole argument for the fallback.
export const fixtureAgents: AgentSession[] = [
  {
    pid: 4102, ppid: 1, sessionId: 'f-1', name: 'kestrel-2c', cwd: '/Users/you/Desktop/dev/kestrel',
    startedAt: now - 42 * min, status: null, waitingFor: null, lastActiveAt: now - 8_000,
    // No em dash in a fixture either. She never runs the app on fixtures, but
    // every screenshot an agent sends her is drawn from this file, so a dash
    // here is a dash she reads.
    lastSaid: 'The set is inconsistent. The resumed run reused a stale card back.',
    product: null, productName: null, startedByZero: false,
  },
  {
    pid: 4118, ppid: 1, sessionId: 'f-2', name: 'onboard-c4', cwd: '/Users/you/Desktop/dev/onboard',
    startedAt: now - 31 * min, status: null, waitingFor: null, lastActiveAt: now - 40_000,
    lastSaid: 'Merged and green. Now filing the one thing her reply raised.',
    product: null, productName: null, startedByZero: false,
  },
  {
    pid: 4133, ppid: 1, sessionId: 'f-3', name: 'kestrel-87', cwd: '/Users/you/Desktop/dev/kestrel',
    startedAt: now - 3 * hr, status: null, waitingFor: null, lastActiveAt: now - 70_000,
    about: 'Card art pipeline: the second pass on the commons',
    lastSaid: 'The live page renders and matches the commit.',
    product: 'kestrel', productName: 'Kestrel', startedByZero: false,
  },
  {
    pid: 4140, ppid: 1, sessionId: 'f-4', name: 'thicket-69', cwd: '/Users/you/Desktop/dev/thicket',
    startedAt: now - 2 * hr, status: null, waitingFor: null, lastActiveAt: now - 4 * min,
    about: 'Deload weeks are landing a session early',
    lastSaid: 'Carrying on. The cut is fixed and verified.',
    product: null, productName: null, startedByZero: false,
  },
  {
    pid: 3901, ppid: 1, sessionId: 'f-5', name: 'onboard-48', cwd: '/Users/you/Desktop/dev/onboard',
    startedAt: now - 6 * hr, status: 'idle', waitingFor: null, lastActiveAt: now - 2 * hr,
    about: 'Open project as electron app',
    lastSaid: 'Done. Anything else?',
    product: null, productName: null, startedByZero: false,
  },
  {
    pid: 3846, ppid: 1, sessionId: 'f-6', name: 'thicket-46', cwd: '/Users/you/Desktop/dev/thicket',
    startedAt: now - 9 * hr, status: 'idle', waitingFor: null, lastActiveAt: now - 3 * hr,
    about: 'Install the commit-message skill',
    lastSaid: 'Installed. It is on the path.',
    product: null, productName: null, startedByZero: false,
  },
  // OVER THE CUT ON PURPOSE. Two days at a prompt, alive and forgotten, which
  // is what her list was actually full of. It must never draw.
  {
    pid: 3102, ppid: 1, sessionId: 'f-7', name: 'kestrel-54', cwd: '/Users/you/Desktop/dev/kestrel',
    startedAt: now - 50 * hr, status: 'idle', waitingFor: null, lastActiveAt: now - 46 * hr,
    about: 'Rename the economy doc',
    lastSaid: 'Renamed.',
    product: null, productName: null, startedByZero: false,
  },
];

/* ------------------------------- settings -------------------------------- */
// The settings screen against canned data, so the page can be reviewed and
// screenshotted without a live config, a live supervisor or a single agent
// running. The workspace half mirrors the real one this was built against (two
// subscriptions, three sessions each, Opus 5, sessions allowed to edit and run
// commands); the projects are the three fixture products above.
//
// Writes here mutate this object and nothing else. There is no disk behind
// fixtures, so a switch moving is exactly as true as it looks: the control
// works, and nothing was saved anywhere.
export const fixtureSettings = {
  ok: true,
  workspace: {
    agentsRunning: true,
    sessionsAtOnce: 3,
    capacity: 6,
    running: 2,
    model: 'claude-opus-5',
    permission: 'bypassPermissions',
    permissionArgs: [
      '--model', 'claude-opus-5',
      '--allowedTools', 'mcp__agentbox', 'Bash(git fetch:*)', 'Bash(git push:*)', 'Bash(git merge:*)',
      '--permission-mode', 'bypassPermissions',
    ],
    accounts: [
      // Both plans are what her two real accounts said when this was measured,
      // 2026-08-29: Max 20x on each.
      { profile: 'default', label: 'default', dir: null, email: 'you@example.com', accountUuid: 'acct-personal', live: true, cooldownUntil: 0, running: 2, plan: { label: 'Max 20x', max: true } },
      { profile: '/Users/you/.claude-second', label: '.claude-second', dir: '/Users/you/.claude-second', email: 'work@example.com', accountUuid: 'acct-work', live: true, cooldownUntil: 0, running: 0, plan: { label: 'Max 20x', max: true } },
    ],
    // The healthy pair: two folders, two different subscriptions. The warning
    // line only exists for the machine where they have become the same one.
    accountsNote: null,
    storePath: '/Users/you/Zero/accounts/00000000-0000-4000-8000-000000000000',
    homePath: '/Users/you',
    claudeBin: '/Users/you/.local/bin/claude',
    claudeFound: true,
    claudeCertain: true,
    claudeInstallUrl: 'https://code.claude.com/docs/en/setup',
    // AND THE SAME ONE CODING AGENT THE SNAPSHOT ABOVE REPORTS. Six keys, all
    // of them the answer a Mac with the gate shut really gives (main/
    // settings.mjs): one choice, so the Coding agent row is not drawn and the
    // Model row still speaks for every agent; `codex: null`, so Settings says
    // the word Codex nowhere at all. They are written out rather than left
    // absent because this object is the schema preview the file's own header
    // promises, and because a key that is missing exercises the reader's
    // fallback instead of the payload the app really sends.
    engine: DEFAULT_ENGINE,
    engineChoices: [ENGINES[0]],
    codexModels: [],
    codexModelDefault: null,
    codexModel: null,
    // WHAT CLAUDE CODE CALLS ITS MODELS ON THE MAC THIS FIXTURE DESCRIBES.
    // Main reads this off the installed binary now, so it is no longer a
    // constant, and the one answer a fixture can honestly give is the table
    // Agentbox was built with: exactly what a Mac with no Claude Code on it
    // gets, and what every Mac gets until the settings trip returns.
    claudeModels: BUILT_MODELS.map((m) => ({ id: m.id, label: m.label, model: m.model })),
    codex: null,
    standingLines: 20,
    messageRulesLines: 254,
    projectsWithInstructions: 1,
    projectCount: 3,
  },
  projects: [
    {
      slug: 'kestrel', name: 'Kestrel', dir: '/fixtures/kestrel', repoPath: '/Users/you/Desktop/dev/kestrel',
      autonomous: true,
      permission: 'workspace', permissionArgs: null, running: 2,
      instructions: [
        'The card art is the product. Never ship a card that renders wrong,',
        'even to a test account.',
        '',
        'Screens are designs first. Draw it, show me, then build the one I pick.',
      ].join('\n'),
    },
    {
      slug: 'onboard', name: 'Onboard', dir: '/fixtures/onboard', repoPath: null,
      autonomous: false,
      permission: 'workspace', permissionArgs: null, running: 0, instructions: '',
    },
    {
      slug: 'thicket', name: 'Thicket', dir: '/fixtures/thicket', repoPath: null,
      autonomous: false,
      permission: 'plan', permissionArgs: ['--model', 'claude-opus-5', '--allowedTools', 'mcp__agentbox', '--permission-mode', 'plan'],
      running: 0, instructions: '',
    },
  ],
};

/* ---------------------------- the second engine --------------------------- */
// THE MODE THAT EXISTS FOR SEEING THINGS COULD NOT SEE THE SECOND ENGINE.
//
// Everything above this line described a Mac with one coding agent, because
// until now that was the only Mac these fixtures could describe: no `engines`
// on the snapshot and no engine keys in the workspace at all. Design review
// here runs on `?fixtures` screenshots, so the composer's engine clause, the
// byline's engine word, the per-engine model list, the Codex connection card
// and the engine-aware usage corner were, all five of them, unphotographable.
//
// The cost was a shipped bug. Settings drew Claude Code's four model aliases
// directly beneath a picker reading "Coding agent: Codex" -- her own 2026-08-26
// defect, "On Opus. With Codex.", on a different row -- and a founder-side
// tester found it in ten minutes of using the real app. No screenshot could
// have caught it, because `w.engine === 'codex'` is unreachable in a world that
// never offers a second engine.
//
// SO WHY IS THE SECOND ENGINE NOT SIMPLY ON. Because the one-engine screen is a
// founder rule and not an implementation detail: on every Mac she has, and on
// every Mac until she writes the opt-in moment into zero.config.json, the
// screen must be exactly the screen it is today (the whole of
// tests/one-coding-agent-draws-nothing-new.test.mjs). A two-engine world that
// was the ONLY world would make THAT unphotographable, which is the same defect
// pointing the other way, and it would silently rewrite every existing
// scripts/shot-*.mjs picture: two choices in the workspace turn on five
// separate Settings surfaces at once.
//
// It would also disagree with the app. `DEFAULT_ENGINE` is Claude Code and the
// gate is shut, so a fixture whose default was two engines would be canned data
// contradicting the product default it is meant to be a preview of.
//
// THE SHAPE IS THE ONE THIS FILE ALREADY USES FOR A SECOND WORLD. `?fixtures`
// distinguishes `1` from `empty` on one key, and api.ts layers `?rest=off`,
// `?shelf=on` and `?working=3` over whichever world is up. The engines are a
// modifier of exactly that kind, so they compose: `?fixtures=empty&engines=codex`
// is the idle page with the corner naming Codex, and `?fixtures=crowded&engines=claude`
// is the only place the engine clause can be seen against a footer whose chips
// wrap. A value on the `?fixtures` key itself could have done none of that.
//
// FOUR MACHINES, WHICH IS ALL OF THEM. The default is not one of the words,
// deliberately: passing nothing is what every shot script already does, so the
// one-engine rule is recorded by the pictures that exist rather than by a flag
// somebody has to remember.
//
//   (no ?engines)     one coding agent, gate shut. Every Mac she has.
//   ?engines=missing  gate open and Agentbox cannot see Codex. Still one agent,
//                     so still no picker anywhere: the connection card is the
//                     whole of what is new, and this is the one Mac that card
//                     was built for (Settings.tsx says so in as many words).
//   ?engines=claude   two agents, workspace still on Claude Code. The state a
//                     Mac is in the moment she opens the gate.
//   ?engines=codex    two agents, workspace moved to Codex. The screen the
//                     shipped bug was on.

export type FixtureEngineWorld = 'missing' | 'claude' | 'codex';

const ENGINE_WORLDS: FixtureEngineWorld[] = ['missing', 'claude', 'codex'];

/**
 * The world one url asks for, or null for the Mac she has. A word nothing
 *  recognises reads as no word: a typo in a shot script must not quietly hand
 *  back a machine nobody asked for. */
export function fixtureEngineWorld(asked: string | null): FixtureEngineWorld | null {
  return ENGINE_WORLDS.includes(asked as FixtureEngineWorld) ? asked as FixtureEngineWorld : null;
}

/**
 * WHAT CODEX CALLS ITS MODELS, IN THE SHAPE THE APP REALLY RECEIVES.
 *
 * Not invented: these are the six that carry `visibility: "list"` in the
 * `models_cache.json` codex-cli maintains, in the CLI's own ascending
 * `priority` order, reduced to `{ id, label }` exactly as main/codex-models.mjs
 * reduces them. Measured off a real 198,977-byte cache written by codex-cli
 * 0.148.0, which also carries two hidden models this list correctly drops.
 *
 * The list matters more than it looks. The Settings Model row refuses to draw
 * itself with one option, so a fixture with a token model in it would still
 * leave the screen the bug shipped on unphotographable.
 */
export const fixtureCodexModels: NonNullable<WorkspaceSettings['codexModels']> = [
  { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
];

/**
 * The bare `model = "..."` at the top of her own ~/.codex/config.toml, which is
 *  what a Codex row with no model of its own really runs on. Hers on
 *  2026-09-04. Null would have been a legal answer too, and a wrong one to
 *  photograph: it draws "Codex's own", which is the case where there is nothing
 *  to check the model list against. */
export const fixtureCodexModelDefault = 'gpt-5.6-sol';

// main/codex-bin.mjs's `INSTALL_URL`, typed rather than imported because the
// renderer never imports from main/. The suite holds the two in step.
const CODEX_INSTALL_URL = 'https://learn.chatgpt.com/docs/codex/cli';
const CODEX_BIN = '/Users/you/.local/bin/codex';

/**
 * THE ROWS THAT ARE NOT ON THE WORKSPACE'S ENGINE, one per two-engine world.
 *
 * `byItem` names ONLY the rows that differ, because that is what the renderer's
 * read is built on (`byItem[id] ?? workspace`, App.tsx). Each world puts one
 * RUNNING row and one open row on the other agent: the byline prefers the
 * session's own engine while a run is up, so a world whose only marked row was
 * idle would leave that branch undrawn.
 */
const OFF_THE_WORKSPACE: Record<'claude' | 'codex', Record<string, string>> = {
  claude: { 'w-e5': 'codex', 'w-b2': 'codex' },
  codex: { 'w-d4': DEFAULT_ENGINE, 'w-a1': DEFAULT_ENGINE },
};

// A READING FOR THE CORNER, which has none in the default world and should keep
// none: it is absent until a figure lands, and adding one would put a pill on
// every picture ever taken of this app. The two shapes are genuinely different
// and both are copied from the readers that produce them. Claude Code prints a
// clock time in a named zone (shared/claude-usage.mjs); Codex prints no clock
// time and names no zone, it hands over the instant, so every text field is
// null (shared/codex-usage.mjs). The Codex percentages are the ones in that
// file's own recorded capture.
const CLAUDE_LIMITS: NonNullable<Snapshot['usage']>['limits'] = [
  {
    span: 'session', qualifier: null, name: 'This session', percent: 38,
    resetsText: '6:19pm', resetsOn: null, resetsAt: now + 2 * hr + 40 * min, zone: 'America/Los_Angeles',
  },
  {
    span: 'week', qualifier: 'all models', name: 'This week', percent: 71,
    resetsText: '4pm', resetsOn: 'Sep 8', resetsAt: now + 3 * 24 * hr, zone: 'America/Los_Angeles',
  },
];

const CODEX_LIMITS: NonNullable<Snapshot['usage']>['limits'] = [
  {
    span: 'session', qualifier: null, name: 'This session', percent: 33,
    resetsText: null, resetsOn: null, resetsAt: now + 4 * hr, zone: null,
  },
  {
    span: 'week', qualifier: null, name: 'This week', percent: 63,
    resetsText: null, resetsOn: null, resetsAt: now + 5 * 24 * hr, zone: null,
  },
];

/**
 * The workspace keys one world overrides, or null for the Mac she has.
 *
 * Null rather than a copy of the default block on purpose: the default is
 * written once, in `fixtureSettings` above, and two spellings of "one coding
 * agent" is how the one that gets taught and the one that does not end up on
 * adjacent screens.
 */
export function fixtureEngineSettings(world: FixtureEngineWorld | null): Partial<WorkspaceSettings> | null {
  if (!world) return null;
  // FOUND IS NOT THE SAME QUESTION AS OFFERED, and this is the Mac where they
  // come apart: the gate is open, so the card is drawn and says Codex is not
  // here, and there is still exactly one agent, so nothing else changes.
  if (world === 'missing') {
    return {
      codex: { found: false, certain: true, bin: '', url: CODEX_INSTALL_URL, trouble: null },
    };
  }
  return {
    engine: world,
    engineChoices: ENGINES,
    codexModels: fixtureCodexModels,
    codexModelDefault: fixtureCodexModelDefault,
    // She has set no workspace Codex model, so the row draws her config.toml's
    // own and nothing is sent at spawn. That is what her Mac says today.
    codexModel: null,
    codex: { found: true, certain: true, bin: CODEX_BIN, url: CODEX_INSTALL_URL, trouble: null },
  };
}

/**
 * The same world, applied to whichever snapshot is up.
 *
 * Pure, so it layers over `empty`, `crowded` and `mock` without any of them
 * knowing about engines. A row id that world does not contain is simply not
 * there to mark, which is what keeps `mock` and `empty` honest rather than
 * carrying facts about rows they do not have.
 */
export function fixtureSecondEngine(snap: Snapshot, world: FixtureEngineWorld | null): Snapshot {
  // `missing` is one coding agent, so the snapshot is the one she already has.
  // Everything it changes is in Settings.
  if (!world || world === 'missing') return snap;
  const byItem = OFF_THE_WORKSPACE[world];
  const engineOf = (id: string) => byItem[id] ?? world;
  return {
    ...snap,
    engines: { choices: ENGINES, workspace: world, byItem: { ...byItem } },
    // What she MARKED as well as what will run, because they are one choice and
    // a row whose two halves disagree is a row nobody can read.
    items: snap.items.map((item) => (byItem[item.id] ? { ...item, engine: byItem[item.id] } : item)),
    supervisor: {
      ...snap.supervisor,
      // WHAT IS RUNNING BEATS WHAT WOULD RUN (byline.ts), so a live session
      // carries the engine it really started on rather than leaving the byline
      // to read the answer for the NEXT spawn.
      running: snap.supervisor.running.map((r) => ({ ...r, engine: engineOf(r.itemId) })),
    },
    usage: { engine: world, limits: world === 'codex' ? CODEX_LIMITS : CLAUDE_LIMITS, at: now - 4 * min },
    usageByEngine: [{engine:'claude', limits:CLAUDE_LIMITS, at:now-4*min}, {engine:'codex',limits:CODEX_LIMITS,at:now-4*min}],
  };
}

// A CONVERSATION TO DRAW WITHOUT A LIVE SESSION. Five turns and a gap, so the
// screenshot harness and anyone reviewing the UI sees both shapes: the reading
// itself, and the honest line where the middle is not shown.
export function fixtureConversation() {
  const now = Date.now();
  const min = 60_000;
  return {
    ok: true,
    name: 'harbour-71',
    total: 34,
    omitted: 29,
    turns: [
      { at: now - 4 * 1440 * min, who: 'you' as const, text: 'I added a new project in Harbour called Powerup but it is not in the list. I want to see it there so i can give it tasks.' },
      { at: now - 4 * 1440 * min + 26 * min, who: 'it' as const, text: 'Found it. the app and Harbour read different stores: the composer lists directories under the account root, and the new product was written to the other one.' },
      { at: now - 4 * 1440 * min + 54 * min, who: 'you' as const, text: 'sounds good. just make sure the login is remembered between sessions now that i am signed in.' },
      { at: now - 90 * min, who: 'it' as const, text: 'Auth holds across a restart now, and the sync backlog is drained. One thing left that I need you on.' },
      { at: now - 40 * min, who: 'you' as const, text: 'go ahead' },
    ],
  };
}

// A plausible set of Claude Code agent files, in the shape
// main/agent-files.mjs reads them: four of the user's own and four in one
// project. It stands in for the real ones when there is no main process.
export function fixtureAgentFiles() {
  return {
    user: [
      { name: "screenshot-reviewer", title: "Screenshot Reviewer", line: "Gives feedback on screenshots passed directly to it, with no browser automation.", scope: "all" as const, path: "/Users/you/.claude/agents/screenshot-reviewer.md" },
      { name: "new-user-qa", title: "New User QA", line: `QA agent that plays a first-time user being onboarded to ${NAME}.`, scope: "all" as const, path: "/Users/you/.claude/agents/new-user-qa.md" },
      { name: "localhost-qa", title: "Localhost QA", line: "Use this skill after completing any frontend or UI code changes to validate them against the running app.", scope: "all" as const, path: "/Users/you/.claude/agents/localhost-qa.md" },
      { name: "qa-browser-tester", title: "QA Browser Tester", line: "Playwright-powered browser testing subagent.", scope: "all" as const, path: "/Users/you/.claude/agents/qa-browser-tester.md" },
    ],
    project: [
      { name: "cleanup-analyzer", title: "Cleanup Analyzer", line: "Run static analysis tools and get structured cleanup recommendations.", scope: "project" as const, path: "/Users/you/Desktop/dev/recipe-app/.claude/agents/cleanup-analyzer.md" },
      { name: "docs-reviewer", title: "Docs Reviewer", line: "Review developer documentation for accuracy, consistency with the codebase, and quality.", scope: "project" as const, path: "/Users/you/Desktop/dev/recipe-app/.claude/agents/docs-reviewer.md" },
      { name: "plan-checker", title: "Plan Checker", line: "Validate implementation plans against documented architecture patterns.", scope: "project" as const, path: "/Users/you/Desktop/dev/recipe-app/.claude/agents/plan-checker.md" },
      { name: "userguide-reviewer", title: "Userguide Reviewer", line: "Review user guide documentation against actual system features.", scope: "project" as const, path: "/Users/you/Desktop/dev/recipe-app/.claude/agents/userguide-reviewer.md" },
    ],
    chosen: null as string[] | null,
  };
}

// A plausible set of Claude Code threads, in the shape
// main/agent-sessions.mjs reads them.
//
// `when` is written as an offset from the moment the fixture is asked for, so
// the row under each name ("today", "yesterday", "on Monday") stays true rather
// than aging into a card that says everything happened last March.
export function fixtureSessionThreads() {
  const now = Date.now();
  const hour = 3600 * 1000;
  const zero = { folder: '/Users/you/Desktop/dev/zero', folderName: 'zero', short: '~/Desktop/dev/zero' };
  const dd = { folder: '/Users/you/Desktop/dev/harbour', folderName: 'harbour', short: '~/Desktop/dev/harbour' };
  const rows: [string, string, number, typeof zero][] = [
    ['s1', 'this is a test', 1, zero],
    ['s2', 'please run zero (latest version) and also give me a command to do so', 30, zero],
    ['s3', 'see the attached screenshots (tell me if they do not load). the list only...', 76, zero],
    ['s4', 'Can you please reopen the Powerup application, also known as Zero, using...', 76, zero],
    ['s5', "I'm not sure what changed, but for some reason, after the last update...", 77, zero],
    ['s6', 'a popup keeps asking for access to the keychain every time I open...', 81, zero],
    ['s7', 'Open the most recent version of this project as an electron app please', 98, zero],
    ['s8', 'Please add this commit-message skill to every one of my projects...', 142, dd],
    ['s9', 'tried to open zero here but it failed.', 142, dd],
  ];
  return rows.map(([id, title, ago, where]) => ({
    id,
    source: 'terminal' as const,
    title,
    when: now - ago * hour,
    path: `/Users/you/.claude/projects/${where.folderName}/${id}.jsonl`,
    ...where,
  }));
}

import { NAME } from '../../shared/product-name.mjs';

// A FAKE DISK FOR ?fixtures=1, so the picker can be drawn and photographed
// without anybody's real folders in the shot. Three levels is enough to show
// walking down and back up.
const FIXTURE_DISK: Record<string, string[]> = {
  '/Users/you': ['Desktop', 'Documents', 'dev', 'Downloads'],
  '/Users/you/dev': ['house', 'kestrel', 'orchard'],
  '/Users/you/dev/house': ['src', 'tests'],
  '/Users': ['you'],
};

export function fixtureFolders(at: string): FolderListing {
  const here = at === '~' || !at.startsWith('/') ? '/Users/you' : at;
  const names = FIXTURE_DISK[here] ?? [];
  return {
    at: here,
    parent: here === '/' ? null : here.slice(0, here.lastIndexOf('/')) || '/',
    home: '/Users/you',
    folders: names.map((name) => ({ name, path: `${here}/${name}` })),
    // The home folder is refused for real, so the fixture refuses it too: that
    // is the state worth being able to photograph.
    refused: here === '/Users/you'
      ? 'That is your whole home folder. Pick the folder your project\u2019s code is in.'
      : null,
  };
}
