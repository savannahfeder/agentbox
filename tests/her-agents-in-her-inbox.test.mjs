// HER OWN CODING AGENTS, AND WHICH OF THEM IS ALLOWED TO INTERRUPT HER.
//
// Measured on a real machine over one afternoon, and every number below is from
// that reading rather than made up for a test:
//
//   16 Claude Code sessions live, 13 of them started by another app entirely
//   12 of those 13 idle, 1 waiting
//   session-71, pid 68909, status "waiting", waitingFor "input needed",
//     last word 12 August 17:03 — waiting on her for three days and 22 hours,
//     and nothing anywhere surfaced it
//   6 sessions whose last real activity was 29 and 30 July
//
// Two ways this feature goes wrong and neither has a symptom you can see in a
// screenshot, which is why the rules are pure and pinned here rather than
// living inside the reader:
//
//   1. Agentbox shouts its OWN workers back at her. They are already in her inbox
//      as work items; a second row about the same session is a duplicate (an
//      earlier build drew rows two and three of "Inbox 18" as agentbox-bf and
//      agentbox-a8).
//   2. A row that asks nothing buries the one that does. That rule has not
//      moved; what moved is what an idle agent's row SAYS. See below.
//
// UPDATED: a product decision rather than a refinement. The quiet twelve used
// to live in a second tab called "Your agents", and the tab is gone. They are
// all the user's agents, so a separate section for some of them says nothing;
// instead every one of them is migrated into the inbox to be gone through and
// marked done.
//
// So they are in the inbox, they carry an ask (close me), and they sort under
// everything that is genuinely asking. The person who does not want any of this
// is answered by a setting, which is the third argument to reachesInbox.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  AGENT_MODES, agentRow, agentTitle, asksSomething, byRecency, herWords, howLong,
  howItEnded, lastAsk, lastWord, listed, reachesInbox, replyIsSwallowed, replyReaches,
  sameInstant, startedByZero, whatItIs, whereItRuns,
} from '../shared/agents.mjs';
import { outsideAgentsMode } from '../main/settings.mjs';
import { clipToSentence, SUMMARY_BUDGET } from '../renderer/src/list-rules';
import { previewText } from '../renderer/src/format';
import { NAME, Name } from '../shared/product-name.mjs';

const AUG16 = Date.parse('2026-08-16T23:40:00Z');

// session-71 exactly as her machine reported it.
const stalled = {
  pid: 68909,
  ppid: 68899,
  sessionId: 'a71-real-session-id',
  name: 'session-71',
  cwd: '/tmp/agentbox-fixture-repo',
  status: 'waiting',
  waitingFor: 'input needed',
  lastActiveAt: Date.parse('2026-08-12T17:03:00Z'),
  lastSaid: 'I have staged the change and stopped. Which of the two names do you want on the button?',
  startedByZero: false,
};

// `about` is here because her real sessions have one: 14 of her 14 outside
// sessions published a title of themselves, measured 2026-08-17 (`whatItIs`).
// This fixture was written the day before that field was read at all, and a
// session with no title is now a different case with its own rule below.
const idle = {
  pid: 53352,
  name: 'symphony-claude-b1',
  cwd: '/Users/you/dev/symphony-claude',
  about: 'Task 13 re-review for symphony',
  status: 'idle',
  waitingFor: null,
  lastActiveAt: Date.parse('2026-07-30T09:00:00Z'),
  lastSaid: 'Waiting on the Task 13 re-review.',
  startedByZero: false,
};

// One of the app's own: spawned by the Electron main process, so its ppid is
// the app's pid and the app already holds its sessionId.
const ownWorker = {
  pid: 41003,
  ppid: 900,
  sessionId: 'zero-spawned-1',
  name: 'agentbox-bf',
  cwd: '/Users/you/Desktop/dev/zero',
  status: 'waiting',
  waitingFor: 'input needed',
  lastActiveAt: AUG16 - 60_000,
  lastSaid: 'Working.',
  startedByZero: true,
};

