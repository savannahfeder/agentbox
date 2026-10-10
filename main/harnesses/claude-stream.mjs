import { hookFailure } from '../../shared/hook-failure.mjs';
import { SAYING_CAP } from '../codex.mjs';

// The stream's own metadata, kept on the session object: the session id (what
// a personal reply resumes) and the final result message (what the founder
// reads). Recorded for every session because it is one parse we are already
// paying for; acted on where someone needs it.
export function captureStream(session, line) {
  try {
    const obj = JSON.parse(line);
    if (obj.session_id) session.sessionId = obj.session_id;
    if (obj.type === 'result') {
      session.result = String(obj.result ?? '');
      session.resultIsError = !!obj.is_error;
      // A run cannot end with helpers still out. Cleared here as well as on
      // exit so the number can never outlive the thing it counts. Unless
      // something is still out in the background: then this was a turn
      // ending, not the run, and the session stays open for it.
      if (!session.child?.waitingOn?.().length) session.helperIds?.clear();
    }
    noteClaimAnswer(session, obj);
    countHelpers(session, obj);
  } catch {}
}

// Whether this run was refused its own row, off the claim call and its reply.
// `closingMessageIsTheAnswer` reads it: a refused worker is told to end saying
// nothing, and whatever it does say must not land on a row someone else holds.
// A later claim that succeeds clears it.
function noteClaimAnswer(session, obj) {
  const blocks = Array.isArray(obj?.message?.content) ? obj.message.content : [];
  for (const b of blocks) {
    if (obj.type === 'assistant' && b?.type === 'tool_use' && /claim_work_item$/.test(b.name ?? '')
      && (!b.input?.id || b.input.id === session.itemId)) {
      (session.claimCalls ??= new Set()).add(b.id);
    }
    if (obj.type === 'user' && b?.type === 'tool_result' && session.claimCalls?.has(b.tool_use_id)) {
      const text = typeof b.content === 'string' ? b.content
        : (b.content ?? []).map((c) => c?.text ?? '').join('');
      if (/"claimed"\s*:\s*false/.test(text)) session.claimRefused = true;
      else if (/"claimed"\s*:\s*true/.test(text)) session.claimRefused = false;
    }
  }
}

/**
 * `--include-partial-messages` puts `stream_event` frames on the same stdout
 * the finished messages come down. This keeps the CURRENT text block on the
 * session as it grows, and nothing else: no thinking, no tool arguments, and
 * nothing written to disk. It dies with the process, exactly like `tail`.
 *
 * ONE BLOCK AT A TIME, AND THAT IS THE POINT. A finished message becomes ONE
 * trace line per text block (`traceStreamLine`), so holding exactly one block
 * here means the live string and the traced string are the same string, and
 * the thread can drop the live copy the moment the traced one arrives without
 * guessing (`itemThread`, renderer/src/item-thread.ts).
 *
 * IT IS NOT CLEARED WHEN THE MESSAGE FINISHES, and that is deliberate. The
 * trace is written on one channel and read on another, so clearing it here
 * would blink the sentence off her screen for however long the read takes and
 * then put it back. The renderer suppresses it the moment the thread has it,
 * which is a comparison rather than a race.
 *
 * Returns true when the string moved, which is what earns a push.
 */
