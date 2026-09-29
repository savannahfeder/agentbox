// PURE. Her Claude Code agents, as rows: which ones Agentbox shows, which one
// reaches her inbox, and what each one says. Measurement lives in
// main/agents.mjs; nothing here touches a process, a socket or a file.
//
// The rules are out here, and not inside the reader, for the reason
// list-rules.ts is: WHAT IS MISSING FROM A LIST HAS NO SYMPTOM. Every inbox
// this could draw looks plausible, and the way it goes wrong is that an agent
// waiting four days is not in it and nothing anywhere says so.
//
// Measured on her machine 2026-08-16, and this is the whole reason the feature
// exists: 16 Claude Code sessions live, 13 of them started by another app, and
// session-71 sitting on `waitingFor: "input needed"` since Wednesday 17:03.
// Nothing on the machine surfaced that.

/* ------------------------- is that process still it ---------------------- */
// A PID IS NOT AN IDENTITY: a session's state file outlives the process it
// describes and pids get reused, so a record is only believed when a live
// process at that pid started at the same moment.
//
// THE TWO CLOCKS DO NOT AGREE ON THEIR LABEL, and this is the bug this function
// exists for. The state file prints its start time in whatever timezone the
// session was started under; `ps -o lstart` prints local. On her machine
// 2026-08-16 session-71 read "Wed Aug 12 22:57:59 2026" in its state file and
// "Wed Aug 12 15:57:59 2026" in ps — the same instant, seven hours apart on the
// label. Comparing the two strings called all sixteen of her live sessions dead
// and showed her three, which is the whole feature quietly not working.
//
// So they are compared as instants, and a gap that is an exact whole number of
// hours is exactly what a timezone label costs and nothing else: two genuinely
// different processes do not start a whole number of hours apart to the second.
import { NAME } from '../shared/product-name.mjs';
const HOUR = 3_600_000;

export function sameInstant(a, b) {
  const one = Date.parse(a);
  const two = Date.parse(b);
  if (!Number.isFinite(one) || !Number.isFinite(two)) return false;
  const gap = Math.abs(one - two);
  return gap % HOUR === 0 && gap <= 14 * HOUR;
}

/* ----------------------------- whose agent is it ------------------------- */
// ZERO'S OWN WORKERS ARE ITS OWN CHILDREN. The supervisor runs `claude -p` from
// the Electron main process, so a worker's ppid is the app's pid and nothing else
// on the machine has that shape. That is the dedupe key, and it needs no name
// matching or guessing.
//
// The sessionId is a second, independent key for the same fact: the supervisor
// already records each worker's sessionId when it spawns it. Either alone is
// enough; both means the fold cannot drift as one of them changes.
//
// This matters because without it Agentbox shouts its own work back at the
// user. In the raw list, Agentbox's own workers, already in the inbox as work
// items, showed up again as a second row about themselves.
export function startedByZero(agent, { pids = new Set(), sessionIds = new Set() } = {}) {
  if (agent.sessionId && sessionIds.has(agent.sessionId)) return true;
  return !!agent.ppid && pids.has(agent.ppid);
}

/* --------------------------- is it asking anything ----------------------- */
// A ROW THAT ASKS NOTHING DOES NOT GET FILED. A standing rule, and the one
// place this feature could most easily break it: most outside agents on a
// machine are idle at any moment, and filing them all puts a wall of rows in
// the inbox that say "nothing is asked".
//
// So the inbox takes exactly the agents that are waiting on a human. The
// others are still listed, still findable, one keystroke away — they just do
// not interrupt.
export function asksSomething(agent) {
  return agent.status === 'waiting';
}

// WHAT A REPLY CAN ACTUALLY FIX, and the distinction is not cosmetic: the two
// waiting states behave completely differently and only one of them is a
// question a message answers.
//
//   "input needed"      the agent finished its turn and is waiting for a human
//                       to say something next. A message IS that human turn.
//                       Proven on this machine 2026-08-16: a message written
//                       to a live session's socket arrived, was read as the
//                       human turn, and the agent went back to work.
//
//   "permission prompt" the agent is frozen on a box asking to approve a tool
//                       call. A message queues BEHIND that box. Sending one
//                       would look like it worked and change nothing, which is
//                       the failure this codebase cares about most: the system
//                       swallowing something the user said.
//
// So a reply box appears on the first and never on the second, and the second
// says out loud that it has to be answered where it is running.
//
// `replyReaches` is about the ROW: whether the agent stopped and is waiting on
// her, which is what decides the row's headline and whether it interrupts at
// all. It is NOT the gate on the reply box any more — see `replyIsSwallowed`.
export function replyReaches(agent) {
  return asksSomething(agent) && agent.waitingFor === 'input needed';
}

// THE ONE AGENT SHE CANNOT WRITE TO, and it is only ever this one.
//
// There was not one. The box was hidden on every agent that was not waiting on
// `input needed`, which is nearly all of them, and the dock said out loud that
// there was nothing there to answer. That sentence was wrong.
//
// MEASURED 2026-08-17, not reasoned: a throwaway session was left sitting at
// its prompt with nothing asked, the exact state of the card in question, and
// the same line `reply` writes was written into its socket. It arrived, the
// session read it and went back to work and answered it. An idle session is
// listening; idle is what a session at its prompt IS.
//
// So the gate is the single case where a message really is swallowed: the
// agent frozen on a permission box, where anything she types queues behind the
// box instead of clearing it. `main/agents.mjs` already refused exactly that
// one and nothing else, so the UI was the whole of the block.
export function replyIsSwallowed(agent) {
  return agent?.waitingFor === 'permission prompt';
}

