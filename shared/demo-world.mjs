// A WHOLE INBOX THAT IS NOBODY'S, so a demo does not have to be her own screen.
//
// What is in a demo of Agentbox is the whole product: an inbox of rows an agent
// filed, a question with options under it, work built and waiting on a yes,
// something blocked on her. So the demo cannot be an empty store, which is what
// the new-user row already opens. It is a store with a plausible day in it.
//
// THIS FILE IS THE CONTENT AND NOTHING ELSE. No disk, no spawn, no Electron:
// `main/demo.mjs` writes it out and opens the copy. Two reasons for the split.
// The content is the half she will want to change, and a file she can be
// pointed at is easier to change than a paragraph inside a launcher. And the
// shape of every row here is checked by the same rules the real ones are, which
// only works while this stays importable by a test with no app around it.
//
// NOTHING HERE IS THE USER'S AND NOTHING HERE IS REAL. Three invented products,
// one invented week of work. No path on this Mac, no name of anyone real, no
// product anyone actually ships. That is the whole point of the row: what goes
// on the screen in front of a room is invented, and the real inbox stays shut.

import { envName, nameSlug } from './product-name.mjs';

/**
 * The mark a demo copy carries, so it can tell what it is. Set in the child's
 *  environment by `main/demo.mjs` and read by `shared/install-id.mjs`. */
export const DEMO_ENV = envName('DEMO');

/**
 * A DEMO IS NOT A PERSON AND IT HAS TO SAY SO, for exactly the reason a
 * throwaway first-run home does: a copy that mints a fresh random install id
 * arrives in her own morning brief as a stranger who opened Agentbox once and
 * never came back. A demo copy is opened in front of a room and closed again,
 * which is that pattern on purpose. So every one of them sends under this one
 * fixed id, which names itself as not a person. */
export const DEMO_INSTALL_ID = `${nameSlug}-demo`;

/**
 * Is this copy of Agentbox a demo? The environment mark is the answer; there is
 *  no path fallback, because unlike a fresh-user home a demo home is not the
 *  only thing that could ever sit under its folder. */
export function runningAsADemo(env = process.env) {
  return env?.[DEMO_ENV] === '1';
}

/* -------------------------------- the studio ------------------------------ */

// THREE PRODUCTS, BECAUSE ONE PRODUCT IS NOT WHAT AGENTBOX IS FOR. The rail, the
// product filter and the composer's picker all read as furniture with a single
// project in them. Three is also what her own account looks like from across a
// room, which means the demo shows the shape of the thing rather than a
// simplified version of it.
//
// NO `repoPath` ON ANY OF THEM, deliberately. A repo path is drawn in the app
// and checked on disk, so a made-up one either shows a stranger's folder name
// on the screen or shows a warning that the folder is missing. A product with
// no code repo registered is an ordinary product (Agentbox itself is one).
export const DEMO_PRODUCTS = [
  {
    slug: 'kettle',
    name: 'Kettle',
    oneLiner: 'Weeknight dinners, planned and shopped in one tap.',
  },
  {
    slug: 'marlowe',
    name: 'Marlowe',
    oneLiner: 'Reads a contract and says what you just agreed to.',
  },
  {
    slug: 'ferry',
    name: 'Ferry',
    oneLiner: 'Moves a team off Dropbox without losing a folder.',
  },
];

/* --------------------------------- the day -------------------------------- */

// WHAT A GOOD DEMO INBOX HAS IN IT, which is why these nine and not nine
// others. Every screen worth showing has a row here that lands on it:
//
//   a question with options    the one-key answer, which is the product
//   work built and waiting     the "merge it" she should not have to type
//   something blocked on her   the app saying it is stuck, out loud
//   a finished row             a result, and what the inbox looks like empty
//   one row the user wrote     the user's own words on a card, answered
//
// THE BODIES ARE WRITTEN THE WAY THE WORKER BRIEF SAYS TO WRITE THEM: the ask
// in bold on the first line, under fifteen words, then the context, then an
// `## Options` section. That is not decoration here. The list under the reply
// box is drawn FROM that section, so a body without one demonstrates the app
// with its best feature switched off.
//
// AND NO EM DASHES, on the same standing rule as everything else she reads. A
// screenshot of this inbox is a screenshot of our own writing.
const MIN = 60_000;
const HR = 3_600_000;

