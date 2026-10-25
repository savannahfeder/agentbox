// Pure rules for the user's own Claude Code agents as rows: which ones Agentbox
// shows, which reach the inbox, and what each says. main/agents.mjs reads the
// machine; nothing here touches a process, a socket or a file. The rules live
// apart from the reader because a row missing from a list has no symptom.

// A pid is not an identity, so a record is believed only when the live process
// at that pid started at the same moment. The state file prints its start time
// in the session's own timezone and `ps -o lstart` prints local time, so a gap
// of an exact whole number of hours counts as the same instant.
import { NAME } from '../shared/product-name.mjs';
const HOUR = 3_600_000;

export function sameInstant(a, b) {
  const one = Date.parse(a);
  const two = Date.parse(b);
  if (!Number.isFinite(one) || !Number.isFinite(two)) return false;
  const gap = Math.abs(one - two);
  return gap % HOUR === 0 && gap <= 14 * HOUR;
}

// Agentbox's own workers are already work items, so they must not show again
// as agent rows. The supervisor spawns them from the Electron main process, so
// their ppid is the app's pid; the sessionId it records is a second key.
export function startedByZero(agent, { pids = new Set(), sessionIds = new Set() } = {}) {
  if (agent.sessionId && sessionIds.has(agent.sessionId)) return true;
  return !!agent.ppid && pids.has(agent.ppid);
}

// Only an agent waiting on a person reaches the inbox. Most are idle at any
// moment; they stay listed but do not interrupt.
export function asksSomething(agent) {
  return agent.status === 'waiting';
}

// Claude Code has two waiting states. On "input needed" a message written to
// the session's socket is taken as the next human turn. On "permission prompt"
// it queues behind the approval box and changes nothing.
//
// This decides the row's headline and whether it interrupts. The reply box is
// gated by `replyIsSwallowed`, not by this.
export function replyReaches(agent) {
  return asksSomething(agent) && agent.waitingFor === 'input needed';
}

// The only agent a reply cannot reach is one stopped on a permission prompt.
// An idle session at its prompt does read a line written to its socket.
// `reply` in main/agents.mjs refuses the same case.
export function replyIsSwallowed(agent) {
  return agent?.waitingFor === 'permission prompt';
}

// A replied-to agent sits in In progress until the session stops again (idle
// or waiting) after the reply. Claude Code publishes `status` (busy, shell,
// idle, waiting) and stamps `statusUpdatedAt` when it changes. The stamp must
// be newer than the reply, because the session is still idle for a moment
// before it picks the message up. An older CLI that publishes no status is
// never moved, since nothing could show it stopping.
export function tookHerReply(agent) {
  const spoke = agent?.repliedAt ?? 0;
  if (!spoke) return false;
  if (!agent?.status) return false;
  if (putAway(agent)) return false;
  return !stoppedSince(agent, spoke);
}

// `statusAt` is the session's own stamp on its status. A session with none is
// never seen to stop, so `tookHerReply` handles that case first.
export function stoppedSince(agent, since) {
  const at = agent?.statusAt ?? 0;
  if (at <= since) return false;
  return agent?.status === 'idle' || agent?.status === 'waiting';
}

// Putting off or closing an agent row only changes the inbox. Nothing is sent
// and the session is not touched.

// The key a deferral or close is stored under. Pids get reused, so it is the
// sessionId when there is one, otherwise the pid plus its start time.
export function agentKey(agent) {
  if (agent?.sessionId) return `session:${agent.sessionId}`;
  return `pid:${agent?.pid ?? 0}:${agent?.startedAt ?? 0}`;
}

// A predicate, not a timer, like `isDue` for work items: once `runAt` passes
// the row is back, so a missed moment comes back late rather than being lost.
export function putOff(agent, now = Date.now()) {
  return (agent?.runAt ?? 0) > now;
}

// A closed row stays closed for the life of the session, even if it later asks
// something; it is not compared against later activity. `doneThrough` is a
// timestamp, not a boolean, so `close(key, 0)` can undo it (`closeAgentRow` in
// App.tsx).
export function putAway(agent) {
  return (agent?.doneThrough ?? 0) > 0;
}