/* ------------------------- SHE SPOKE, IT IS WORKING ---------------------- */
// WHAT A REPLY DOES TO THE ROW, which until now was nothing at all.
//
// It had not moved because no rule in this app had ever heard of a reply to an
// agent.
//
// So a replied-to agent goes where a replied-to work item goes: In progress,
// which in this app is a PROMISE that something is on it or about to be. The
// promise has to be one that ends, or the row never comes back and she has a
// list that only grows. It ends the moment the session comes to a stop she can
// see, and there are exactly two of those:
//
//   idle      it finished the turn and is back at its prompt. That is the
//             answer arriving, and the answer belongs in her inbox.
//   waiting   it stopped to ask her something. Same, more so.
//
// MEASURED, not reasoned, on her machine 2026-08-17 (claude 2.1.234): a session
// publishes `status` as one of busy, shell, idle, waiting, and stamps
// `statusUpdatedAt` every time that moves. 15 of her 16 live sessions were
// publishing one. So the comparison is against a real clock the session keeps
// itself, and the row leaves In progress because the SESSION stopped, never
// because a timer here ran out.
//
// The comparison is `>`, against the stamp and not the status alone, because
// the session is still idle for the moment or two between the user pressing
// send and it picking the message up. Reading the status alone would send the
// row straight back to the inbox, which is the original bug wearing a hat.
//
// AND THE ONE SESSION THIS CANNOT PROMISE ANYTHING ABOUT: one that publishes no
// status at all (an older CLI). Agentbox cannot see that one work
// and cannot see it stop, so it is not moved anywhere and the reply is still
// delivered. A promise that could never be kept is worse than no promise.
export function tookHerReply(agent) {
  const spoke = agent?.repliedAt ?? 0;
  if (!spoke) return false;
  if (!agent?.status) return false;       // nothing published: no promise to make
  if (putAway(agent)) return false;       // she closed the row; closed is closed
  return !stoppedSince(agent, spoke);
}

// Has it come to a stop since the moment given? `statusAt` is the session's own
// stamp on its own status, so a session that never publishes one has never been
// seen to stop and this is false — which is why `tookHerReply` refuses that
// case up front rather than trusting this.
export function stoppedSince(agent, since) {
  const at = agent?.statusAt ?? 0;
  if (at <= since) return false;
  return agent?.status === 'idle' || agent?.status === 'waiting';
}

/* ------------------------------- until later ----------------------------- */
// AN AGENT ROW SHE CAN PUT OFF. A silent no-op is the failure this codebase
// cares about most wearing different clothes — she pressed a key, the app took
// it, and nothing happened.
//
// What deferring one MEANS is only ever about her inbox. Nothing is sent, no
// process is touched and the session keeps waiting exactly as it was: the row
// stops interrupting her until the moment she named, and it is in Scheduled the
// whole time. That is the honest whole of it, and it is why
// this is a moment kept beside the reading rather than anything written into
// somebody else's terminal.

// WHICH AGENT SHE PUT OFF, and it cannot be the pid. The row's id is
// `agent:<pid>` because that is what the list needs today, but a pid is not an
// identity (see sameInstant above): pids get reused, and the next session to
// land on 68909 would inherit a deferral she set on session-71. The sessionId
// is the session's own name for itself and is what the transcript, the state
// file and the CLI all agree on, so it is the key whenever there is one. When
// there is not, the pid is qualified by the instant that process started, which
// is the same pair `stillTheSame` trusts.
export function agentKey(agent) {
  if (agent?.sessionId) return `session:${agent.sessionId}`;
  return `pid:${agent?.pid ?? 0}:${agent?.startedAt ?? 0}`;
}

// The moment the user said they would deal with it. A past moment is not a deferral:
// once it passes the row is back, which is the same predicate rule work items
// follow. So a missed one comes back late rather than being lost, and nothing
// has to fire at 8am.
export function putOff(agent, now = Date.now()) {
  return (agent?.runAt ?? 0) > now;
}

// AND DONE STAYS DONE.
//
// This used to be a watermark. `doneThrough` held the agent's own last activity
// at the moment she closed the row, and the row came back the moment that
// session did anything newer. The reasoning was that a session which has spoken
// since she dismissed it is news again. A session she has closed goes on
// working in its own terminal, its activity passed the mark within minutes, and
// the row she had dealt with came back.
//
// So the mark is now read as a flag: closed is closed, for as long as that
// session exists. WHAT THIS COSTS, stated rather than hidden: a session she
// closes while it is working will not return to her inbox when it later stops
// and asks something. That is the same sentence read the other way, and it is
// the one that was chosen.
//
// "UNLESS ASKED OTHERWISE" IS THE UNDO, and it is why this stays a number in
// the file instead of becoming a boolean: `close(key, 0)` clears it, which is
// what Z does after she closes a row (`closeAgentRow` in App.tsx). The value
// still records WHEN she closed it, which is worth keeping and is no longer
// compared against anything.
//
// Nothing is sent and the session is not touched, exactly as with putting one
// off: this is a fact about her inbox.
export function putAway(agent) {
  return (agent?.doneThrough ?? 0) > 0;
}

