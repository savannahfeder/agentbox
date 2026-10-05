// WHAT AN IMPORTED AGENT LOOKS LIKE IN THE INBOX.
//
// So the import stops being a note to itself and becomes rows. One per agent
// the person ticked, in the project the walk just made, each one that agent
// asking to be put to work.
//
// WHY A ROW HAS TO ASK SOMETHING. An imported agent needs no carrying across:
// Claude Code loads its own agent folders at the start of every session, which
// was measured on 2026-08-23 and is why the old import had nothing to do. What
// was actually missing is that Agentbox could not put one to work. A row that
// only announced an agent would be the same empty promise in a louder place,
// so the row asks for the agent's first job and the reply is what runs it.
//
// Pure on purpose: the files are read in main/agent-files.mjs and the rows are
// written in main/store.mjs. Everything here is words, so the words are tested
// rather than eyeballed on a card nobody can screenshot twice.

/**
 * The label every one of these rows carries, so a second walk through the
 *  first run can tell which agents already have a row and file nothing twice. */
import { NAME, Name } from '../shared/product-name.mjs';
export const IMPORT_LABEL = 'agent-import';

/**
 * And the one that says WHICH agent, for the same reason. Names only, the way
 *  `projectAgents` stores them: the file is the author's and never moves, so a
 *  name that has gone stale costs nothing. */
export const agentLabel = (name) => `agent:${String(name ?? '').trim()}`;

/**
 * `/Users/x/.claude/agents/a.md` as `~/.claude/agents/a.md`. A path with a
 *  stranger's home folder in it is a path they read twice to find their own
 *  name in it. */
export function shortenHome(p, home) {
  const full = String(p ?? '');
  const h = String(home ?? '').replace(/\/+$/, '');
  return h && full.startsWith(h + '/') ? `~${full.slice(h.length)}` : full;
}

/**
 * ONE ROW'S WORDS.
 *
 *  The first line is the ask and nothing else, because the inbox row shows the
 *  opening of the body and the reading pane leads with it. The agent's own
 *  description follows when it has one; a file with nothing but a heading in it
 *  gets no second paragraph rather than a blank one.
 *
 *  The last paragraph is the honest half. Agentbox does not copy an agent file,
 *  does not move one, and did not make it work: it says where the file is and
 *  which of Claude Code's two scopes it is in, in the same two words the finish
 *  card uses.
 */
export function agentImportRow(agent, { projectName = null, home = '' } = {}) {
  const title = String(agent?.title || agent?.name || '').trim();
  const name = String(agent?.name || '').trim();
  const line = String(agent?.line || '').trim();
  const where = shortenHome(agent?.path, home);
  const inProject = projectName ? ` here in ${projectName}` : '';
  const scopeLine = agent?.scope === 'project'
    ? 'It works in this project only.'
    : 'It works in every project on this Mac.';
  const body = [
    `**Tell ${title} what to do first, in one sentence.**`,
    ...(line ? [line] : []),
    `Reply with the job and ${NAME} runs it${inProject}, putting your ${name} agent on the work and answering you here.`,
    `${scopeLine} The file stays exactly where you wrote it, at ${where}, and ${NAME} never moves or copies one.`,
  ].join('\n\n');
  return {
    title: `${title} is ready. Give it its first job.`,
    body,
    kind: 'question',
    priority: 3,
    labels: [IMPORT_LABEL, agentLabel(name)],
  };
}

/**
 * WHICH OF THE TICKED AGENTS STILL NEED A ROW.
 *
 *  Walking the first run again is a thing the app offers from ⌘K, and it opens
 *  on what was taken last time with everything still ticked. Without this, the
 *  second walk files a second copy of every row, which is the one failure an
 *  inbox cannot absorb.
 *
 *  Matched on the agent's own name rather than on the row's title, so renaming
 *  an agent's front matter files a new row and rewording ours does not.
 *
 *  ONE ROW PER NAME, EVEN WHEN TWO FILES CLAIM IT. Claude Code lets a project
 *  folder shadow a home folder agent of the same name, and the project's copy
 *  is the one that runs, so that is the one the row describes.
 */
export function agentsNeedingRows(chosen, existingItems = []) {
  const already = new Set();
  for (const item of existingItems) {
    for (const label of item?.labels ?? []) {
      if (typeof label === 'string' && label.startsWith('agent:')) already.add(label.slice(6));
    }
  }
  const byName = new Map();
  for (const a of chosen ?? []) {
    const name = String(a?.name ?? '').trim();
    if (!name || already.has(name)) continue;
    const seen = byName.get(name);
    if (!seen || (a.scope === 'project' && seen.scope !== 'project')) byName.set(name, a);
  }
  return [...byName.values()];
}

/* --------------------------- AND THE THREADS ----------------------------- */
// Of the three things a picked thread could do, this is the plainest one. It
// does NOT resume the conversation, and that is the half these words have to
// carry, because a row named after an earlier conversation is a row anybody
// would assume was carrying it on. So the body says, in plain words, that this
// starts fresh.
//
// Everything else is the agent import's shape, for the same reasons: one row per
// thing the user ticked, a label so a second press files nothing twice, and a
// question so the supervisor waits for the user rather than starting on its own.

/** The label every imported thread carries. */
export const THREAD_LABEL = 'thread-import';

/**
 * And the one that says WHICH thread. The id is Claude Code's own session id,
 *  which is stable across renames and is what the transcript is filed under. */
export const threadLabel = (id) => `thread:${String(id ?? '').trim()}`;

/**
 * WHEN SHE HAD IT, in the words a person uses about this week.
 *
 *  Inside a week a day name is the plain word. The window is ten days
 *  (`RECENT_DAYS`, main/agent-sessions.mjs), and past a week a day name would
 *  point at the wrong Monday, so those say the date. Anything the arithmetic
 *  cannot place, or anything far outside the window, says nothing rather than
 *  guessing. */