// The words. The row clips the summary at SUMMARY_BUDGET (112 characters) on
// the last full stop, so the first sentence has to carry the point alone.
export function howLong(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'a moment';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const mins = Math.max(1, Math.floor(ms / 60000));
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

export function whereItRuns(agent) {
  const owner = agent.productName;
  if (owner) return owner;
  const cwd = agent.cwd ?? '';
  const leaf = cwd.split('/').filter(Boolean).pop();
  return leaf || 'an unknown folder';
}

// Flattens typing to one line. Markdown markers go because the card quotes
// this inside its own markdown.
function readableWords(raw) {
  return String(raw ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[Image[^\]]*\]/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trim();
}

// Cuts from the front, which suits a person's message. See `howItEnded`.
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

// Whole sentences from the end of a message, because an agent puts what it
// found last.
export function howItEnded(raw, budget = 320) {
  const text = readableWords(raw);
  if (!text) return '';
  if (text.length <= budget) return text;
  const tail = text.slice(-budget);
  const starts = [tail.indexOf('. '), tail.indexOf('? '), tail.indexOf('! ')].filter((i) => i >= 0);
  const at = starts.length ? Math.min(...starts) + 2 : -1;
  const cut = at >= 0 && at < budget - 40 ? tail.slice(at) : tail.slice(tail.indexOf(' ') + 1);
  return `…${cut.trim()}`;
}

// The heading over the agent's last words: when it spoke, and whether that came
// after the user's latest message.
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

// The last thing the user typed, from the session's own `last-prompt` line,
// which never holds a tool result.
export function lastAsk(agent, budget = 180) {
  return oneSentence(agent.lastAsked, budget);
}

// Claude Code keeps a one-line title of each session in its transcript; that
// is `about`. The row title puts the session's name in front of it, because
// two sessions can run in the same folder.
export function whatItIs(agent) {
  return String(agent?.about ?? '').replace(/\s+/g, ' ').trim();
}

export function agentTitle(agent, now = Date.now()) {
  const about = whatItIs(agent);
  if (about) return `${agent.name}: ${about}`;
  if (replyReaches(agent)) return `${agent.name} is waiting for you`;
  if (asksSomething(agent)) return `${agent.name} needs you where it is running`;
  if (tookHerReply(agent)) return `${agent.name} is working on what you told it`;
  return `${agent.name} has been quiet for ${howLong(now - (agent.lastActiveAt ?? agent.startedAt ?? now))}`;
}

// Recalling a session. The card shows the user's own words read off the
// transcript (no model sees them): the opening ask, up to three later messages,
// where it stopped and where it works. The same shape on every session, with no
// setting.

// The user's messages, opening first, then the rest by time. `asked` comes from
// the transcript. `spoke` is what main/agent-schedule.mjs recorded as delivered
// from Agentbox, because a peer message in the transcript cannot be told apart
// from the user's. Deduped on text in case the session also recorded it.
//
// An unreadable transcript gives an empty list, never a fallback to
// `lastAsked`, so the caller knows it only has the last message.
export function herWords(agent) {
  const asked = (agent?.asked ?? []).filter((t) => t && t.text);
  const spoke = (agent?.spoke ?? []).filter((t) => t && t.text);
  if (!spoke.length || !asked.length) return asked;
  const seen = new Set(asked.map((t) => t.text.replace(/\s+/g, ' ').trim()));
  const merged = [...asked];
  for (const t of spoke) {
    const flat = String(t.text).replace(/\s+/g, ' ').trim();
    if (seen.has(flat)) continue;
    seen.add(flat);
    merged.push({ at: t.at, text: flat });
  }
  // The opening stays first even if a clock skewed, because the card labels it
  // as the start.
  const [first, ...rest] = merged;
  rest.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return first ? [first, ...rest] : [];
}

// Short messages are usually nudges ("carry on", "approve"), so longer ones
// are preferred when there are any.
const RECALLS_SOMETHING = 60;

function worthRecalling(turns) {
  const meaty = turns.filter((t) => t.text.length >= RECALLS_SOMETHING);
  return meaty.length ? meaty : turns;
}

function ago(at, now) {
  if (!at) return '';
  const gap = now - at;
  if (gap < 0) return 'just now';
  if (gap < 90_000) return 'just now';
  return `${howLong(gap)} ago`;
}

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
    const last = lastAsk(agent);
    if (last) lines.push(`**The last thing you told it:**\n\n“${last}”`);
  }

  if (rest.length) {
    const recent = worthRecalling(rest).slice(-3);
    const bullets = recent.map((t) => {
      const when = ago(t.at, now);
      return `- ${when ? `${when}: ` : ''}“${oneSentence(t.text, 260)}”`;
    });
    const over = rest.length > recent.length ? `, over ${rest.length} more messages,` : '';
    lines.push(`**Then${over} you said:**\n\n${bullets.join('\n')}`);
  }

  // Already cut from the end by `howItEnded`; `oneSentence` would cut it again
  // from the front.
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

  // First, because every branch below describes a session that has stopped.
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
  // The body says the session keeps running, so closing the row does not look
  // like it might kill a terminal.
  return {
    title,
    body: `**Close ${agent.name} if you no longer need it here.**\n\nIt is asking for nothing and has done nothing for ${waited}. Closing it takes it out of your inbox and leaves the session running.${rest}`,
  };
}

