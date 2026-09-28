// One operation on an existing thread. No prompt, worker queue or automatic retry.
import { resumeThreadParams } from './codex-session.mjs';

export async function compactCodexThread({ server, threadId, threadParams = {}, onState = () => {}, timeoutMs = 120000 }) {
  if (!threadId) return 'missing';
  let watched = false, sent = false, turnId = null, timer, finish;
  const completion = new Promise(resolve => { finish = resolve; });
  const handlers = {
    onNotification(method, params) {
      if (!sent || params?.threadId !== threadId) return;
      const id = params?.turn?.id ?? params?.turnId;
      if (method === 'turn/started' && !turnId && typeof id === 'string') turnId = id;
      if (method === 'turn/completed' && turnId && id === turnId) {
        finish(params.turn?.status === 'completed' ? 'done' : 'failed');
      }
    },
    onClosed() { finish('failed'); },
  };
  try {
    const read = await server.request('thread/read', { threadId, includeTurns: true });
    if (read?.thread?.status?.type === 'active' || read?.thread?.turns?.some(turn => turn.status === 'inProgress')) return 'busy';
    // Resuming a dormant thread with an active goal can start autonomous work.
    // Compaction must not wake a goal outside the tracked worker lifecycle.
    try {
      const { goal } = await server.request('thread/goal/get', { threadId });
      if (goal?.status === 'active') return 'busy';
    } catch (error) {
      if (error?.code !== -32601 && !/method not found|unknown (method|variant)/i.test(error?.message ?? '')) throw error;
    }
    watched = true;
    await server.resumeThread(resumeThreadParams(threadId, threadParams), handlers);
    onState('running');
    timer = setTimeout(() => {
      if (turnId) Promise.resolve(server.interruptTurn(threadId, turnId)).catch(() => {});
      finish('failed');
    }, timeoutMs);
    sent = true;
    // An empty response acknowledges the request; only turn/completed settles it.
    await server.request('thread/compact/start', { threadId });
    const result = await completion;
    onState(result);
    return result;
  } catch (error) {
    return error?.code === -32601 || /method not found|unknown (method|variant)/i.test(error?.message ?? '') ? 'unavailable' : 'failed';
  } finally {
    clearTimeout(timer);
    if (watched) server.unwatch(threadId);
  }
}
