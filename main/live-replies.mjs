// Send live input in invocation order without waiting for the preceding
// provider acknowledgement. Claude can batch several queued inputs at its next
// tool boundary. Serialize acknowledgement + ledger commits separately so
// neither an out-of-order response nor a rejected input reorders the history.
import { NAME } from '../shared/product-name.mjs';
import { TURN_CLOSED } from './claude-input.mjs';
// WHAT A WORKER IS TOLD WHEN THEY TYPE AT IT WHILE IT IS STILL WORKING.
//
// The other half of `replyBrief` in supervisor.mjs, which frames a reply handed
// to a session that has already finished. This one frames a reply steered into
// a session that is mid-turn, and it exists because that framing was missing:
// bare words arrived, the agent noted them and carried on, and a question typed
// into "Add to it while it works" was marked read and never answered
// (w-ac7f0c0cbb). The brief that session is holding tells it its last message
// is the result, so without this it has every reason to save the answer for an
// ending the person is not waiting through.
//
// Their words go LAST, as in `replyBrief`: the newest thing they said is the
// newest thing in its context, and nothing of ours is written after it.
export function liveReplyBrief(answer) {
  return [
    'This arrived in your thread just now, while you work, and they are watching',
    'for a reply. Do what it asks. If it asks you anything, or says it did not',
    'hear back, answer it in your very next message, in a sentence or two, before',
    'you go back to what you were doing: the sentences you write while you work',
    'are what they read, so an answer saved for the end reads as no answer at all.',
    'Then carry on.',
    '',
    'What they said:',
    '',
    answer,
  ].join('\n');
}

export function submitReply(supervisor, payload, commit) {
  const { product, id, answer, status, permissionMode, engine, model, now = false } = payload;
  const key = JSON.stringify([product, id]);
  const sends = supervisor._replySends ??= new Map();
  const previous = sends.get(key) ?? Promise.resolve();
  const session = supervisor.sessions?.get(id);
  const changedProvider = !!session && ((engine != null && engine !== session.engine) || (model !== undefined && model !== session.model));
  const live = !changedProvider && session?.product === product && typeof session.child?.steer === 'function'
    && status !== 'done' && typeof answer === 'string' && answer.trim() && answer !== '(withdrawn)';
  // Observe rejections immediately, including when an earlier reply is still
  // waiting. The ordered commit below rethrows them to their own caller.
  const delivery = Promise.resolve().then(() => {
    if (!live) return;
    if (permissionMode != null) throw Error('A running turn keeps its current permissions. Stop it before sending with a different permission mode.');
    if (answer.trimStart().startsWith('/') && !session.remoteIdle) throw Error('Wait for the current turn to finish before running a slash command.');
    // A held Remote Control conversation is sitting idle rather than working,
    // and the slash commands it takes stop being commands once prose is wrapped
    // round them. Both reach it exactly as typed.
    const taken = session.child.steer(session.remoteIdle ? answer : liveReplyBrief(answer));
    // SENT NOW: her words go in line first, then the step is cut, in the same
    // tick, so the cut turn's result can never close the input ahead of them.
    // A cut that fails leaves the message waiting its turn, which is still sent.
    if (now) session.child.interrupt?.()?.catch?.(() => {});
    return taken;
  }).then(() => ({ ok: true }), error => ({ ok: false, error }));
  const operation = previous.catch(() => {}).then(async () => {
    const accepted = await delivery;
    // TOO LATE FOR THIS TURN IS NOT A FAILED SEND. The session closed its
    // input between the user pressing send and the line reaching it, so the
    // message is saved as an ordinary reply instead: the session's own exit
    // (`deliverMidflightReply`) or the next tick starts the run that carries
    // it. Throwing here put "The turn has ended" in front of the user and their
    // words back in the box, on whatever screen they had moved on to (w-12730c6506).
    const late = !accepted.ok && accepted.error?.code === TURN_CLOSED;
    if (!accepted.ok && !late) throw accepted.error;
    const steered = live && !late;
    let saved;
    try { saved = await commit(); }
    catch (error) {
      if (steered) throw Error(`The agent received this message, but ${NAME} could not save its local record. Check the conversation before resending.`, { cause: error });
      throw error;
    }
    const item = saved ? { ...saved, product, id } : saved;
    if (steered && item) {
      supervisor._handledAnswers.add(supervisor._answerKey(item));
      // Taken into this conversation, which a later stop does not undo.
      supervisor._noteHeard?.(item, session.sessionId);
      session.lastLiveReply = item;
      supervisor._saveState();
      if (session.exitFailed) {
        supervisor.redeliverAnswer(item, item.answer);
        if (!session.stoppedByUs) supervisor.deliverMidflightReply({ ...item, answer: null, wrote: {} }, null);
      }
    }
    if (!steered && item && status !== 'done' && typeof answer === 'string' && answer.trim() && answer !== '(withdrawn)') {
      supervisor.runNow?.(product, id);
    }
    return item;
  });
  sends.set(key, operation);
  void operation.finally(() => { if (sends.get(key) === operation) sends.delete(key); }).catch(() => {});
  return operation;
}

// The ledger preserves every reply even while capacity is full. A resumed
// provider otherwise receives only its latest-answer field. Read backward to
// the preceding response/delivery, preserving repeated words and write order.
export function queuedReplyText(item, history, delivered) {
 const pending=[];
 const latestTs=item.wrote?.answer?.ts;
 for(let i=history.length-1;i>=0;i--){
  const line=history[i];
  if(line.heartbeat||line.release)continue;
  if(line.patch?.result)break;
  const answer=line.patch?.answer;
  if(typeof answer!=='string'||!answer.trim())continue;
  if(answer==='(withdrawn)')break;
  if(line.source!=='founder')continue;
  const candidate={...item,answer,wrote:{...item.wrote,answer:{ts:line.ts}}};
  // The queue marks the newest reply at spawn. It is still part of this input.
  if(line.ts!==latestTs&&delivered(candidate))break;
  pending.unshift(answer);
 }
 return pending.length>1 ? pending.join('\n\n') : item.answer;
}
