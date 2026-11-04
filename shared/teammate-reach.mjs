// HOW AN AGENT REACHES A PERSON: the rules, on plain data. A store tool cannot
// reach the cloud, so it writes what the agent wants to say to an outbox file and
// the app sends it (main/teammate-reach.mjs). Every message starts from its
// owner's authority: a first message to anyone waits for their yes, and so does
// anything marked as leaving the team, every time.
import { isTaskRow } from './team-rules.mjs';
import { readRoomMessage } from './agent-voice.mjs';
import { mentionsIn } from './teammates.mjs';
import { addressedTo } from './artifact-marks.mjs';

// A row in Needs you that no agent ever runs, answered by a tap.
export const REACH_LABEL = 'teammate-asks-to-write';
export const SEND_ALWAYS = (who) => `Send it, and let it write to ${who} from now on`;
export const SEND_ONCE = 'Send this one only';
export const DONT_SEND = "Don't send it";
// Sends that fail stop after this many, and say so.
export const MOST_TRIES = 3;
// A message to someone its owner already allowed waits this long, with Undo.
export const UNDO_HOLD_MS = 10_000;
// Nobody is told the team is reachable on the word of a copy that stopped long ago.
export const VIEW_FRESH_MS = 10 * 60_000;

export const thePlainAgent = 'thread';
export const whoOf = (out) => out.from?.mate ?? thePlainAgent;

export const audienceKeys = (out) => (out.room ? [`room:${out.room}`] : (out.people ?? []).map((p) => `person:${p}`));

/** Every message asked for, how it stands, and the standing yeses. */
export function foldOutbox(lines) {
  const out = new Map();
  const yes = new Set();
  for (const l of lines ?? []) {
    if (!l || typeof l !== 'object') continue;
    if (l.kind === 'out' && typeof l.id === 'string' && !out.has(l.id)) out.set(l.id, { ...l, state: 'new', tries: 0 });
    else if (l.kind === 'state' && out.has(l.ref)) {
      const o = out.get(l.ref);
      o.state = l.state;
      if (Number.isFinite(l.until)) o.until = l.until;
      if (l.row) o.row = l.row;
      if (l.product) o.rowProduct = l.product;
    } else if (l.kind === 'try' && out.has(l.ref)) out.get(l.ref).tries += 1;
    else if (l.kind === 'yes' && typeof l.who === 'string' && typeof l.key === 'string') yes.add(`${l.who}>${l.key}`);
  }
  return { out: [...out.values()], yes };
}

