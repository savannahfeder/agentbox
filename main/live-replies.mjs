// Send live input in invocation order without waiting for the preceding
// provider acknowledgement. Claude can batch several queued inputs at its next
// tool boundary. Serialize acknowledgement + ledger commits separately so
// neither an out-of-order response nor a rejected input reorders the history.
import { NAME } from '../shared/product-name.mjs';
import { TURN_CLOSED } from './claude-input.mjs';
export function submitReply(supervisor, payload, commit) {
  const { product, id, answer, status, permissionMode, now = false } = payload;
  const key = JSON.stringify([product, id]);
  const sends = supervisor._replySends ??= new Map();
  const previous = sends.get(key) ?? Promise.resolve();
  const session = supervisor.sessions?.get(id);
  const live = session?.product === product && typeof session.child?.steer === 'function'
    && status !== 'done' && typeof answer === 'string' && answer.trim() && answer !== '(withdrawn)';
  // Observe rejections immediately, including when an earlier reply is still
  // waiting. The ordered commit below rethrows them to their own caller.
  const delivery = Promise.resolve().then(() => {
    if (!live) return;
    if (permissionMode != null) throw Error('A running turn keeps its current permissions. Stop it before sending with a different permission mode.');
    if (answer.trimStart().startsWith('/') && !session.remoteIdle) throw Error('Wait for the current turn to finish before running a slash command.');
    const taken = session.child.steer(answer);
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