// There is no separate agents tab: an outside agent is in the inbox or
// nowhere. Which ones is a setting.
export const AGENT_MODES = ['all', 'waiting', 'off'];

export function reachesInbox(agent, now = Date.now(), mode = 'all') {
  if (agent.startedByZero) return false;
  if (mode === 'off') return false;
  // A replied-to session is in In progress instead (`progressAfterReply`).
  if (tookHerReply(agent)) return false;
  // An idle session with no title has nothing to show, and closing it does not
  // help: a throwaway session gets a fresh pid each time.
  if (!asksSomething(agent) && !whatItIs(agent)) return false;
  if (mode === 'waiting' && !asksSomething(agent)) return false;
  return !putOff(agent, now) && !putAway(agent);
}

// The In progress counterpart of `belongsInProgress` for work items. Only the
// user's reply moves an agent here; a working session nobody spoke to stays in
// the inbox. A reply cancels a deferral, as `replyClearsSchedule` does for work
// items, so `putOff` is not checked.
export function progressAfterReply(agent, now = Date.now(), mode = 'all') {
  if (agent.startedByZero) return false;
  if (mode === 'off') return false;
  return tookHerReply(agent);
}

export function listed(agent) {
  return !agent.startedByZero;
}

// The sidebar shows sessions active in the last day, the point where the
// app's clock (`format.ts`) switches from hours to `1d`. Finished sessions
// never appear, because main/agents.mjs drops records whose process is gone.
export const RAIL_CUT_MS = 24 * 60 * 60 * 1000;

export function onTheRail(agent, now = Date.now()) {
  if (!listed(agent)) return false;
  const moved = agent.lastActiveAt || agent.startedAt || 0;
  return moved > 0 && now - moved <= RAIL_CUT_MS;
}

// Not cut here; the row's CSS `text-overflow` cuts it to the width shown.
export function railLine(agent) {
  return whatItIs(agent) || lastWord(agent) || 'Has not said anything yet';
}