export function streamingText(session, line) {
  try {
    const obj = JSON.parse(line);
    if (obj.type !== 'stream_event') return false;
    const event = obj.event ?? {};
    // A new message. Whatever the last one ended on is the last one's, and the
    // trace has it by now.
    if (event.type === 'message_start') {
      session.saying = '';
      session.sayingAt = 0;
      return true;
    }
    if (event.type === 'content_block_start') {
      // Only a text block resets it. A tool call or a thought starting means
      // this message has moved on from prose, and the block already typed
      // stays on screen until the trace delivers the same words.
      if (event.content_block?.type !== 'text') return false;
      session.saying = '';
      session.sayingAt = Date.now();
      return true;
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const piece = String(event.delta.text ?? '');
      if (!piece) return false;
      if (!session.sayingAt) session.sayingAt = Date.now();
      const next = (session.saying ?? '') + piece;
      // Past the cap this stops being a sentence she is reading. Dropped
      // rather than cut, because a cut string never matches the traced one and
      // would sit under it on her screen forever.
      session.saying = next.length > SAYING_CAP ? '' : next;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// HOW MANY HELPERS THIS SESSION HAS OUT RIGHT NOW.
//
// THE ONLY TWO EVENTS THAT MATTER, and they bracket a helper exactly. Measured
// on Claude Code 2.1.246 over a real four-helper run (the probe is written up
// in decisions.md, 08-26): `task_started` carries a fresh `task_id`, and
// `task_updated` carries a `patch.status` of `completed` for that same id. Four
// starts, four completions, no id seen twice and none left open. So a set of
// live ids, and its size is the number.
//
// A SET AND NOT A COUNTER, because a counter cannot survive a duplicate: the
// stream is read line by line off a pipe, and one repeated line would leave the
// page saying five helpers are working for the rest of the run with nothing
// able to correct it. Adding an id twice is free.
//
// NESTED HELPERS ARE COUNTED THE SAME. `spawn_depth` says how deep a helper
// sits, and this deliberately ignores it: a helper's helper is still a
// subagent working on her task.
//
// THE LEAD IS NOT IN THIS NUMBER AND NEVER HAS BEEN, which is what the line
// drawn off it was getting wrong until 2026-08-27. Only a `task_started` id is
// ever added, and the lead has no `task_started` of its own.It is, so
// `shortWord` in renderer/src/live-line.ts now says Subagents, unhyphenated on
// her call of 2026-08-27 and on a count of the spelling in the Claude Code
// build she runs. If this ever starts counting the lead as well, that word has
// to move with it. DID THIS RUN LEAVE HER ANYTHING TO READ?
//
// The rule that divides the two writers, kept in one named place because
// getting it wrong is silence, and silence is the failure that matters most:
//
//   - said nothing at all   -> the supervisor speaks for it (sayTheRunDied)
//   - said something wrong  -> the supervisor speaks for it, in OUR words
//   - said something real   -> it speaks for itself, untouched
//
// The middle line is the one that was missing. Both writers used to exclude an
// error result: `speaksForTheSession` because raw CLI text must never reach her
// row, and this one because it only looked for a result that was absent. Each
// was right on its own and together they left the case that matters most with
// no writer at all.
export function saidNothingSheCanUse(session) {
  return session?.result == null || !!session.resultIsError;
}

export function countHelpers(session, obj) {
  if (obj?.type !== 'system') return;
  if (obj.subtype === 'task_started' && obj.task_id) {
    (session.helperIds ??= new Set()).add(obj.task_id);
  } else if (obj.subtype === 'task_updated' && obj.task_id) {
    // Anything that is not still running ends it. The measured value is
    // `completed`, and a helper that fails or is cancelled has equally stopped
    // working, so the test is what it is NOT rather than a list of endings we
    // would have to keep in step with the CLI.
    const status = obj.patch?.status;
    if (status && status !== 'in_progress' && status !== 'running') session.helperIds?.delete(obj.task_id);
  }
}

// The persisted trace line: fuller than the tail. Tool calls carry their key
// input (the file written, the command run), because "tool: Bash" answers
// nothing when the founder asks what a session actually did.
export function traceStreamLine(line) {
  try {
    const obj = JSON.parse(line);
    const at = new Date().toISOString().slice(11, 19);
    const hook = hookFailure(obj);
    if (hook) return `${at}  ${hook}`;
    if (obj.type === 'assistant' && obj.message?.content) {
      const parts = [];
      for (const c of obj.message.content) {
        if (c.type === 'text' && c.text?.trim()) parts.push(c.text.trim());
        if (c.type === 'tool_use') {
          const input = c.input ?? {};
          const hint = input.file_path ?? input.path ?? input.command ?? input.title ?? input.description ?? input.id ?? '';
          parts.push(`[${c.name}] ${String(hint).slice(0, 200)}`);
        }
      }
      return parts.length ? parts.map((p) => `${at}  ${p}`).join('\n') : null;
    }
    if (obj.type === 'result') {
      const flavor = `${obj.subtype ?? 'ok'}${obj.is_error ? ' ERROR' : ''} · ${obj.num_turns ?? '?'} turns`;
      return `\n${at}  == RESULT (${flavor}) ==\n${String(obj.result ?? '').slice(0, 4000)}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Stream-json lines are verbose; the In Progress tail wants the gist.
export function summarizeStreamLine(line) {
  try {
    const obj = JSON.parse(line);
    const hook = hookFailure(obj);
    if (hook) return hook;
    if (obj.type === 'assistant' && obj.message?.content) {
      const text = obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ');
      const tools = obj.message.content.filter((c) => c.type === 'tool_use').map((c) => c.name);
      if (tools.length) return `tool: ${tools.join(', ')}`;
      if (text) return text.slice(0, 300);
    }
    if (obj.type === 'result') return `done: ${String(obj.result ?? '').slice(0, 200)}`;
    return null;
  } catch {
    return line.slice(0, 200);
  }
}