function lines(now) {
  const rows = [];

  /* ------------------------------- Kettle -------------------------------- */

  rows.push({
    product: 'kettle',
    id: 'w-k1c4e0a97b',
    kind: 'review',
    priority: 2,
    at: now - 26 * MIN,
    title: 'Kettle imports 40 of your 42 recipe sites. It is on a branch.',
    body: [
      '**Merge the recipe importer, or hold it for the two sites that fail.**',
      '',
      'Forty of the forty two import cleanly: ingredients, steps and times, on every one I could check by hand. The two that fail are a site that needs a login and a blog theme that keeps its recipe inside an image.',
      '',
      'I would merge it and take those two as their own row. Holding the whole importer for a site nobody can read without an account means none of the other forty ship either.',
      '',
      '## Options',
      '1. Merge the importer (recommended)',
      '2. Hold it until all forty two work',
      '3. Merge it and open a row for the two failures',
    ].join('\n'),
  });

  rows.push({
    product: 'kettle',
    id: 'w-k7b21fd0e3',
    kind: 'question',
    priority: 1,
    at: now - 1.5 * HR,
    title: 'Kettle needs one shop picked before it can order anything.',
    body: [
      "**Say the one with an API, say the bigger one, or say both.**",
      '',
      'The basket handoff is written and it has nothing to hand off to. One of the two chains has an open API and takes about a day. The other has none, so it means driving their website, which is three days and breaks every time they redesign.',
      '',
      'I would ship the API one first and add the other once people are actually ordering.',
      '',
      '## Options',
      '1. The one with an API, first (recommended)',
      '2. Both before launch',
      '3. The bigger one first, even though it is three days',
    ].join('\n'),
  });

  // HER OWN ROW, ANSWERED AND FINISHED. Every demo inbox that is only agent
  // rows shows half the product: the other half is that she can type a
  // sentence at it. The body is written by the founder, so nothing an agent
  // says may overwrite it, and everything the run had to say is in the result.
  rows.push({
    product: 'kettle',
    id: 'w-k9e5a3c118',
    kind: 'directive',
    priority: 2,
    at: now - 5 * HR,
    bodyBy: 'founder',
    title: 'The plan screen only does two people and everyone cooks for a family.',
    body: 'The plan screen only does two people and everyone I have shown it to cooks for a family. Make it scale.',
    status: 'done',
    statusAt: now - 3 * HR,
    result: [
      "Kettle's plan screen now scales from one person to eight, and every quantity on it rounds to something a shop actually sells. A recipe written for two, at four people, asks for 500g of mince rather than 480g.",
      '',
      'Checked against all twelve recipes in the sample book, not assumed. Two of them round badly at seven people and both say so on the screen rather than quietly being wrong.',
    ].join('\n'),
  });

  /* ------------------------------- Marlowe ------------------------------- */

  rows.push({
    product: 'marlowe',
    id: 'w-m2f80b6d54',
    kind: 'question',
    priority: 1,
    at: now - 42 * MIN,
    title: 'Marlowe has two ways to show a risky clause. Pick one.',
    body: [
      '**Say margin note, or say highlight.**',
      '',
      'A highlight colours the clause where it sits, so you read it in place and nothing on the page moves. A margin note puts a plain sentence beside it saying what the clause actually means, which is more use and pushes the text left on a narrow screen.',
      '',
      'Six of the eight people in the test read the margin note first, and three of them never noticed the highlight at all. I would take the margin note.',
      '',
      '## Options',
      '1. A margin note beside the clause (recommended)',
      '2. Highlight the clause in place',
      '3. Both, with the note only on a wide screen',
    ].join('\n'),
  });

  rows.push({
    product: 'marlowe',
    id: 'w-m6a1c93e77',
    kind: 'task',
    priority: 1,
    at: now - 3.2 * HR,
    status: 'blocked',
    title: 'Marlowe cannot take money until the payment account is verified.',
    body: [
      '**Finish the payment account verification. It needs a bank detail only you have.**',
      '',
      'Checkout is built and it passes against the test keys. The live keys are refused because the account is still unverified, and that is a form nobody but you can fill in.',
      '',
      'Everything else on the paid tier is done and sitting behind it.',
    ].join('\n'),
  });

  rows.push({
    product: 'marlowe',
    id: 'w-m4d7e2b901',
    kind: 'review',
    priority: 3,
    at: now - 21 * HR,
    status: 'done',
    statusAt: now - 19 * HR,
    title: 'Marlowe reads a contract and names the clauses that will cost you.',
    result: [
      'The clause summariser is merged and running. It read all ten contracts in the test folder and named every termination, auto renewal and liability clause in all ten, with two false positives on the longest one.',
      '',
      'Ninety three seconds for the longest contract, four seconds for the shortest. Measured on this computer, not estimated.',
    ].join('\n'),
  });

  /* -------------------------------- Ferry -------------------------------- */

  rows.push({
    product: 'ferry',
    id: 'w-4dd4e0a13b',
    kind: 'review',
    priority: 2,
    at: now - 12 * MIN,
    title: "Ferry's launch post is written and goes out the moment you say so.",
    body: [
      '**Post the folder tree announcement, or ask for a different angle.**',
      '',
      'Ferry now moves a whole team across with the folder tree intact, which is the thing three of the trial teams asked for by name. The post leads with the folder tree, because that is what anybody who has lost one remembers.',
      '',
      'Nothing is scheduled and nothing is sent. It goes out when you say it does.',
      '',
      '## Options',
      '1. Post it (recommended)',
      '2. Rewrite it around the speed instead',
      '3. Hold it until the second import lands',
    ].join('\n'),
  });

  rows.push({
    product: 'ferry',
    id: 'w-dfad7295a9',
    kind: 'question',
    priority: 1,
    at: now - 2.4 * HR,
    title: 'Ferry needs a price before the first team can pay for it.',
    body: [
      '**Say per seat, or say one flat price for the whole team.**',
      '',
      'Per seat is what all three trial teams expected, and it grows as they do. A flat price is easier to say out loud and it is what both competitors do.',
      '',
      'At the sizes the trial teams actually are, per seat earns more on two of the three and less on the biggest one.',
      '',
      '## Options',
      '1. Per seat (recommended)',
      '2. One flat price per team',
      '3. Per seat, capped at the flat price',
    ].join('\n'),
  });

  rows.push({
    product: 'ferry',
    id: 'w-ed62d2e9e3',
    kind: 'task',
    priority: 4,
    at: now - 55 * MIN,
    title: 'Ferry loses the date on any file older than 2019.',
    body: [
      '**Nothing to answer. This one is in hand.**',
      '',
      "The destination refuses a modified date before its own epoch on a shared drive, so everything older lands stamped today. The fix is to carry the real date in the file's own description and show that in Ferry's list.",
      '',
      'It touches nothing anyone has already moved.',
    ].join('\n'),
  });

  return rows;
}