// Pure recency, because the list draws day headings as it goes and any other
// order repeats a heading. Waiting agents are ranked in the inbox, not here.
export function byRecency(a, b) {
  return (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
}

// The full conversation, read only when the user opens it, since a large
// transcript takes most of a second to read. It shows the opening turns and the
// latest ones, with a line counting what is in between.
export const TRAIL_OPENING = 3;
export const TRAIL_TURNS = 40;

export function conversationWindow(turns, { opening = TRAIL_OPENING, keep = TRAIL_TURNS } = {}) {
  const all = (turns ?? []).filter((t) => t && t.text);
  if (all.length <= keep) return { turns: all, omitted: 0 };
  const head = all.slice(0, opening);
  const tail = all.slice(all.length - (keep - opening));
  return { turns: [...head, ...tail], omitted: all.length - head.length - tail.length };
}

// The line that stands for the hidden middle. It gives the count, and pressing
// it shows those messages.
export function conversationGap(omitted) {
  if (!omitted) return '';
  return `Show the ${omitted} message${omitted === 1 ? '' : 's'} in between`;
}

// Each tool call the agent ran is a line between the messages. Caps: output
// per line (WORK_CHARS), one unbroken run of calls (WORK_RUN), and the whole
// thread (WORK_TOTAL, oldest dropped first). Every cap shows how much it hid.
export const WORK_CHARS = 2000;
export const WORK_RUN = 20;
export const WORK_TOTAL = 200;

// Re-exported so existing importers of this file keep working.
export {
  workVerb, workSubject, fullSubject, shortPath, plainCommand, commandWork,
  groupWork, runSummary, runFailures, RUN_MIN, isBookkeeping,
  changedFile, fileInChange, CHANGES_A_FILE,
} from './work-lines.mjs';

export function runOverflow(more) {
  if (!more) return '';
  return `and ${more} more thing${more === 1 ? '' : 's'} it ran, not shown`;
}

export function outputCut(shownLines, allLines) {
  if (!allLines || allLines <= shownLines) return '';
  return `${allLines - shownLines} more line${allLines - shownLines === 1 ? '' : 's'} came back, not kept`;
}

// Like `conversationWindow`, but over a thread with work lines in it. The
// window counts messages only, so tool calls cannot push messages out, and work
// between two kept messages comes with them. `whole` is what pressing the gap
// line asks for: every message, with work still capped by `capRuns`.
export function threadWindow(events, { opening = TRAIL_OPENING, keep = TRAIL_TURNS, whole = false } = {}) {
  const all = (events ?? []).filter((e) => e && (e.kind === 'work' ? true : !!e.text));
  const saidAt = [];
  all.forEach((e, i) => { if (e.kind !== 'work') saidAt.push(i); });
  if (whole || saidAt.length <= keep) return { events: capRuns(all), omitted: 0 };

  // Everything between these is dropped, work and messages together, so no
  // output shows for a message that is not on screen.
  const from = saidAt[opening];
  const to = saidAt[saidAt.length - (keep - opening)];

  // A `same` block continues the one above and draws with no name or time. The
  // first block after the cut continues something hidden, so it is marked
  // `resumed` to draw its name again. Clearing `same` instead would change
  // `saidCount` and make `omitted` disagree with it.
  const tail = all.slice(to);
  if (tail.length && tail[0].kind !== 'work' && tail[0].same) tail[0] = { ...tail[0], resumed: true };
  const kept = [...all.slice(0, from), ...tail];
  return { events: capRuns(kept), omitted: saidAt.length - keep };
}

/**
 * Where the gap line stands in a thread from `threadWindow`: the index of the
 * last event the opening kept, or -1 when nothing is missing. It counts blocks,
 * `same` continuations included, exactly as `threadWindow` cuts, which is why
 * the renderer must not work this out itself.
 */
export function gapIndex(events, omitted, { opening = TRAIL_OPENING } = {}) {
  if (!omitted) return -1;
  let blocks = 0;
  for (let i = 0; i < (events?.length ?? 0); i += 1) {
    if (events[i].kind === 'work') continue;
    blocks += 1;
    if (blocks === opening + 1) return i - 1;
  }
  return (events?.length ?? 0) - 1;
}

// A run past WORK_RUN records how many it dropped in `more`. Past WORK_TOTAL
// the oldest work lines go and every message stays.
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
  let over = work - total;
  const trimmed = [];
  for (const e of out) {
    if (over && e.kind === 'work' && !e.more) { over -= 1; continue; }
    trimmed.push(e);
  }
  return trimmed;
}

// Messages, not blocks: a reply split by tool calls draws as several blocks
// but counts once. The transcript reader sets `same` on each continuation
// block, and only it can tell.
export function saidCount(events) {
  let n = 0;
  for (const e of events ?? []) {
    if (!e || e.kind === 'work' || !e.text || e.same) continue;
    n += 1;
  }
  return n;
}

// A model writing a tool call sometimes emits the call's closing tags as plain
// text inside a field. Everything from the first tag on is cut. This must run
// before any comparison of two messages, because the fold keeps the fuller
// copy and the leaked junk would make the broken copy win.
const LEAKED = /<\/(?:antml:)?(?:result|invoke|parameter|function_calls)>|<(?:antml:)?parameter\s+name=/;

// A tag inside backticks, inline or fenced, was typed on purpose and is not a
// leak, so code spans are skipped.
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
