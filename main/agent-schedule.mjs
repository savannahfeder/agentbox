// WHEN THE USER ASKED TO SEE AN AGENT AGAIN, AND WHEN THEY ASKED NOT TO. One small
// durable map, and the only state the app keeps about a session it did not start.
//
// Three facts per agent and they are different facts. `runAt` is a moment she
// named and it passes on its own. It used to be a watermark compared against
// the session's own activity; `putAway` in shared/agents.mjs carries the whole
// story of why it is not. Neither sends anything, and neither touches the
// process — both are about her inbox.
//
// `repliedAt` is the third, and it is the moment she SPOKE to the session.It
// had not, because nothing anywhere remembered that she had said anything. The
// message went into somebody's terminal and her own list looked identical
// afterwards, which is the same shape as a message being swallowed.
//
// Unlike the other two this one is not only about her inbox — it is the record
// of a thing she did — but it is kept here for the same reason they are: there
// is no ledger an agent row could be written to. It is compared against the
// session's own `statusAt` (`tookHerReply` in shared/agents.mjs), so a session
// that comes back to a stop AFTER she spoke ends the reply rather than this
// having to expire.
//
// It is here, and not in the ledger, because there is no ledger to put it in:
// an agent row stands for somebody's terminal, it belongs to no product, and a
// write against `agent:41234` would append a line to a real product's
// work-items.jsonl for an item that does not exist (main/ipc.mjs refuses
// exactly that, and still does).
//
// Machine-local on purpose. The agents this defers are processes on THIS
// machine, read out of `ps`; carrying the moment to another machine would carry
// it away from the only thing it is about.
//
// Nothing here fires. The moment is a predicate the reader asks about every
// measurement (`putOff` in shared/agents.mjs), so a moment missed while the
// laptop was shut is simply past when the lid opens, and the row is back.

import fs from 'node:fs';
import path from 'node:path';
// Imported rather than re-derived: what identifies an agent is a rule, and
// there is one copy of it.
import { agentKey } from '../shared/agents.mjs';

const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

// THE USER'S SIDE OF A THREAD IS SMALL, and this file is read on every draw. A
// real session has a handful of human turns, typically a sentence or two each.
// The card shows three. Eight, at 600
// characters, is far more than anything draws and small enough that a session
// left running for a month cannot grow the file without bound.
const KEEP_SPOKE = 8;
const SPOKE_CHARS = 600;

function trimSpoke(list) {
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const at = num(t?.at);
    const text = String(t?.text ?? '').trim().slice(0, SPOKE_CHARS);
    if (at > 0 && text) out.push({ at, text });
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(-KEEP_SPOKE);
}

export class AgentSchedule {
  constructor(root) {
    this.file = path.join(root, '.zero-agent-schedule.json');
    this.byKey = this._read();
  }