describe(`${Name}'s own workers never file a second row`, () => {
  it('folds one out by the process that started it', () => {
    expect(startedByZero({ ppid: 900 }, { pids: new Set([900]) })).toBe(true);
    expect(startedByZero({ ppid: 68899 }, { pids: new Set([900]) })).toBe(false);
  });

  it('folds one out by its sessionId too, so the two keys cannot drift apart', () => {
    const keys = { pids: new Set([900]), sessionIds: new Set(['zero-spawned-1']) };
    // A worker whose parent has been reparented is still ours by session.
    expect(startedByZero({ ppid: 1, sessionId: 'zero-spawned-1' }, keys)).toBe(true);
  });

  it('keeps them out of her inbox, however loudly they are waiting', () => {
    expect(listed(ownWorker)).toBe(false);
    for (const mode of AGENT_MODES) expect(reachesInbox(ownWorker, AUG16, mode)).toBe(false);
  });
});

// Her machine as measured, so every count below is a real one: 13 outside
// sessions, 12 idle and 1 waiting, plus one of the app's own.
const MACHINE = [stalled, ...Array.from({ length: 12 }, (_, i) => ({ ...idle, pid: 100 + i })), ownWorker];

describe('one inbox, and how much of it is her agents is her setting', () => {
  it('all: every outside session is a row, so she can go through them once', () => {
    expect(MACHINE.filter((a) => reachesInbox(a, AUG16, 'all'))).toHaveLength(13);
  });

  // OFF IS THE DEFAULT NOW, and it is not this argument that says so. The app's
  // default is one line in main/settings.mjs and is pinned in
  // tests/a-terminal-session-is-not-in-her-inbox.test.mjs; this argument keeps
  // its own default so the modes can be read here one at a time.
  it('none of them by default, whatever is running on the machine', () => {
    expect(outsideAgentsMode({})).toBe('off');
    expect(MACHINE.filter((a) => reachesInbox(a, AUG16, outsideAgentsMode({})))).toHaveLength(0);
  });

  // AND THE ROW SHE NAMED CANNOT BE FILED IN ANY MODE.That headline is what a
  // session with no title of its own falls back to, and the body under it asks
  // her to close a row that asked her nothing. Closing one never helped: a
  // throwaway session gets a fresh pid every time, so E is keyed to an id that
  // never comes back.
  it('a session with no title of its own is never a row, in any mode', () => {
    const throwaway = { ...idle, name: 'run-402', about: '', lastSaid: '' };
    expect(agentTitle(throwaway, AUG16)).toMatch(/has been quiet for/);
    for (const mode of AGENT_MODES) expect(reachesInbox(throwaway, AUG16, mode)).toBe(false);
    expect(reachesInbox(throwaway, AUG16, 'nonsense')).toBe(false);
  });

  // The one exception, because it is the whole point of the inbox: a session
  // stopped on a question reaches her even with nothing to call itself.
  it('unless it has stopped and is waiting for her', () => {
    const nameless = { ...stalled, about: '' };
    expect(reachesInbox(nameless, AUG16, 'all')).toBe(true);
    expect(reachesInbox(nameless, AUG16, 'waiting')).toBe(true);
  });

  it('waiting: only the one stopped on a question, which is what it did before', () => {
    expect(asksSomething(stalled)).toBe(true);
    expect(asksSomething(idle)).toBe(false);
    expect(MACHINE.filter((a) => reachesInbox(a, AUG16, 'waiting'))).toHaveLength(1);
  });

  it('off: none at all, for the person who processes their agents elsewhere', () => {
    expect(MACHINE.filter((a) => reachesInbox(a, AUG16, 'off'))).toHaveLength(0);
  });

  it('a mode nobody understands is not silently an empty inbox', () => {
    // Nothing may narrow the list by accident: a junk value behaves as the
    // default rather than hiding her agents. The write side refuses it outright
    // (main/settings.mjs); this is the second lock.
    expect(reachesInbox(stalled, AUG16, 'nonsense')).toBe(true);
    expect(reachesInbox(idle, AUG16, 'nonsense')).toBe(true);
  });

  it('a row she closed stays closed whatever the setting says', () => {
    const closed = { ...idle, doneThrough: idle.lastActiveAt + 1 };
    for (const mode of AGENT_MODES) expect(reachesInbox(closed, AUG16, mode)).toBe(false);
  });

  it('and a row she put off is out until the moment she named', () => {
    const later = { ...stalled, runAt: AUG16 + 3600_000 };
    for (const mode of AGENT_MODES) expect(reachesInbox(later, AUG16, mode)).toBe(false);
  });

  it('still lists every outside session, which is what has no second tab now', () => {
    expect(MACHINE.filter(listed)).toHaveLength(13);
  });
});