/* ------------------------------ ledger lines ------------------------------ */

// ONE ROW BECOMES THE LINES IT WOULD REALLY HAVE BEEN WRITTEN AS, because the
// ledger is append-only and everything downstream reads the fold of it. A row
// that was filed, then answered, then finished is three lines with three
// timestamps, and the app's own thread view draws them in that order. Writing
// one fat line instead would give a demo where every row was born finished.
//
// `source` is what decides who may overwrite what (shared/work-items.mjs). Her
// own directive is a founder line, so the demo also shows the case where an
// agent may not rewrite the title, which is the real rule and not a simplified
// one.
export function demoLedgerLines(now = Date.now()) {
  const byProduct = {};
  for (const p of DEMO_PRODUCTS) byProduct[p.slug] = [];

  for (const row of lines(now)) {
    const at = Math.round(row.at);
    const out = byProduct[row.product];

    // Filed. `system` writes the row's existence, the way a created item is
    // written today; the body comes on its own line under whoever wrote it.
    out.push({
      id: row.id,
      ts: at,
      source: 'system',
      patch: { title: row.title, status: 'open', kind: row.kind, priority: row.priority, labels: [] },
    });
    if (row.body) {
      out.push({
        id: row.id,
        ts: at + 1,
        source: row.bodyBy === 'founder' ? 'founder' : 'agent',
        patch: { title: row.title, body: row.body },
      });
    }

    // Finished, with the result on its own later line, which is what makes the
    // inbox row show the result rather than the body (rowSummary, list-rules).
    if (row.status === 'done') {
      out.push({
        id: row.id,
        ts: Math.round(row.statusAt ?? at + HR),
        source: 'agent',
        patch: { status: 'done', result: row.result ?? '' },
      });
    } else if (row.status === 'blocked') {
      out.push({ id: row.id, ts: at + 2, source: 'agent', patch: { status: 'blocked' } });
    }
  }

  return byProduct;
}

