import { randomUUID } from 'node:crypto';

// THE SESSION STOPPED LISTENING BEFORE IT TOOK THIS MESSAGE. Not a refusal:
// the turn closed, or the process went, in the seconds between her pressing
// send and the line reaching it. `submitReply` saves such a message as an
// ordinary reply, which the next run picks up, instead of throwing it back
// at her with "The turn has ended" (w-12730c6506).
export const TURN_CLOSED = 'TURN_CLOSED';
function turnClosed(message) {
  const error = Error(message);
  error.code = TURN_CLOSED;
  return error;
}

// How long a finished background job may go without the agent waking for it
// before the session is closed anyway. Measured wakes arrive in about a second.
const WAKE_GRACE_MS = 2 * 60 * 1000;

export function claudeStreamArgs(args) {
  const copy = [...args];
  const index = copy.indexOf('-p');
  if (index < 0) throw Error('Missing print prompt');
  copy.splice(index + 1, 1);
  return [...copy, '--input-format', 'stream-json', '--replay-user-messages'];
}

// Replay-user-messages acknowledges the exact UUID when Claude consumes it.
// A result for earlier work must not close stdin over queued corrections.
export function attachClaudeInput(child) {
  let closed = false, buffer = '', atResult = false, held = false;
  const controls = new Map();
  const seenUsers = new Set();
  const pending = new Map();
  // WHAT THE AGENT STARTED AND HAS NOT HEARD BACK FROM: a background command,
  // a command Claude Code moved to the background past its time limit, a
  // background helper. Claude Code lists them in `background_tasks_changed`
  // and wakes the agent itself when one ends, but only while stdin is open. A
  // result with any of these out is "I'll report once it finishes", not the
  // end of the run, and closing there killed the suite it was waiting on
  // (tests/an-agent-waiting-on-its-own-tests-does-not-come-back-to-you).
  let waiting = [], wakeTimer = null;
  // Input only ever closes at a result with nothing out, so a closed input is
  // the one proof the run reached its end. A session that exits with input
  // still open was stopped part-way, whatever its last turn said
  // (tests/a-worker-whose-helpers-are-still-working-does-not-come-back-to-you).
  let ended = false;
  const closeInput = () => { closed = true; ended = true; clearTimeout(wakeTimer); child.stdin.end(); };
  const mayClose = () => !held && atResult && !pending.size && !waiting.length;
  const fail = reason => {
    closed = true;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(turnClosed(reason));
    }
    pending.clear();
    for (const request of controls.values()) { clearTimeout(request.timer); request.reject(Error(reason)); }
    controls.clear();
  };
  child.on('exit', () => fail('The agent exited before confirming this correction.'));
  child.on('error', () => fail('The agent could not receive this correction.'));
  child.stdin.on('error', () => fail('The agent input connection closed.'));
  child.stdout.on('data', data => {
    buffer += String(data);
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === 'control_response') {
        const response = event.response, request = controls.get(response?.request_id);
        if (request) { controls.delete(response.request_id); clearTimeout(request.timer);
          if (response.subtype === 'success') request.resolve(response.response ?? {});
          else request.reject(Error(response.error || 'The provider rejected this operation.'));
        }
      }
      if (event.type === 'system' && event.subtype === 'bridge_state') child.emit('bridge-state', event);
      if (event.type === 'assistant') atResult = false;
      if (event.type === 'user' && !event.parent_tool_use_id && typeof event.uuid === 'string' && !seenUsers.has(event.uuid)) {
        seenUsers.add(event.uuid);
        const content = event.message?.content;
        const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
        if (held && !pending.has(event.uuid) && text && !event.isMeta) child.emit('remote-user', event);
        if (text) { atResult = false; child.emit('input-turn', event); }
      }
      if (event.type === 'user' && pending.has(event.uuid)) {
        const request = pending.get(event.uuid);
        pending.delete(event.uuid);
        clearTimeout(request.timer);
        atResult = false;
        request.resolve({ accepted: true });
      }
      if (event.type === 'system' && event.subtype === 'background_tasks_changed' && Array.isArray(event.tasks)) {
        waiting = event.tasks;
        // The last one ended between turns. Claude Code wakes the agent for
        // it, and that turn's result closes as usual. The timer is only for a
        // wake that never comes, so a session cannot sit open forever.
        clearTimeout(wakeTimer);
        if (!waiting.length && atResult && !closed) {
          wakeTimer = setTimeout(() => { if (mayClose() && !closed) closeInput(); }, WAKE_GRACE_MS);
          wakeTimer.unref?.();
        }
      }
      if (event.type === 'result') {
        atResult = true;
        if (mayClose()) closeInput();
      }
    }
  });
  child.waitingOn = () => [...waiting];
  child.ranToTheEnd = () => ended;
  child.holdInput = value => {
    if (closed && value) throw Error('This session has ended. Open remote control again to resume it.');
    held = !!value;
    if (mayClose()) closeInput();
  };
  child.control = (request, timeoutMs = 30000) => new Promise((resolve, reject) => {
    if (closed || !child.stdin.writable) return reject(Error('The agent connection is closed.'));
    const request_id = randomUUID();
    const timer = setTimeout(() => { controls.delete(request_id); reject(Error('The provider did not confirm the remote-control operation.')); }, timeoutMs);
    timer.unref?.();
    controls.set(request_id, { resolve, reject, timer });
    try { child.stdin.write(JSON.stringify({ type:'control_request', request_id, request }) + '\n'); }
    catch(error) { clearTimeout(timer); controls.delete(request_id); reject(error); }
  });
  // NO CLOCK ON THE ACKNOWLEDGEMENT. Claude replays a queued message at its next
  // break, and a break can be minutes away: a worker inside one long command
  // (a render poll, `sleep 12` fifty times) holds it until the command returns.
  // This used to reject at 120s with "delivery is uncertain", which the
  // renderer read as a failed send: it pulled her back to the row, put her
  // words back in the box, and the agent then took the ORIGINAL anyway, so the
  // one she re-sent arrived twice (w-d92559b84f: queued 22:21:00, taken
  // 22:24:10, re-sent 22:24:34). Once the line is on stdin the CLI owns it, so
  // the only real failures are the ones `fail` already hears: exit, error,
  // stdin closing.
  child.steer = text => new Promise((resolve, reject) => {
    if (closed || !child.stdin.writable) return reject(turnClosed('The turn has ended. Send the message again to continue it.'));
    const uuid = randomUUID();
    pending.set(uuid, { resolve, reject });
    try {
      child.stdin.write(JSON.stringify({ type: 'user', uuid, message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' }) + '\n');
    } catch (error) {
      pending.delete(uuid);
      reject(turnClosed(error?.message || 'The agent input connection closed.'));
    }
  });
  return child;
}
