// One operation on an existing thread. No prompt, worker queue or automatic retry.
import { resumeThreadParams } from './codex-session.mts';

export type CompactResult = 'missing' | 'busy' | 'done' | 'failed' | 'unavailable';

interface RpcError { code?: number; message?: string }

interface CompactReply {
  thread?: { status?: { type?: string }; turns?: { status?: string }[] };
  goal?: { status?: string } | null;
}

interface CompactNotification {
  threadId?: string;
  turnId?: string;
  turn?: { id?: string; status?: string };
}

interface CompactHandlers {
  onNotification(method: string, params: CompactNotification): void;
  onClosed(): void;
}

export interface CompactServer {
  request(method: string, params: Record<string, unknown>): Promise<CompactReply>;
  resumeThread(params: Record<string, unknown>, handlers: CompactHandlers): Promise<unknown>;
  interruptTurn(threadId: string, turnId: string): unknown;
  unwatch(threadId: string): unknown;
}

export interface CompactOptions {
  server: CompactServer;
  threadId: string | null | undefined;
  threadParams?: Record<string, unknown>;
  onState?: (state: string) => void;
  timeoutMs?: number;
}

export async function compactCodexThread({ server, threadId, threadParams = {}, onState = () => {}, timeoutMs = 120000 }: CompactOptions): Promise<CompactResult> {
  if (!threadId) return 'missing';
  let watched = false, sent = false, turnId: string | null = null, timer: ReturnType<typeof setTimeout> | undefined, finish: (result: CompactResult) => void;
  const completion = new Promise<CompactResult>(resolve => { finish = resolve; });
  const handlers: CompactHandlers = {
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
      if ((error as RpcError)?.code !== -32601 && !/method not found|unknown (method|variant)/i.test((error as RpcError)?.message ?? '')) throw error;
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
    return (error as RpcError)?.code === -32601 || /method not found|unknown (method|variant)/i.test((error as RpcError)?.message ?? '') ? 'unavailable' : 'failed';
  } finally {
    clearTimeout(timer);
    if (watched) server.unwatch(threadId);
  }
}