/* --------------------------------- papers --------------------------------- */

// A DOCUMENT OR TWO PER PRODUCT, so the documents pane is not empty when she
// opens it in front of somebody. Short on purpose: these are furniture, and a
// long invented strategy memo is a thing somebody in the room will start
// reading instead of watching the demo.
export const DEMO_DOCS = {
  kettle: [
    {
      path: 'notes.md',
      title: 'Kettle notes',
      text: [
        '# Kettle',
        '',
        'Weeknight dinners, planned and shopped in one tap.',
        '',
        'The whole product is one screen: pick a week, get a plan, send the basket.',
        'Everything else is in service of that screen loading in under a second.',
        '',
        '## What is decided',
        '',
        '- The plan screen scales from one person to eight.',
        '- Quantities round to something a shop actually sells.',
        '- No accounts before the first plan. Nobody signs up to look.',
      ].join('\n'),
    },
    {
      path: 'strategy/who-it-is-for.md',
      title: 'Who Kettle is for',
      text: [
        '# Who it is for',
        '',
        'People who can cook and do not want to decide.',
        '',
        'Not people learning to cook, who want a teacher, and not people who already',
        'plan, who want a spreadsheet. The middle is the whole market and it is large.',
      ].join('\n'),
    },
  ],
  marlowe: [
    {
      path: 'notes.md',
      title: 'Marlowe notes',
      text: [
        '# Marlowe',
        '',
        'Reads a contract and says what you just agreed to.',
        '',
        'The test is one sentence: could somebody who has never read a contract',
        'tell you what happens if they want out in March?',
        '',
        '## Open',
        '',
        '- How a risky clause is shown. Margin note or highlight.',
        '- The payment account is unverified, so nothing can be sold yet.',
      ].join('\n'),
    },
  ],
  ferry: [
    {
      path: 'notes.md',
      title: 'Ferry notes',
      text: [
        '# Ferry',
        '',
        'Moves a team off Dropbox without losing a folder.',
        '',
        'The folder tree is the product. Everything else is speed, and speed is',
        'the second thing anybody asks about.',
        '',
        '## Open',
        '',
        '- A price. Per seat or flat.',
        '- Dates on files older than 2019 land wrong. Fix is written, not shipped.',
      ].join('\n'),
    },
  ],
};