export function whenWords(when, now = Date.now()) {
  const then = new Date(Number(when) || 0);
  if (!Number.isFinite(then.getTime()) || !when) return '';
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(then)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `on ${then.toLocaleDateString('en-US', { weekday: 'long' })}`;
  if (days < 14) return `on ${then.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  return '';
}

/** Where she was when she started it, in the two places she named. */
export function startedIn(source) {
  if (source === 'codex') return 'in Codex';
  return source === 'desktop' ? 'in the Claude Code desktop app' : 'in a terminal';
}

/**
 * ONE IMPORTED THREAD'S WORDS.
 *
 *  The title is the thread's own, which is the first thing the user typed into
 *  it, so the row in the inbox is called what they would call it. Ours is not
 *  added in front of it: a list of rows all opening with the same three words is
 *  a list that has to be read past to find which is which.
 *
 *  The last paragraph is the honest one. Agentbox read the top of the transcript
 *  to find this name and nothing else, and the reply starts a fresh session. A
 *  row that let her believe otherwise would be the same empty promise the agent
 *  import had before 08-23, in a new place. */
export function threadImportRow(thread, { projectName = null, now = Date.now() } = {}) {
  const title = String(thread?.title || '').trim();
  const where = String(thread?.short || thread?.folder || '').trim();
  const when = whenWords(thread?.when, now);
  const started = [
    'You started this',
    startedIn(thread?.source),
    when,
    where ? `in ${where}` : '',
  ].filter(Boolean).join(' ');
  const inProject = projectName ? ` here in ${projectName}` : '';
  const body = [
    '**Say what you want done next in this thread.**',
    `${started}.`,
    `Reply with the job and ${NAME} runs it${inProject}, answering you here.`,
    `${Name} has not read the conversation, only the line above that names it, and replying starts a fresh session rather than carrying the old one on. So say what you need in the reply.`,
  ].join('\n\n');
  return {
    title,
    body,
    kind: 'question',
    priority: 3,
    labels: [THREAD_LABEL, threadLabel(thread?.id)],
  };
}

/**
 * WHICH OF THE TICKED THREADS STILL NEED A ROW. The card opens on a Mac whose
 *  threads it has offered before, so pressing twice is ordinary and a second row
 *  for the same conversation is the one failure an inbox cannot absorb. */
export function threadsNeedingRows(chosen, existingItems = []) {
  const already = new Set();
  for (const item of existingItems) {
    for (const label of item?.labels ?? []) {
      if (typeof label === 'string' && label.startsWith('thread:')) already.add(label.slice(7));
    }
  }
  const byId = new Map();
  for (const t of chosen ?? []) {
    const id = String(t?.id ?? '').trim();
    if (!id || already.has(id) || byId.has(id)) continue;
    if (!String(t?.title ?? '').trim()) continue;
    byId.set(id, t);
  }
  return [...byId.values()];
}

/**
 * WHICH CONVERSATIONS ARE ALREADY IN, so the card offers only the rest
 *  (w-db6f5e331e). A Claude Code conversation is in once any row carries
 *  `thread:<id>`; a Codex one once any row carries `codex:<id>`, except the
 *  row that records a no, because the card is the way back to that one. Each
 *  thread comes back as it was, with `imported: true` on the ones that are in. */
export function markImported(threads = [], items = []) {
  const inbox = new Set();
  for (const item of items ?? []) {
    const labels = item?.labels ?? [];
    const declined = labels.includes('not-imported') && item?.status === 'done';
    for (const label of labels) {
      if (typeof label !== 'string') continue;
      if (label.startsWith('thread:')) inbox.add(label.slice(7));
      else if (label.startsWith('codex:') && !declined) inbox.add(label.slice(6));
    }
  }
  return (threads ?? []).map((t) => (inbox.has(String(t?.id ?? '')) ? { ...t, imported: true } : t));
}

/**
 * WHICH AGENT A ROW IS ABOUT, or null for every other row in the inbox.
 *
 *  The worker's brief reads this. Without it the row's body is the only thing
 *  saying whose job this is, and a body is prose: it tells a session that an
 *  agent exists, not that it is the one meant to do the work. The whole of the
 *  fix is that the reply reaches the agent, so the instruction is explicit
 *  (`importedAgentBrief`) rather than inferred from a sentence on a card. */
export function importedAgentName(item) {
  for (const label of item?.labels ?? []) {
    if (typeof label === 'string' && label.startsWith('agent:')) {
      const name = label.slice(6).trim();
      if (name) return name;
    }
  }
  return null;
}

/**
 * AND WHAT THE BRIEF SAYS ABOUT IT.
 *
 *  The last sentence is the honest one and it is not decoration. Claude Code
 *  loads its own agent folders every session, so the subagent is normally right
 *  there — but it is loaded from the person's own disk, under whichever profile
 *  the worker is billing to, and Agentbox cannot promise that from here. A
 *  session that quietly does the work itself would leave them believing their
 *  agent ran when it did not, which is the same empty promise this row exists
 *  to end. */
export function importedAgentBrief(name) {
  const n = String(name ?? '').trim();
  if (!n) return '';
  return [
    '# This row belongs to one of their own Claude Code agents',
    '',
    `They imported \`${n}\` on their first run, and this row is that agent asking for its first job.`,
    'Their answer above is the job.',
    '',
    `Do it by dispatching the \`${n}\` subagent and giving it that job, rather than doing the work yourself,`,
    'then report on this row what it did. If that subagent is not available to you in this session, do not',
    'quietly do the work as yourself: say so plainly in your result, because they are expecting their own',
    'agent to have run.',
  ].join('\n');
}