/* -------------------------------- the words ------------------------------ */
// Plain sentences, no jargon, no metaphor, and the first line of the body is
// the one thing the user has to do about it, in bold, one
// sentence, under fifteen words (instructions.md). The row clips at
// SUMMARY_BUDGET = 112 characters on the last full stop inside it, so that
// sentence has to carry the whole point on its own.
export function howLong(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'a moment';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const mins = Math.max(1, Math.floor(ms / 60000));
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

// The folder it is working in, said the way she would say it. Not the path: A
// long "/Users/you/Desktop/dev/<repo>" is four words of noise around the one
// word that identifies it.
export function whereItRuns(agent) {
  const owner = agent.productName;
  if (owner) return owner;
  const cwd = agent.cwd ?? '';
  const leaf = cwd.split('/').filter(Boolean).pop();
  return leaf || 'an unknown folder';
}

// Somebody's typing, flattened to one readable line. Markdown markers go
// because the card quotes this inside its own markdown; a fenced code block
// goes because a card is not a diff viewer.
//
// Split out from `oneSentence` when `howItEnded` needed the same cleaning from
// the other end of the message. One copy, so a quote of the user's and a quote of its
// answer can never be tidied by two different rules.
function readableWords(raw) {
  return String(raw ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[Image[^\]]*\]/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trim();
}

// One line of somebody's typing, cut to a sentence, FROM THE FRONT. That is
// right for her and wrong for an agent; see `howItEnded`.
function oneSentence(raw, budget = 180) {
  const text = readableWords(raw);
  if (!text) return '';
  if (text.length <= budget) return text;
  const window = text.slice(0, budget + 1);
  const end = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (end > 40) return text.slice(0, end + 1);
  return `${text.slice(0, window.lastIndexOf(' ') > 40 ? window.lastIndexOf(' ') : budget).trimEnd()}…`;
}

export function lastWord(agent, budget = 180) {
  return oneSentence(agent.lastSaid, budget);
}

// HOW ITS ANSWER ENDED, WHICH IS WHERE THE ANSWER IS.
//
// `oneSentence` takes the FRONT of a message, and for her that is right: she
// opens with the ask. An agent does the opposite. It opens with what it looked
// at and closes with what it found, so quoting its first sentence on the card
// reliably showed her the preamble and hid the point.
//
// So this reads the same message from the other end. Same cleaning as
// `oneSentence`, then whole sentences off the BACK until the budget is full,
// with a leading ellipsis when there was more in front of them.
export function howItEnded(raw, budget = 320) {
  const text = readableWords(raw);
  if (!text) return '';
  if (text.length <= budget) return text;
  const tail = text.slice(-budget);
  // Start at a sentence, so the quote never opens mid-clause. If the last
  // sentence is itself longer than the budget there is no boundary to find, and
  // a clean word break is the best honest cut.
  const starts = [tail.indexOf('. '), tail.indexOf('? '), tail.indexOf('! ')].filter((i) => i >= 0);
  const at = starts.length ? Math.min(...starts) + 2 : -1;
  const cut = at >= 0 && at < budget - 40 ? tail.slice(at) : tail.slice(tail.indexOf(' ') + 1);
  return `…${cut.trim()}`;
}

// WHEN IT LAST SPOKE, AND WHETHER THAT WAS AN ANSWER TO HER.
//
// The card used to head the quote "It stopped here:" with no time on it at all,
// so a session that had answered every one of her messages and a session that
// had said nothing for two days drew the identical heading. Six cards that
// looked the same because the one fact that told them apart was not on any of
// them.
function saidWhen(agent, now) {
  const at = Number(agent?.saidAt) || 0;
  if (!at) return '**It stopped here:**';
  const when = ago(at, now);
  const hers = Math.max(
    Number(agent?.repliedAt) || 0,
    ...herWords(agent).map((t) => Number(t?.at) || 0),
  );
  if (hers && hers > at) return `**It has not answered yet. It last spoke ${when}:**`;
  return `**It answered ${when}:**`;
}

// THE LAST THING THE USER TYPED INTO IT. Read straight off the session's own
// `last-prompt` line, so it is the user's turn and never a tool result wearing a user
// message's clothes.
export function lastAsk(agent, budget = 180) {
  return oneSentence(agent.lastAsked, budget);
}

/* ------------------------------- what it IS ------------------------------ */
// A card whose loudest word is `session-71` says nothing. A session name is a
// handle, not a memory.
//
// Every Claude Code session writes a one-line title of ITSELF into its own
// transcript and keeps it current. Every outside session measured had one, and
// it is usually the very sentence a person would use to recall the work,
// sitting in a file Agentbox was already reading and throwing away.
//
// So the title of the row is what the work IS, with the session's name in front
// of it because two sessions can run in the same folder and the name is how
// they are told apart. When a session has no title of its own the row says
// what it used to say, which is better than a blank.
export function whatItIs(agent) {
  return String(agent?.about ?? '').replace(/\s+/g, ' ').trim();
}

export function agentTitle(agent, now = Date.now()) {
  const about = whatItIs(agent);
  if (about) return `${agent.name}: ${about}`;
  if (replyReaches(agent)) return `${agent.name} is waiting for you`;
  if (asksSomething(agent)) return `${agent.name} needs you where it is running`;
  // NOT "QUIET" ONCE THE USER HAS SPOKEN TO IT. Without this the row just
  // replied to sat in In progress under a heading saying it had been quiet for
  // three days, which is the same sentence it wore before anything was said.
  if (tookHerReply(agent)) return `${agent.name} is working on what you told it`;
  return `${agent.name} has been quiet for ${howLong(now - (agent.lastActiveAt ?? agent.startedAt ?? now))}`;
}

/* ------------------------------ RECALLING IT ----------------------------- */
// A card that carries only the title and the last thing typed is not enough to
// recall a session.
//
// WHAT WAS MISSING WAS THE BEGINNING, and it is the one thing on a transcript
// that never changes. In every live session measured, the FIRST message was
// the ask, and no card had ever shown it. `last-prompt` is the LAST thing the
// user typed, and days into a session that is usually a short follow-up that
// is perfectly true and no help whatsoever in remembering what the thing is for.
//
// The human side of a conversation is also small enough to just print: a
// handful of turns per session, a sentence or two each. The megabytes in a
// transcript are the agent's half. So the recall is the user's own words, read
// off the file, and no model sees any of it.
//
// ONE SHAPE, NOT THREE, AND IT IS NOT CONFIGURABLE.
//
// So the card does the same thing on every session: the message the user
// started it with, up to three later messages of theirs, where it stopped, and
// where it is working. `ask` and `trail` are gone, and there is deliberately no
// setting for this: deciding per session which of them a card deserves is a
// judgement that should not be made, whether by a model or by a knob.

// The messages the user typed, oldest first, with the newest ones kept whole and the
// opening always present.
//
// AN EMPTY LIST IS NOT A FALLBACK TO `lastAsked`, and the difference is the
// whole point of this change rather than a nicety. A session whose transcript
// could not be read has exactly one thing the user typed on record, and it is
// the LAST one. So the caller is told which of the two it has. WHAT THE USER
// SAID FROM AGENTBOX IS ALSO WHAT THE USER SAID.
//
// So the card went on saying only what the session was started with.
//
// `spoke` is the other half, written by main/agent-schedule.mjs at the moment
// of delivery. It is a RECORD, not a guess: Agentbox does not try to work out
// which wrapped peer message in a transcript was the user's, because another of
// their sessions pinging this one is a real peer and drawing that as the user's
// words would put a sentence they never typed on the one card built to be trusted.
//
// Merged by time, so the thread reads forwards however it arrived, and deduped
// on the text because a session that DOES record the user's injected turn as
// its own (a future Claude Code, or one typed into directly) must not show it
// twice.
export function herWords(agent) {
  const asked = (agent?.asked ?? []).filter((t) => t && t.text);
  const spoke = (agent?.spoke ?? []).filter((t) => t && t.text);
  // AN EMPTY LIST STAYS EMPTY, and that is not laziness. Nothing here is
  // allowed to invent an opening; see the note above this function.
  if (!spoke.length || !asked.length) return asked;
  const seen = new Set(asked.map((t) => t.text.replace(/\s+/g, ' ').trim()));
  const merged = [...asked];
  for (const t of spoke) {
    const flat = String(t.text).replace(/\s+/g, ' ').trim();
    if (seen.has(flat)) continue;
    seen.add(flat);
    merged.push({ at: t.at, text: flat });
  }
  // The opening keeps its place even if a clock skewed: it is the ask, and the
  // card labels it as the thing she started with.
  const [first, ...rest] = merged;
  rest.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return first ? [first, ...rest] : [];
}

// WHICH OF THE USER'S MESSAGES ACTUALLY RECALL ANYTHING, and the cheapest
// honest answer is how long they are. Much of what a person types while an
// agent works is driving it, not describing it: short nudges to restart,
// carry on or approve are almost always under sixty characters, while a turn
// that describes the work typically runs well past a hundred.
//
// So the long ones are preferred, and the short ones are still there when
// there is nothing longer, because a card that drops to silence is worse.
const RECALLS_SOMETHING = 60;

function worthRecalling(turns) {
  const meaty = turns.filter((t) => t.text.length >= RECALLS_SOMETHING);
  return meaty.length ? meaty : turns;
}

// How long ago, said the way she would say it, and never a clock time: a
// weekday name five days later is a small puzzle and "5 days ago" is not.
function ago(at, now) {
  if (!at) return '';
  const gap = now - at;
  if (gap < 0) return 'just now';
  if (gap < 90_000) return 'just now';
  return `${howLong(gap)} ago`;
}

// The rest of the context, in the user's sentences: what they asked for, where the
// thread got to, what it last said back, and what it has had its hands on.
function context(agent, now = Date.now()) {
  const words = herWords(agent);
  const said = howItEnded(agent.lastSaid);
  const where = whereItRuns(agent);
  const lines = [];

  const [opening, ...rest] = words;
  if (opening) {
    const when = ago(opening.at, now);
    lines.push(`**You started it${when ? ` ${when}` : ''} with:**\n\n“${oneSentence(opening.text, 420)}”`);
  } else {
    // No history, so the only thing on record is the LAST thing the user typed, and
    // it gets the label that is true of it.
    const last = lastAsk(agent);
    if (last) lines.push(`**The last thing you told it:**\n\n“${last}”`);
  }

  // Everything else the user typed, oldest first, so the thread reads forwards.
  // Three of them; more than that is the transcript rather than a card.
  if (rest.length) {
    const recent = worthRecalling(rest).slice(-3);
    const bullets = recent.map((t) => {
      const when = ago(t.at, now);
      return `- ${when ? `${when}: ` : ''}“${oneSentence(t.text, 260)}”`;
    });
    const over = rest.length > recent.length ? `, over ${rest.length} more messages,` : '';
    lines.push(`**Then${over} you said:**\n\n${bullets.join('\n')}`);
  }

  // `howItEnded` has already cut this to a quotable length from the right end,
  // so it is not run through `oneSentence` again: doing that took the tail it
  // had just chosen and handed back the front of it.
  if (said) lines.push(`${saidWhen(agent, now)}\n\n“${said}”`);

  const files = (agent.touched ?? []).slice(-3);
  lines.push(files.length
    ? `It is working in ${where}, in ${list(files)}.`
    : `It is working in ${where}.`);
  return `\n\n${lines.join('\n\n')}`;
}

function list(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function agentRow(agent, now = Date.now()) {
  const waited = howLong(now - (agent.lastActiveAt ?? agent.startedAt ?? now));
  const title = agentTitle(agent, now);
  const rest = context(agent, now);

  // SHE HAS SPOKEN TO IT AND IT IS WORKING. First, because every branch below
  // describes a session that has stopped, and this one has not: the row that
  // sent her back here was in her inbox under "It is asking for nothing and has
  // done nothing for 1 minute" moments after she told it to do something. This
  // row asks her for nothing on purpose — it is in In progress, which is where
  // the app puts what it is getting on with — so the opening line is the news
  // rather than a question.
  if (tookHerReply(agent)) {
    return {
      title,
      body: `**You replied, and ${agent.name} is working on it.**\n\nIt comes back to your inbox when it stops, whether it finishes or asks you something. Nothing here needs you meanwhile.${rest}`,
    };
  }
  if (replyReaches(agent)) {
    return {
      title,
      body: `**Reply to ${agent.name}, which has been waiting ${waited}.**\n\nIt finished what it was doing and stopped for an answer. Whatever you type here goes straight into it.${rest}`,
    };
  }
  if (asksSomething(agent)) {
    return {
      title,
      body: `**Answer ${agent.name} in its own window, not here.**\n\nIt is asking to approve something, and a message from ${NAME} would wait behind that box instead of clearing it.${rest}`,
    };
  }
  // A QUIET AGENT IS IN HER INBOX NOW, so it has to say what she is meant to do
  // with it, which is the one thing it never said before: close it. Closing one
  // is about her inbox and nothing else — the session is not touched — and the
  // body says exactly that, because a row that looks like it might kill
  // somebody's terminal is a row she cannot press at speed.
  return {
    title,
    body: `**Close ${agent.name} if you no longer need it here.**\n\nIt is asking for nothing and has done nothing for ${waited}. Closing it takes it out of your inbox and leaves the session running.${rest}`,
  };
}

/* -------------------------------- ONE LIST ------------------------------- */
// THERE IS NO SECOND TAB.So `Your agents` is gone and every outside agent is
// either in her inbox or nowhere, which is the whole of "merge the inbox into
// one".
//
// WHICH OF THEM IS IN IT IS HER SETTING, because she named both sides of it
// herself in the same message:
export const AGENT_MODES = ['all', 'waiting', 'off'];

export function reachesInbox(agent, now = Date.now(), mode = 'all') {
  if (agent.startedByZero) return false;
  if (mode === 'off') return false;
  // ONE ROW, ONE LIST. A session she just spoke to is in In progress until it
  // stops for her again; showing it here at the same time is the "one row, two
  // tabs" failure this codebase has already had once, and it would still be
  // sitting under a headline saying it asks for nothing.
  if (tookHerReply(agent)) return false;
  // A SESSION THAT CANNOT SAY WHAT IT IS NEVER FILES A ROW, WHATEVER THE
  // MODE.That sentence is what `agentTitle` falls back to when a session has
  // published no title of its own, and the body under it asks her to close a
  // row that asked her nothing, which instructions.md says should never have
  // been filed at all. It cannot be fixed by closing one either: a throwaway
  // session gets a fresh pid every time, so E is keyed to an id that never
  // comes back and the next one arrives just as loud.
  //
  // The sweep `all` was built for is untouched. A forgotten session that has a
  // title still carries it here, which is the one she can recognise and decide
  // about; this drops only the ones with nothing to show her.
  if (!asksSomething(agent) && !whatItIs(agent)) return false;
  if (mode === 'waiting' && !asksSomething(agent)) return false;
  return !putOff(agent, now) && !putAway(agent);
}

// AND THE LIST IT IS IN INSTEAD. Same shape as `belongsInProgress` for work
// items and the same promise: something is on this right now. The deferral
// argument is not taken because a reply cancels a deferral (`replyClearsSchedule`
// does the same for work items) — she spoke to it, so it is not put off any more.
//
// THIS IS NOT `reachesProgress`, WHICH WAS REMOVED, and the name is different
// on purpose. It stays dead: a working session the user has not spoken to is in
// the inbox, exactly as they left it. What moves a row here is THE USER, and
// only the user: the reply they wrote.
export function progressAfterReply(agent, now = Date.now(), mode = 'all') {
  if (agent.startedByZero) return false;
  if (mode === 'off') return false;
  return tookHerReply(agent);
}

// Everything Agentbox will admit exists: every live session except its own
// workers, which are already in her inbox as work items.
export function listed(agent) {
  return !agent.startedByZero;
}

/* --------------------- ACTIVE AGENTS, IN THE SIDEBAR --------------------- */
// The design: one line per session in its own words,
// the clock on the right, and no dot, mark, colour, wash, edge or line of any
// kind.
//
// THE CUT IS A DAY, AND IT IS THE ONLY FILTER.The premise is worth correcting
// where the rule lives, because it decides what the rule can be: nothing
// FINISHED is ever on this list and never has been. `main/agents.mjs` drops any
// record whose process is gone, so a session that finishes exits and disappears
// by itself. Measured: most live sessions were terminals sitting at a prompt
// for between two and seven days.
// So length comes from sessions that are alive and forgotten, and a day is
// where the app's own clock (`format.ts`) stops saying hours and starts saying
// `1d`. The panel therefore holds exactly what the clock beside each row can
// say in hours, which is the same sentence read twice.
export const RAIL_CUT_MS = 24 * 60 * 60 * 1000;

export function onTheRail(agent, now = Date.now()) {
  if (!listed(agent)) return false;
  const moved = agent.lastActiveAt || agent.startedAt || 0;
  return moved > 0 && now - moved <= RAIL_CUT_MS;
}

// WHAT ONE ROW SAYS, and it is the session's own sentence rather than ours.
// `about` is the one-line title every Claude Code session keeps current for
// itself; `lastSaid` is the fallback for a session Agentbox started, which has no
// title. Neither is cut here: the row is one line with `text-overflow` on it,
// so the width she is actually looking at does the cutting, once.
export function railLine(agent) {
  return whatItIs(agent) || lastWord(agent) || 'Has not said anything yet';
}

// MOST RECENTLY ACTIVE FIRST, which is the order every other list in this app
// is in, and the order the day headings above the rows assume. Sorting the
// stopped one to the top instead read well in a sentence and drew badly: the
// list groups by day as it goes, so a waiting agent from Wednesday above a
// row from July put "Last 7 days" on screen twice, once at the top and once
// eight rows down (measured in the built app, 2026-08-16).
//
// The stopped one does not need pinning here. It is scored in the inbox by the
// same rule everything else there is scored by, which puts an agent asking
// something above one asking nothing without this having to know about it.
export function byRecency(a, b) {
  return (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
}

/* --------------------------- THE CONVERSATION ---------------------------- */
// THE CARD IS THE RECALL AND THIS IS THE REST OF IT. The card is drawn for the
// user whether they asked or not, so it is four sentences; this is only ever
// drawn because they pressed something, so it can be the conversation.
//
// STILL NO MODEL, AND NOW NO COST AT ALL UNTIL IT IS PRESSED. Measured: the
// readable conversation is 0.6% of a transcript's bytes, and the worst single
// file measured (160MB) carries 3,800 readable turns, 2.6MB of text, 729ms to
// pull out. That last number is why the read is streamed and never happens on
// a draw.
//
// WHY IT IS A WINDOW AND NOT THE WHOLE FILE. 3,800 turns is not a conversation
// anyone can get up to speed on, it is a scroll bar. So it is the opening,
// which is the ask in every session measured, and the end, which is where it got to,
// and one plain line saying how many are in between rather than pretending
// there are none.
export const TRAIL_OPENING = 3;
export const TRAIL_TURNS = 40;

export function conversationWindow(turns, { opening = TRAIL_OPENING, keep = TRAIL_TURNS } = {}) {
  const all = (turns ?? []).filter((t) => t && t.text);
  if (all.length <= keep) return { turns: all, omitted: 0 };
  const head = all.slice(0, opening);
  const tail = all.slice(all.length - (keep - opening));
  return { turns: [...head, ...tail], omitted: all.length - head.length - tail.length };
}

// The one line that stands where the missing middle is. It says the number
// because "some messages" is the kind of sentence that makes her wonder what
// else the app is rounding off.
//
// And it is not rare. Rebuilding every row's thread the way the pane draws it,
// nearly half the rows with a conversation hide part of it, many of them
// hiding messages the user wrote, and the line was a plain div with nothing to
// press. "Not shown" was true and it was also the end of the road, so a thread
// that had eaten a follow-up simply said so and stopped.
//
// So the words say what pressing does. The window itself is untouched: it still
// opens on the end of a long conversation, because an 18,100px page is the
// thing it was built for. What changed is that the middle can be asked for.
export function conversationGap(omitted) {
  if (!omitted) return '';
  return `Show the ${omitted} message${omitted === 1 ? '' : 's'} in between`;
}

/* ------------------------------- THE WORK ---------------------------------- */
// So the item is the conversation, and each thing the agent ran sits on its own
// quiet line between the messages, in the order it happened. This half of the
// file decides what one of those lines SAYS. What it looks like is the frosted
// treatment chosen in round two and lives in the stylesheet.
//
// WHY IT IS BOUNDED THREE WAYS, all measured over the 40 largest transcripts
// available:
//
//   * one session held 6,070 tool calls and 8MB of output. So output is capped
//     per line (WORK_CHARS) rather than sent whole.
//   * the longest unbroken run of tool calls between two messages was 111, and
//     the median session's longest run was 25. So a run is capped (WORK_RUN)
//     and says how many it is not showing, because 111 quiet lines standing
//     between a question and its answer is the original problem wearing a
//     different hat.
//   * a windowed thread of 40 messages could still carry thousands of work
//     lines, so the whole thread is capped too (WORK_TOTAL), oldest first.
//
// Every cap says its own number out loud where it bites. Nothing here rounds
// off silently: "some output" is the kind of sentence that makes her wonder
// what else the app is not telling her.
export const WORK_CHARS = 2000;
export const WORK_RUN = 20;
export const WORK_TOTAL = 200;

// WHAT A TOOL CALL SAYS lives in its own file now (`shared/work-lines.mjs`),
// because a report on the imported threads turned one rule into
// three: the verb, the subject and the fold. It is re-exported here so that
// nothing that already reads this file has to learn a second import.
export {
  workVerb, workSubject, fullSubject, shortPath, plainCommand,
  groupWork, runSummary, runFailures, RUN_MIN,
  changedFile, fileInChange, CHANGES_A_FILE,
} from './work-lines.mjs';

// The line that stands where a capped run of work is. Same rule as the message
// gap above: say the number.
export function runOverflow(more) {
  if (!more) return '';
  return `and ${more} more thing${more === 1 ? '' : 's'} it ran, not shown`;
}

// The line at the foot of an output that was longer than we keep.
export function outputCut(shownLines, allLines) {
  if (!allLines || allLines <= shownLines) return '';
  return `${allLines - shownLines} more line${allLines - shownLines === 1 ? '' : 's'} came back, not kept`;
}

// THE WINDOW, MESSAGE-AWARE. `conversationWindow` above counts turns, and a
// thread with work in it must not let a run of tool calls push her own messages
// out of the window: the whole point of the shape is that her question and its
// answer sit next to each other. So the window is computed over the MESSAGES,
// exactly as before, and the work that sits between two kept messages comes
// with them. `omitted` still counts messages, because that is what the line
// under the gap says.
//
// `whole` IS WHAT THE GAP LINE PRESSES. Every message stands, and nothing else
// changes: the work is still capped by `capRuns` below, because 530 tool calls
// is not a conversation and what is wanted is the follow-ups, not the output
// under them. Opening it is the user's decision and it lasts until they leave the row,
// so no thread is ever born at this size.
export function threadWindow(events, { opening = TRAIL_OPENING, keep = TRAIL_TURNS, whole = false } = {}) {
  const all = (events ?? []).filter((e) => e && (e.kind === 'work' ? true : !!e.text));
  const saidAt = [];
  all.forEach((e, i) => { if (e.kind !== 'work') saidAt.push(i); });
  if (whole || saidAt.length <= keep) return { events: capRuns(all), omitted: 0 };

  // The first index that goes, and the first index that comes back. Everything
  // between them is dropped whole, work and messages together, so the thread
  // never shows output belonging to a message that is not on screen.
  const from = saidAt[opening];
  const to = saidAt[saidAt.length - (keep - opening)];

  // THE CONVERSATION RESUMES WITH A NAME ON IT.
  //
  // A `same` block is one agent STILL TALKING: it wears no name and no time
  // because the message above it is its own first half. Across the cut that is
  // a lie. Whatever it was continuing is in the missing middle, so it draws as
  // a nameless paragraph hanging off whichever message the window happened to
  // end the opening with, which is a different run from a different hour.
  //
  // Measured on her store, 2026-08-28: of the 123 rows with a gap in them, 93
  // resumed on a nameless block.
  //
  // `resumed` RATHER THAN CLEARING `same`, and the difference matters. `same`
  // is what `saidCount` folds on, so a block that stops being a continuation
  // becomes a second message in the header's count while still being one
  // message in the row. Measured before this note was written: clearing it put
  // `omitted` at -1 on 15 of her rows, which is the gap line quoting her a
  // number that cannot be true. So the fold is left exactly as it was and only
  // the DRAWING changes: this block gets its name and its time back.
  const tail = all.slice(to);
  if (tail.length && tail[0].kind !== 'work' && tail[0].same) tail[0] = { ...tail[0], resumed: true };
  const kept = [...all.slice(0, from), ...tail];
  return { events: capRuns(kept), omitted: saidAt.length - keep };
}

/**
 * WHERE THE GAP LINE STANDS, in the windowed thread `threadWindow` returned.
 *
 * IT LIVES HERE BECAUSE THE CUT LIVES HERE. The renderer used to work this out
 * for itself with a second, different count: it walked the messages and SKIPPED
 * `same` continuations, while the cut above keeps the first `opening` BLOCKS
 * with continuations counted. The two agree only when no run's second sentence
 * lands in the opening, and the ordinary shape of a thread is the ask, a run's
 * first line, that run's second line.
 *
 * Measured over her own store, 2026-08-28, rebuilding all 267 rows the way the
 * pane draws them: 123 have a gap, and on 56 of those the line was printed away
 * from the seam, by as much as 30 messages. It sat under messages she could read
 * saying some were missing, and where they had really gone there was nothing.
 *
 * Returns the index of the LAST event the opening kept, so work belonging to the
 * opening stays above the line rather than below it, and -1 when nothing is
 * missing.
 */
export function gapIndex(events, omitted, { opening = TRAIL_OPENING } = {}) {
  if (!omitted) return -1;
  let blocks = 0;
  for (let i = 0; i < (events?.length ?? 0); i += 1) {
    if (events[i].kind === 'work') continue;
    blocks += 1;
    if (blocks === opening + 1) return i - 1;
  }
  // Every block on the screen belongs to the opening: the seam is the end of it.
  return (events?.length ?? 0) - 1;
}

// Both work caps, applied in one pass over the windowed thread. A run is cut to
// WORK_RUN and told how many it lost; the thread as a whole is cut to
// WORK_TOTAL, oldest work first, because the newest is the part she came for.
export function capRuns(events, { run = WORK_RUN, total = WORK_TOTAL } = {}) {
  const out = [];
  let inRun = 0;
  let dropped = 0;
  for (const e of events) {
    if (e.kind !== 'work') {
      if (dropped) { out[out.length - 1] = { ...out[out.length - 1], more: dropped }; dropped = 0; }
      inRun = 0;
      out.push(e);
      continue;
    }
    inRun += 1;
    if (inRun > run) { dropped += 1; continue; }
    out.push(e);
  }
  if (dropped) out[out.length - 1] = { ...out[out.length - 1], more: dropped };

  const work = out.filter((e) => e.kind === 'work').length;
  if (work <= total) return out;
  // Drop the oldest work lines and leave every message standing.
  let over = work - total;
  const trimmed = [];
  for (const e of out) {
    if (over && e.kind === 'work' && !e.more) { over -= 1; continue; }
    trimmed.push(e);
  }
  return trimmed;
}

// HOW MANY MESSAGES THAT IS, which is not how many blocks are on the screen.
// Shape B draws a reply that stopped twice for a tool as three blocks in the
// order they happened, and that is right: it is what the session actually did.
// But a person counting would say the agent sent ONE message, so the header
// that reads "40 messages, oldest first" counts messages and not blocks.
// Getting this wrong would put "128 messages" over a conversation she
// remembers having six times.
//
// The reader marks every block that is a continuation of the one above it, and
// it is the only thing that knows: a block is a continuation when nothing but
// work stands between it and the same side's last block, and when nothing
// ARRIVED in the gap. A message that arrived ends the answer above it even
// when it is never drawn, which is the whole of's first defect.
export function saidCount(events) {
  let n = 0;
  for (const e of events ?? []) {
    if (!e || e.kind === 'work' || !e.text || e.same) continue;
    n += 1;
  }
  return n;
}

// TOOL-CALL SCAFFOLDING THAT LEAKED INTO THE PROSE.
//
// A provider writing a tool call sometimes emits its closing tags as ordinary
// text, and the field it was writing then holds the answer with the machinery
// of the call still stuck to the end. On w-b108b1d596 the result that reached
// the pane ended "7,369 tests both times.</result>\n</invoke>" and was shown as
// is. Measured: dozens of field writes across dozens of rows carried it.
//
// IT ALSO BREAKS THE FOLD THAT SAYS ONE THING ONCE. That run noticed the leak
// and wrote its result again, clean. The fold keeps the FULLER of two copies of
// one answer, and the junk made the broken copy the fuller one, so the leak was
// what stayed on the screen and the good rewrite was the copy thrown away. That
// is what happened on that row, and it is why the cut happens before anything
// compares two messages.
//
// The cut runs from the first tag to the end, because nothing after one is
// prose: it is the rest of a call that was never meant to be said out loud. On
// that row it was a `note` parameter, which the next write then sent properly.
const LEAKED = /<\/(?:antml:)?(?:result|invoke|parameter|function_calls)>|<(?:antml:)?parameter\s+name=/;

// A TAG INSIDE CODE WAS TYPED ON PURPOSE AND IS NOT A LEAK. The row that asked
// for this is the proof: the answer explaining the bug to her quotes the tags in
// backticks, mid-paragraph, and a cut at the first one anywhere would have eaten
// the rest of her answer to make the example go away. So the spans in backticks,
// inline and fenced, are stepped over and only prose is cut.
function firstLeak(text) {
  const code = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('```', i)) {
      const end = text.indexOf('```', i + 3);
      const stop = end < 0 ? text.length : end + 3;
      code.push([i, stop]); i = stop; continue;
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      const stop = end < 0 ? i + 1 : end + 1;
      code.push([i, stop]); i = stop; continue;
    }
    i += 1;
  }
  const re = new RegExp(LEAKED.source, 'g');
  let m = re.exec(text);
  while (m) {
    if (!code.some(([s, e]) => m.index >= s && m.index < e)) return m.index;
    m = re.exec(text);
  }
  return -1;
}

export function unleaked(text) {
  if (typeof text !== 'string') return text;
  const hit = firstLeak(text);
  return hit < 0 ? text : text.slice(0, hit).trimEnd();
}