describe('a reply is offered only where a reply lands', () => {
  it('an agent waiting for somebody to type takes one', () => {
    expect(replyReaches(stalled)).toBe(true);
  });

  // The distinction the whole honesty of the feature rests on. A message sent
  // to a session frozen on a permission box queues BEHIND the box: it would
  // look like it worked and change nothing, which is the system swallowing
  // something she said.
  it('an agent frozen on a permission box does not', () => {
    expect(replyReaches({ ...stalled, waitingFor: 'permission prompt' })).toBe(false);
  });

  it('and neither does an idle one, which is not asking anything', () => {
    expect(replyReaches(idle)).toBe(false);
  });
});

// `replyReaches` answers a different question — has it stopped FOR HER — and
// it stays the row's rule.
describe('the only agent she cannot write to is the one behind a box', () => {
  it('a quiet session takes a message: it is at its prompt, listening', () => {
    expect(replyIsSwallowed(idle)).toBe(false);
  });

  it('an agent waiting for somebody to type takes one', () => {
    expect(replyIsSwallowed(stalled)).toBe(false);
  });

  it('an agent frozen on a permission box is the one that does not', () => {
    expect(replyIsSwallowed({ ...stalled, waitingFor: 'permission prompt' })).toBe(true);
  });

  it('and it agrees with the one place that actually refuses a send', () => {
    // main/agents.mjs `reply` refuses exactly this case and nothing else, so
    // the UI gate and the delivery gate cannot drift apart.
    const main = fs.readFileSync(new URL('../main/agents.mjs', import.meta.url), 'utf8');
    expect(main).toMatch(/if \(agent\.waitingFor === 'permission prompt'\) \{/);
    expect(main).not.toMatch(/if \(!replyReaches\(agent\)\)/);
  });
});

describe('the row says the whole point inside the 112 characters she is shown', () => {
  // SUMMARY_BUDGET is 112 and clipToSentence cuts on the last full stop inside
  // it. A first sentence longer than that leaves her reading half an ask.
  const fits = (row) => {
    const shown = clipToSentence(previewText(row.body));
    return { shown, ok: shown.length <= SUMMARY_BUDGET && !shown.endsWith('…') };
  };

  it('the stopped agent asks her to answer it, and the ask survives the clip', () => {
    const row = agentRow(stalled, AUG16);
    expect(row.title).toBe('session-71 is waiting for you');   // no title of its own
    const { shown, ok } = fits(row);
    expect(ok).toBe(true);
    expect(shown).toContain('Reply to session-71');
    expect(shown).toContain('4 days');
  });

  it('the permission-box agent says where it has to be answered', () => {
    const row = agentRow({ ...stalled, waitingFor: 'permission prompt' }, AUG16);
    expect(row.title).toBe('session-71 needs you where it is running');
    const { shown, ok } = fits(row);
    expect(ok).toBe(true);
    expect(shown).toContain('in its own window');
  });

  // A QUIET AGENT IS IN HER INBOX NOW, so it has to say what to do with it.
  // Before 2026-08-17 it lived in a tab of its own and opened with a flat
  // statement; a row in the inbox that states a fact and asks nothing is the
  // thing her own rules forbid. The ask is the honest one: close it.
  it('a quiet agent asks to be closed, and says the session keeps running', () => {
    const row = agentRow(idle, AUG16);
    expect(row.body.startsWith('**Close symphony-claude-b1')).toBe(true);
    expect(row.body).toContain('It is asking for nothing');
    // The sentence that makes it pressable at speed: E is about her inbox and
    // touches nobody's terminal.
    expect(row.body).toContain('leaves the session running');
    expect(fits(row).ok).toBe(true);
  });

  it('a very long last message never pushes the ask out of the row', () => {
    const row = agentRow({ ...stalled, lastSaid: 'x'.repeat(4000) }, AUG16);
    expect(fits(row).ok).toBe(true);
  });
});

// WHAT THE SESSION IS ABOUT, 2026-08-17.
//
// The card had the agent's NAME, how long it had waited, and a sentence of what
// it last said. `session-71` is a handle, not a memory of anything, and the
// three facts that would have jogged it were already in the transcript the app
// reads and were being thrown away.
//
// Shaped like real transcript text, so this is what the card really has to
// hold rather than a convenient shape.
const remembered = {
  ...stalled,
  about: `${NAME} product not displaying in Harbour`,
  lastAsked: 'sounds good. just make sure the login is remembered between sessions now that i am signed in. and above all, make sure our work is saved to the cloud.',
  lastSaid: "The sync is running steadily (+300 rows in 5 min) but the queue count isn't going down. Checking each project next:",
  touched: ['sync-service.mjs', 'store.mjs', 'cloud.mjs'],
  productName: 'Harbour',
};

describe('an agent row says what the work actually is', () => {
  it('leads with the session\'s own one-line title, which is the sentence she could not remember', () => {
    expect(whatItIs(remembered)).toBe(`${NAME} product not displaying in Harbour`);
    expect(agentTitle(remembered, AUG16))
      .toBe(`session-71: ${NAME} product not displaying in Harbour`);
  });

  it('keeps the name in front of it, because two sessions run in the same folder', () => {
    expect(agentTitle(remembered, AUG16).startsWith('session-71:')).toBe(true);
  });

  // The quiet sentence is still what `agentTitle` says, because a session can
  // be title-less anywhere the title is drawn: the rail, an opened agent, the
  // In progress row after she has replied. What changed on 2026-08-27 is that
  // a title-less session which is not asking her anything never becomes an
  // INBOX row at all, which is `reachesInbox` above and not this.
  it('falls back to what it always said when a session has no title of its own', () => {
    expect(agentTitle(stalled, AUG16)).toBe('session-71 is waiting for you');
    expect(agentTitle({ ...idle, about: '' }, AUG16)).toBe('symphony-claude-b1 has been quiet for 17 days');
  });

  it('carries the last thing SHE typed into it, cut to a sentence', () => {
    const row = agentRow(remembered, AUG16);
    expect(row.body).toContain('The last thing you told it:');
    expect(row.body).toContain('sounds good.');
    expect(lastAsk(remembered).length).toBeLessThanOrEqual(181);
  });

  it('carries what it said back, and the files it has been in', () => {
    const row = agentRow(remembered, AUG16);
    expect(row.body).toContain('It stopped here:');
    expect(row.body).toContain('It is working in Harbour, in sync-service.mjs, store.mjs and cloud.mjs.');
  });

  // NEVER CALLS HER LAST MESSAGE HER FIRST. Measured: on session-71 the two
  // are completely different messages.
  it('does not pass off the last thing she typed as the thing she started with', () => {
    const row = agentRow(remembered, AUG16);
    expect(row.body).not.toContain('You started it');
  });

  it('drops the image markers, which are not something she typed', () => {
    // Her prompts routinely carry [Image #1]; printing that back at her is
    // noise standing where a word should be.
    expect(lastAsk({ lastAsked: 'make this bolder [Image #2] please' })).toBe('make this bolder please');
  });

  it('says nothing rather than something empty when a session has no history', () => {
    const bare = agentRow({ ...remembered, lastSaid: '', lastAsked: '', asked: [], touched: [] }, AUG16);
    expect(bare.body).not.toContain('you told it');
    expect(bare.body).not.toContain('It stopped here');
    expect(bare.body).toContain('It is working in Harbour.');
  });

  it('and the ask is still the first thing she reads, inside the clip', () => {
    const row = agentRow(remembered, AUG16);
    expect(row.body.startsWith('**Reply to session-71')).toBe(true);
    const shown = clipToSentence(previewText(row.body));
    expect(shown.length).toBeLessThanOrEqual(SUMMARY_BUDGET);
    expect(shown).toContain('Reply to session-71');
  });
});

/* ------------------------- REMEMBERING IT FIVE DAYS ON -------------------- */
// A card that ALREADY had the title and the last thing typed into the session
// still did not say what the session was for. Both of those are tested above;
// neither was enough.
//
// A session's human side, as fixture data. Two messages in five days, 586
// characters, and the first one is the ask that
// no card had ever shown her.
const AUG17 = Date.parse('2026-08-17T14:00:00Z');
const recalled = {
  ...remembered,
  lastActiveAt: Date.parse('2026-08-17T13:20:00Z'),
  asked: [
    {
      at: Date.parse('2026-08-12T22:58:52Z'),
      text: "I added a new project in Harbour called Powerup but it is not in the list [Image #1]. I want to see it there so i can give it tasks.",
    },
    {
      at: Date.parse('2026-08-12T23:52:25Z'),
      text: 'sounds good. just make sure the login is remembered between sessions now that i am signed in. and above all, make sure our work is saved to harbour, that was weeks of work that could be lost.',
    },
  ],
};

describe('a five-day-old agent can be recalled without a model reading anything', () => {
  it('leads the recall with the message she STARTED it with, which is the ask', () => {
    const row = agentRow(recalled, AUG17);
    expect(row.body).toContain('**You started it 4 days ago with:**');
    expect(row.body).toContain('I added a new project in Harbour called Powerup but it is not in the list. I want to see it there');
  });

  it('says how long ago she started it, so days-old reads as days-old', () => {
    expect(agentRow(recalled, AUG17).body).toContain('4 days ago');
  });

  it('then says where the thread got to, in her own words and in order', () => {
    const row = agentRow(recalled, AUG17);
    const started = row.body.indexOf('You started it');
    const then = row.body.indexOf('Then you said');
    expect(then).toBeGreaterThan(started);
    expect(row.body).toContain('login is remembered between sessions');
  });

  it('drops the image markers out of her own words too', () => {
    expect(agentRow(recalled, AUG17).body).not.toContain('[Image #1]');
  });

  it('keeps the opening forever and windows the rest, so a long thread still recalls', () => {
    // session-21 ran to 25 of her messages. The first is still the ask.
    const many = {
      ...recalled,
      asked: [
        recalled.asked[0],
        ...Array.from({ length: 24 }, (_, i) => ({
          at: Date.parse('2026-08-13T00:00:00Z') + i * 60_000,
          text: `message number ${i + 2} which she typed while it worked`,
        })),
      ],
    };
    const row = agentRow(many, AUG17);
    expect(row.body).toContain('I added a new project in Harbour called Powerup');
    expect(row.body).toContain('message number 25');
    expect(row.body).toContain('over 24 more messages,');
    // And it stays a card, not a transcript.
    expect(row.body.length).toBeLessThan(2400);
  });

  // ONE SHAPE, AND NOTHING CAN ASK FOR ANOTHER.
  it('draws one shape on every session and takes no size argument', () => {
    // One required parameter, the agent. `now` is defaulted, which is where
    // Function.length stops counting, so 1 here is the whole signature.
    expect(agentRow).toHaveLength(1);
    const body = agentRow(recalled, AUG17).body;
    expect(body).toContain('You started it');
    expect(body).toContain('Then you said');
    expect(body).not.toContain('has had its hands on');
    expect(agentRow(recalled, AUG17, 'ask').body).toBe(body);
    expect(agentRow(recalled, AUG17, 'trail').body).toBe(body);
  });

  // WHAT SHE TYPES WHILE IT WORKS IS MOSTLY DRIVING, NOT DESCRIBING, and the
  // card has room for three. The substantive ones are behind them.
  const sessionCf = {
    ...recalled,
    asked: [
      { at: Date.parse('2026-08-11T19:32:00Z'), text: "I'd like to add daily repeating tasks to the app. The same way a cron job can run “every day at 9am”, I want to be able to set that up here too." },
      { at: Date.parse('2026-08-12T16:54:00Z'), text: "I don't need to review the code myself, you can ask another agent to review it and then carry on without my sign-off." },
      { at: Date.parse('2026-08-12T17:52:00Z'), text: 'go ahead. there is no daily spending cap here, that only applies to image generation. if agents think it applies everywhere that is a problem.' },
      { at: Date.parse('2026-08-12T19:09:00Z'), text: 'found it now! but the option should show up every time, not only when it guesses it from what i type.' },
      { at: Date.parse('2026-08-12T19:30:00Z'), text: 'this button does nothing' },
      { at: Date.parse('2026-08-12T19:31:00Z'), text: 'oh that works got it' },
      { at: Date.parse('2026-08-14T19:40:00Z'), text: 'try it again please' },
    ],
  };

  it('prefers the messages that recall something over the ones that drove it', () => {
    const row = agentRow(sessionCf, AUG17);
    expect(row.body).toContain("don't need to review the code myself");
    expect(row.body).toContain('there is no daily spending cap');
    expect(row.body).toContain('the option should show up every time');
    expect(row.body).not.toContain('oh that works got it');
    expect(row.body).not.toContain('try it again please');
    // And it says out loud that it is showing three of a longer thread.
    expect(row.body).toContain('over 6 more messages,');
  });

  it('still shows the short ones when there is nothing longer', () => {
    const terse = { ...sessionCf, asked: [sessionCf.asked[0], sessionCf.asked[5], sessionCf.asked[6]] };
    const row = agentRow(terse, AUG17);
    expect(row.body).toContain('oh that works got it');
    expect(row.body).toContain('try it again please');
  });

  it('herWords is empty rather than guessing when there is no history', () => {
    expect(herWords({ lastAsked: 'something she typed last' })).toEqual([]);
    expect(herWords(recalled)).toHaveLength(2);
  });
});

describe('the words are the ones she would use', () => {
  it('counts the wait in days, hours and minutes, never in milliseconds', () => {
    expect(howLong(4 * 86400000)).toBe('4 days');
    expect(howLong(86400000)).toBe('1 day');
    expect(howLong(3 * 3600000)).toBe('3 hours');
    expect(howLong(90_000)).toBe('1 minute');
  });

  it('names the product when one owns the folder, and the folder when none does', () => {
    expect(whereItRuns({ ...idle, productName: 'Harbour' })).toBe('Harbour');
    expect(whereItRuns(idle)).toBe('symphony-claude');
  });

  it('cuts the last thing it said to one sentence, not mid-word', () => {
    const said = lastWord({ lastSaid: `${'a'.repeat(60)}. ${'b'.repeat(400)}` });
    expect(said.endsWith('.')).toBe(true);
  });

  it('strips the markdown, so no asterisks reach the row', () => {
    expect(lastWord({ lastSaid: '**Done.** See `main/x.mjs`' })).toBe('Done. See main/x.mjs');
  });
});

// The answer here is the END. She opens with her ask and an agent closes with
// its finding, so quoting the first sentence of a reply reliably showed her the
// preamble. MEASURED on session-46: asked for a status, the card quoted "The
// peer roster turned over completely", while the sentence that answered the
// question was four paragraphs down.
describe('the card quotes the end of a reply, because that is where the answer is', () => {
  it('gives a short reply back whole', () => {
    expect(howItEnded('Done, nothing in flight.')).toBe('Done, nothing in flight.');
  });

  it('keeps the last sentences of a long one and says something came before', () => {
    const said = `${'Looking at the store. '.repeat(40)}Nothing is pending here.`;
    const out = howItEnded(said);
    expect(out.endsWith('Nothing is pending here.')).toBe(true);
    expect(out.startsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(321);
  });

  it('opens on a sentence rather than mid-clause', () => {
    const out = howItEnded(`${'x'.repeat(600)}. And then the part that answers her.`);
    expect(out).toBe('…And then the part that answers her.');
  });

  it('cuts on a word when the last sentence is longer than the whole budget', () => {
    const out = howItEnded(`short. ${'y'.repeat(900)}`);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('y')).toBe(true);
  });

  it('strips the markdown here too, so no asterisks reach the card', () => {
    expect(howItEnded('**Done.** See `main/x.mjs`')).toBe('Done. See main/x.mjs');
  });
});

// AND SAYS WHEN IT SAID IT. The quote used to be headed "It stopped here:" with
// no time on it, so a session that had answered every one of her messages and
// one that had said nothing for two days drew the identical card.
describe('the card dates what it said against what she asked', () => {
  const said = Date.parse('2026-08-16T23:10:00Z');
  const base = { ...stalled, lastSaid: 'Nothing is pending here.', saidAt: said };

  it('says it answered, and how long ago, when its reply is newer than her message', () => {
    const row = agentRow({ ...base, repliedAt: Date.parse('2026-08-16T23:00:00Z') }, AUG16);
    expect(row.body).toContain('**It answered 30 minutes ago:**');
    expect(row.body).toContain('“Nothing is pending here.”');
  });

  it('says it has not answered when her message is the newer of the two', () => {
    const row = agentRow({ ...base, repliedAt: Date.parse('2026-08-16T23:38:00Z') }, AUG16);
    expect(row.body).toContain('**It has not answered yet. It last spoke 30 minutes ago:**');
  });

  // Her words reach the card through `spoke` as well as `asked`, and either of
  // them being the newer thing means the same: she has spoken since it did.
  it(`counts a message delivered from ${NAME} as her having spoken`, () => {
    const row = agentRow({ ...base, spoke: [{ at: Date.parse('2026-08-16T23:38:00Z'), text: 'status?' }], asked: [{ at: 1, text: 'do the thing' }] }, AUG16);
    expect(row.body).toContain('**It has not answered yet.');
  });

  // An old cache has no `saidAt` on it, and a card with no time is still better
  // than a card with a guessed one.
  it('falls back to the undated wording when nothing knows when it spoke', () => {
    const row = agentRow({ ...stalled, lastSaid: 'Nothing is pending here.' }, AUG16);
    expect(row.body).toContain('**It stopped here:**');
  });
});

describe('the agents list reads in the order every other list does', () => {
  // The tab writes a day heading as it goes, so sorting the waiting one to the
  // top instead put "Last 7 days" on screen twice, eight rows apart, in the
  // built app (2026-08-16). The stopped agent does not need pinning here: it is
  // in her INBOX, which is where it asks her for something.
  it('puts the most recently active first', () => {
    expect([idle, stalled].sort(byRecency)[0].name).toBe('session-71');
  });

  it('so the days never go backwards and then forwards again', () => {
    const mid = { ...idle, name: 'mid', lastActiveAt: Date.parse('2026-08-01T00:00:00Z') };
    const days = [idle, stalled, mid].sort(byRecency).map((a) => a.lastActiveAt);
    expect(days).toEqual([...days].sort((x, y) => y - x));
  });
});



// THE BUG THAT SHOWED HER THREE OF HER SIXTEEN AGENTS, 2026-08-16. A session's
// state file records when its process started, and so does `ps`, and the two
// label the same instant in different timezones. String-comparing them decided
// that every session with a state file was dead. There was no symptom: the list
// was simply short, and the one agent that had been waiting four days was not
// in it.
describe('a live agent is not called dead by a timezone label', () => {
  it('accepts session-71, whose two clocks were seven hours apart', () => {
    // Verbatim from her machine: the state file and `ps -o lstart`.
    expect(sameInstant('Wed Aug 12 22:57:59 2026', 'Wed Aug 12 15:57:59 2026')).toBe(true);
  });

  it('accepts the ordinary case where both agree', () => {
    expect(sameInstant('Wed Aug 12 17:24:29 2026', 'Wed Aug 12 17:24:29 2026')).toBe(true);
  });

  it('still refuses a genuinely different process at the same pid', () => {
    // Seconds apart, minutes apart, a day apart: none of these is a timezone.
    expect(sameInstant('Wed Aug 12 15:57:59 2026', 'Wed Aug 12 15:58:03 2026')).toBe(false);
    expect(sameInstant('Wed Aug 12 15:57:59 2026', 'Wed Aug 12 16:12:59 2026')).toBe(false);
    expect(sameInstant('Wed Aug 12 15:57:59 2026', 'Thu Aug 13 15:57:59 2026')).toBe(false);
  });

  it('refuses a gap no timezone reaches, and refuses nonsense', () => {
    expect(sameInstant('Wed Aug 12 15:57:59 2026', 'Thu Aug 13 06:57:59 2026')).toBe(false);
    expect(sameInstant('not a date', 'Wed Aug 12 15:57:59 2026')).toBe(false);
  });
});
