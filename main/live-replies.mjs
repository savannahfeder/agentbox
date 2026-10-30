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
// Their words go LAST: the newest thing they said is the newest thing in its
// context, and nothing of ours is written after it. `files` is the supervisor's
// `attachmentBlock` for this reply: the pictures in it by absolute path, which
// is also what a cloud run reads to send them up (main/cloud/run.mjs).
export function liveReplyBrief(answer, files = '') {
  return [
    'This arrived in your thread just now, while you work, and they are watching',
    'for a reply. Do what it asks. If it asks you anything, or says it did not',
    'hear back, answer it in your very next message, in a sentence or two, before',
    'you go back to what you were doing: the sentences you write while you work',
    'are what they read, so an answer saved for the end reads as no answer at all.',
    'Then carry on.',
    ...(files ? [files] : []),
    '',
    'What they said:',
    '',
    answer,
  ].join('\n');
}

// `from` names the teammate whose words these are: they reach a running
// session framed as that teammate's, never as the person's or as a command.
export function submitReply(supervisor, payload, commit) {
  const { product, id, status, permissionMode, now = false, from = null } = payload;
  const answer = from ? framedTeammate(from, payload.answer) : payload.answer;
  const key = JSON.stringify([product, id]);
  const sends = supervisor._replySends ??= new Map();
  const previous = sends.get(key) ?? Promise.resolve();
  const session = supervisor.sessions?.get(id);
  const live = session?.product === product && typeof session.child?.steer === 'function'
    && !(from && session.remoteIdle)
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
    const files = session.remoteIdle ? null : supervisor.replyFiles?.(product, answer, session.engine, id);
    const taken = session.remoteIdle
      ? session.child.steer(answer)
      : session.child.steer(liveReplyBrief(answer, files?.block), files?.pictures ?? []);
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
// `answeredThrough` is the newest reply a finished run settled, which may have
// spoken by a rewrite rather than a result.
export function queuedReplyText(item, history, delivered) {
 const pending=[];
 const latestTs=item.wrote?.answer?.ts;
 const settled=item.answeredThrough??0;
 for(let i=history.length-1;i>=0;i--){
  const line=history[i];
  if(line.heartbeat||line.release)continue;
  if(line.patch?.result)break;
  if(line.ts<=settled)break;
  const answer=line.patch?.answer;
  if(typeof answer!=='string'||!answer.trim())continue;
  if(answer==='(withdrawn)')break;
  const from=line.source==='system'?line.patch?.from?.name:null;
  if(line.source!=='founder'&&!from)continue;
  const candidate={...item,answer,wrote:{...item.wrote,answer:{ts:line.ts}}};
  // The queue marks the newest reply at spawn. It is still part of this input.
  if(line.ts!==latestTs&&delivered(candidate))break;
  pending.unshift({answer,from});
 }
 // A teammate's words are always framed as theirs, even alone, so they are
 // never read as the person's or run as a command.
 if(!pending.length)return framedTeammate(toldNameOf(item),item.answer);
 if(pending.length===1&&!pending[0].from)return item.answer;
 return pending.map((p)=>(p.from?framedTeammate(p.from,p.answer):`The person wrote:\n\n${p.answer}`)).join('\n\n');
}

const toldNameOf=(item)=>(item.wrote?.answer?.source==='system'?item.wrote.answer.from:null);

// A teammate's words, as a turn reads them. A hand-off from a teammate is work
// to do, not the person's yes to anything.
export function framedTeammate(name,text){
 if(!name)return text;
 return `${name}, a teammate (not the person), wrote this to you:\n\n${String(text).split('\n').map((l)=>`> ${l}`).join('\n')}`;
}