  _read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const out = {};
      for (const [key, value] of Object.entries(raw ?? {})) {
        const runAt = num(value?.runAt);
        const doneThrough = num(value?.doneThrough);
        const repliedAt = num(value?.repliedAt);
        const spoke = trimSpoke(value?.spoke);
        // The same four-way test as `_keep`. an entry holding only `spoke` is
        // the record of a conversation, and this used to write it to disk and
        // then drop it on the next read.
        if (runAt > 0 || doneThrough > 0 || repliedAt > 0 || spoke.length) {
          out[key] = { runAt, doneThrough, repliedAt, spoke, setAt: num(value?.setAt) };
        }
      }
      return out;
    } catch {
      // No file, or a half-written one. An empty map reads as "nothing is put
      // off", which is the state of every machine on the day this shipped.
      return {};
    }
  }

  _write() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.byKey));
    } catch {}
  }

  /** The moment set on one agent, or 0. */
  runAt(key) {
    return this.byKey[key]?.runAt ?? 0;
  }

  /** The activity she has already seen and closed, or 0. */
  doneThrough(key) {
    return this.byKey[key]?.doneThrough ?? 0;
  }

  /** When she last spoke to this session from Agentbox, or 0. */
  repliedAt(key) {
    return this.byKey[key]?.repliedAt ?? 0;
  }

  _entry(key) {
    return this.byKey[key] ?? { runAt: 0, doneThrough: 0, repliedAt: 0, spoke: [], setAt: 0 };
  }

  // An entry that says none of "later", "seen", "I spoke to it" or "here is what
  // the user said" is not an entry. The last of those four is why this is not the
  // same list as it was: the user's words outlive the reply that carried them, so an
  // entry holding only `spoke` is still the record of a conversation.
  _keep(key, entry, now) {
    if (entry.runAt > now || entry.doneThrough > 0 || entry.repliedAt > 0 || entry.spoke?.length) this.byKey[key] = entry;
    else delete this.byKey[key];
    this._write();
  }

  /**
   * Put one off until `runAt`, or bring it back with 0.
   *
   * A moment already past is the same thing as no moment: the predicate would
   * be false the instant it was written, so storing it would only leave a row
   * in the file that means nothing and outlives the session it named.
   */
  set(key, runAt, now = Date.now()) {
    if (!key) return 0;
    const when = Math.max(0, Math.trunc(Number(runAt) || 0));
    const entry = this._entry(key);
    this._keep(key, { ...entry, runAt: when > now ? when : 0, setAt: now }, now);
    return when > now ? when : 0;
  }

  /**
   * `through` is the agent's own last activity at the moment she closed it; 0
   * undoes that and puts the row back, which is what her undo sends.
   *
   * ANY MARK ABOVE ZERO MEANS CLOSED.
   */
  close(key, through, now = Date.now()) {
    if (!key) return 0;
    const mark = Math.max(0, Math.trunc(Number(through) || 0));
    const entry = this._entry(key);
    // CLOSING A ROW ENDS THE REPLY TOO. She is done with it here; leaving the
    // mark standing would put it straight back into In progress the moment she
    // undid the close, saying a session was working on something she had
    // already finished with.
    //
    // BUT IT DOES NOT UNSAY WHAT THE USER SAID. This used to empty `spoke` as well,
    // and `spoke` is the ONLY record anywhere that the user ever spoke to a session:
    // Claude Code stamps an injected message `isMeta` and the transcript reader
    // drops it, correctly, so nothing else on the machine knows. Measured on
    // session-46: four of her messages reached that session and the file holds
    // one, and its card was back to quoting only what she started it with five
    // days earlier. Closing a row is about her inbox and nothing else, which is
    // what the row itself promises her; it is not a licence to forget a
    // conversation she can still open and read.
    this._keep(key, {
      ...entry,
      doneThrough: mark,
      repliedAt: mark > 0 ? 0 : entry.repliedAt,
      setAt: now,
    }, now);
    return mark;
  }

  /**
   * `at` is when; 0 clears it, which is what withdrawing a reply sends.
   *
   * Nothing here reaches the session — `main/agents.mjs` already did that, and
   * this is only written once the message was actually handed over. A mark for
   * a send that failed would move the row into In progress over a message that
   * never arrived, which is the failure this codebase cares about most.
   */
  replied(key, at, now = Date.now(), text = '') {
    if (!key) return 0;
    const mark = Math.max(0, Math.trunc(Number(at) || 0));
    const entry = this._entry(key);
    // WITHDRAWING TAKES THE WORDS BACK OUT OF THE CARD TOO. `replied(key, 0)`
    // is the undo, and a card that still quoted the message underneath it
    // would say she had said something she had just unsaid.
    const spoke = mark === 0
      ? []
      : trimSpoke([...(entry.spoke ?? []), ...(String(text).trim() ? [{ at: mark, text: String(text).trim() }] : [])]);
    this._keep(key, { ...entry, repliedAt: mark, spoke, setAt: now }, now);
    return mark;
  }

  /**
   * WHAT SHE ACTUALLY TYPED INTO THIS SESSION FROM AGENTBOX, oldest first.
   *
   * It is here because it is the only place that knows. Claude Code stamps a
   * message injected over its socket `isMeta: true` and wraps it in "Another
   * Claude session sent a message…", so the transcript reader drops it, and
   * without this record messages sent from Agentbox left the row saying only
   * what the session was started with days earlier.
   *
   * Another of the user's sessions pinging this one is a real peer, and drawing
   * it as the user's words would be a lie on the one card built to be trusted. So the record
   * is written at the moment of delivery, by the only process that knows it
   * delivered it.
   */
  spoke(key) {
    return this.byKey[key]?.spoke ?? [];
  }

  /**
   * Every live agent, carrying whatever moment she set on it.
   *
   * THE SWEEP IS NOT ALLOWED TO EAT THE FILE. A key whose moment has passed is
   * inert and always goes: the predicate already ignores it. A key for a
   * session that is not in this reading is a moment about a process that has
   * exited — but only if the reading is real. `listAgents` answers [] on the
   * first call of every boot (it hands back the cache and measures in the
   * background) and again whenever a `ps` fails, and sweeping against either of
   * those would clear every moment she has set, at every app start, with no
   * symptom except her deferred rows all coming back.
   */
  decorate(agents, now = Date.now()) {
    const live = new Set();
    const out = agents.map((agent) => {
      const key = agentKey(agent);
      live.add(key);
      const entry = this.byKey[key];
      if (!entry) return agent;
      const out = { ...agent };
      if (entry.runAt > now) { out.runAt = entry.runAt; out.runAtSetAt = entry.setAt; }
      if (entry.doneThrough > 0) out.doneThrough = entry.doneThrough;
      if (entry.repliedAt > 0) out.repliedAt = entry.repliedAt;
      // the card quotes what the user said last, and a session that has since
      // stopped is exactly when she most needs to see it.
      if (entry.spoke?.length) out.spoke = entry.spoke;
      return out;
    });
    let dropped = false;
    for (const [key, entry] of Object.entries(this.byKey)) {
      const gone = live.size > 0 && !live.has(key);
      if (!gone && (entry.runAt > now || entry.doneThrough > 0 || entry.repliedAt > 0 || entry.spoke?.length)) continue;
      delete this.byKey[key];
      dropped = true;
    }
    if (dropped) this._write();
    return out;
  }
}