const SAYS_SEND = /\b(?:send|tell|write|message|share|pass|give|forward)\b/i;
const SAYS_NOT = /\b(?:don'?t|do not|never|not yet|hold off|wait)\b|\b(?:send|tell|write|message|give|forward)\s+me\b/i;

/** Whether the owner's last words on this thread, since the agent last answered, tell it to send to these people. A pick counts: it is their words. */
export function saidToSendTo(lines, people) {
  if (!people?.length) return false;
  for (const l of [...(lines ?? [])].reverse()) {
    const p = l?.patch;
    if (!p) continue;
    if (l.source === 'agent' && p.result) return false;
    if (l.source !== 'founder' || typeof p.answer !== 'string') continue;
    if (!SAYS_SEND.test(p.answer) || SAYS_NOT.test(p.answer)) return false;
    return people.every((who) => new RegExp(`\\b${String(who.name).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p.answer));
  }
  return false;
}

export function mayGoNow(out, yes) {
  if (out.outside) return false;
  if (out.saidYes) return true;
  const who = whoOf(out);
  return audienceKeys(out).every((k) => yes.has(`${who}>${k}`));
}

const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? 'someone');

export const audienceWords = (out) => (out.room ? `the group ${out.names?.[0] ?? ''}`.trim() : list(out.names ?? []));

export function askTitle(out) {
  const who = out.from?.mate ? out.from.name : 'Your agent';
  const verb = out.task ? 'give a task to' : 'write to';
  return `${who} wants to ${verb} ${audienceWords(out)}`.slice(0, 200);
}

/** Who an ask's card is about, read back off its title, so "Sent to" names people, not the card. */
export function reachAudienceOf(row) {
  if (!(row?.labels ?? []).includes(REACH_LABEL)) return null;
  return /wants to (?:write to|give a task to) (.+)$/.exec(String(row.title ?? ''))?.[1] ?? null;
}

/** Who it goes to and where, above the words, which are shown once, below. */
export function askWhere(out) {
  if (out.room) return `To ${audienceWords(out)}.`;
  return `${out.task ? 'A task for' : 'To'} ${audienceWords(out)}, in your messages with them.`;
}

export function askText(out) {
  const who = audienceWords(out);
  const quoted = String(out.text ?? '').trim().split('\n').map((l) => `> ${l}`).join('\n');
  const heading = out.outside
    ? `**This is meant to go outside the team**, so it needs your yes each time. It goes to ${who} first.`
    : `It has not written to ${who} before, so it asked you first.`;
  const options = out.outside
    ? [`1. ${SEND_ONCE} (recommended)`, `2. ${DONT_SEND}`]
    : [`1. ${SEND_ALWAYS(who)} (recommended)`, `2. ${SEND_ONCE}`, `3. ${DONT_SEND}`];
  const files = (out.files ?? []).map((f) => `[${f.name}](${f.srcPath})`);
  return [heading, '', ...(out.task ? [`**${out.title}**`, ''] : []), quoted, ...(files.length ? ['', ...files] : []), '', '## Options', ...options].join('\n');
}

/** What an answer on the ask means, or null while there is none. `outside` has no standing yes, so its first option is once. */
export function reachAnswer(answer, { outside = false } = {}) {
  const said = String(answer ?? '').trim();
  if (!said || said === '(withdrawn)') return null;
  const lower = said.toLowerCase();
  if (lower.includes(DONT_SEND.toLowerCase()) || /^(3\b|no\b)/.test(lower)) return { kind: 'no' };
  if (lower.includes(SEND_ONCE.toLowerCase())) return { kind: 'once' };
  if (lower.includes('from now on')) return { kind: outside ? 'once' : 'always' };
  if (/^1\b\.?/.test(lower)) return { kind: outside ? 'once' : 'always' };
  if (/^2\b\.?/.test(lower)) return { kind: outside ? 'no' : 'once' };
  return { kind: 'no', words: said };
}

const seenKeyOf = (id, by, ts) => `reply:${id}:${by}:${ts}`;
const ASKS_THEM = /\?|\b(?:let me know|tell me|reply|answer|pick|choose|confirm|send me)\b/i;

/**
 * Words people wrote back to an agent, not yet carried to its run. Only a line
 * written by `me` counts as my agent's, whatever a line from anyone else claims.
 * In a chat, a reply is what follows my agent's message until I speak myself,
 * and only when that message asked them something: after a picture posted for
 * them to see, the next message is to me, as it is when it opens on my name. In
 * a group, only a reply under its message: anything else in the room is the
 * room's talk.
 */
export function repliesToAgents({ items = [], rooms = {}, me, seen = new Set(), direct = () => false, ownerName = null } = {}) {
  const toOwner = (text) => !!ownerName && !!addressedTo(text, [{ id: me, name: ownerName }]);
  const out = [];
  const add = (run, mate, key, by, text, conversation, ts) => {
    if (!seen.has(key)) out.push({ run, mate, key, by, text, conversation, ts });
  };
  for (const item of items) {
    if (!item?.talk || !direct(item)) continue;
    let voice = null;
    for (const s of item.talk.chat ?? []) {
      if (s.by === me) { voice = s.voice?.run && ASKS_THEM.test(s.text ?? '') ? s.voice : null; continue; }
      if (voice && s.text && !s.forAgent && !toOwner(s.text)) add(voice.run, voice.id ?? null, seenKeyOf(item.id, s.by, s.ts), s.by, s.text, item.id, s.ts);
    }
    for (const t of Object.values(item.talk.threads ?? {})) {
      if (t.by !== me || !t.voice?.run) continue;
      for (const r of t.replies ?? []) if (r.by !== me) add(t.voice.run, t.voice.id ?? null, seenKeyOf(item.id, r.by, r.ts), r.by, r.text, item.id, r.ts);
    }
    // A task its holder finished is the answer to it.
    const opening = item.wrote?.body?.voice;
    const closer = item.wrote?.status?.by;
    if (isTaskRow(item) && item.status === 'done' && opening?.run && closer && closer !== me) {
      add(opening.run, opening.id ?? null, `task:${item.id}`, closer, null, item.id, item.wrote.status.ts);
      if (!seen.has(`task:${item.id}`)) out.at(-1).finished = item.title;
    }
  }
  for (const [roomId, messages] of Object.entries(rooms)) {
    const byId = new Map(messages.map((m) => [m.id, readRoomMessage(m)]));
    for (const m of byId.values()) {
      if (m.deleted || m.by === me || !m.inReplyTo) continue;
      const parent = byId.get(m.inReplyTo);
      if (parent?.by === me && parent.voice?.run) add(parent.voice.run, parent.voice.id ?? null, `room:${m.id}`, m.by, m.body, roomId, m.at);
    }
  }
  return out;
}

// A group is a conversation among people. An agent that has just spoken holds
// the floor this long, unless a person answers first.
export const GROUP_QUIET_MS = 30 * 60_000;
// One run's short messages in a row, before a person has said anything.
export const MOST_IN_A_ROW = 3;
// A group message naming a teammate wakes it only this soon after, so a Mac back
// from a week away does not answer last week's questions.
const GROUP_ASK_FRESH_MS = 6 * 60 * 60_000;

/** The newest messages of a group as an agent's copy keeps them: who, when, whether an agent wrote it, and which of its owner's teammates it asks. */
export function recentInGroup(messages = [], { me, team = [], most = 12 } = {}) {
  return messages.filter((m) => !m.deleted).slice(-most).map(readRoomMessage).map((m) => ({
    by: m.by,
    at: m.at,
    agent: m.voice ? { id: m.voice.id ?? null, run: m.voice.run ?? null, name: m.voice.name } : null,
    names: m.voice ? [] : mentionsIn(m.body, team.filter((t) => m.by === me || t.openToTeam)),
  }));
}

/** Why a teammate may not speak in a group now, or null when it may. `asked`: its owner's own words woke this run. */
export function groupTurn({ recent = [], pending = [], mate, run, asked = false, now = Date.now() } = {}) {
  const lastPerson = recent.findLastIndex((m) => !m.agent);
  const since = [...recent.slice(lastPerson + 1), ...pending];
  if (since.filter((m) => m.agent?.run === run).length >= MOST_IN_A_ROW) {
    return `You have sent ${MOST_IN_A_ROW} messages in a row to this group and nobody has answered, so this was not sent. Put the rest in a document, or wait for a reply.`;
  }
  if (asked || recent[lastPerson]?.names?.includes(mate)) return null;
  const other = since.filter((m) => m.agent?.run !== run && now - m.at < GROUP_QUIET_MS).at(-1);
  return other ? `${other.agent.name} has just spoken in this group and nobody has answered, so this was not sent. Speak there when someone names you or it is your job and nobody has the floor; tell your owner with team_post if it cannot wait.` : null;
}

/** Messages in a group that name one of my AI teammates: my own always, anyone else's only if I opened it to the team. */
export function asksInGroups({ rooms = {}, roomNames = {}, team = [], me, seen = new Set(), now = Date.now() } = {}) {
  const out = [];
  for (const [room, messages] of Object.entries(rooms)) {
    for (const raw of messages) {
      const m = readRoomMessage(raw);
      if (m.deleted || m.voice || !(now - m.at < GROUP_ASK_FRESH_MS)) continue;
      for (const teammate of mentionsIn(m.body, team.filter((t) => m.by === me || t.openToTeam))) {
        const key = `room-ask:${m.id}:${teammate}`;
        if (!seen.has(key)) out.push({ key, teammate, by: m.by, text: m.body, room, roomName: roomNames[room] ?? '', ts: m.at });
      }
    }
  }
  return out;
}

/**
 * Someone else's words meant for one of my AI teammates. The owner's Needs you is
 * where they land unless the owner opened it to the team; `open` says which.
 */
export function requestsToMates({ items = [], team = [], me, seen = new Set(), direct = () => false } = {}) {
  const out = [];
  for (const item of items) {
    if (!item?.talk || !direct(item)) continue;
    for (const s of item.talk.chat ?? []) {
      if (s.by === me || !s.forAgent?.id) continue;
      const t = team.find((x) => x.id === s.forAgent.id);
      const key = `request:${item.id}:${s.by}:${s.ts}`;
      if (t && t.openToTeam && !seen.has(key)) out.push({ key, teammate: t.id, by: s.by, text: s.text, ts: s.ts });
    }
  }
  return out;
}
