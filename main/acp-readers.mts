// READING A RUN OF ANY AGENT THAT SPEAKS ACP.
//
// The readers every harness provides (capture, live text, summary, trace; the
// activity one is in main/agent-activity.mts) over ACP's `session/update`
// notifications, plus the few events the
// worker adds because the wire has none for them (main/acp-worker.mts): the
// session's id, a finished message, a finished tool call, the end of the turn.
//
// The shapes, as OpenCode 2.3.2 sends them:
//
//   agent_message_chunk   { messageId, content: { type: 'text', text } }   a piece of prose
//   agent_thought_chunk   the model thinking; never shown and never an answer
//   tool_call             { toolCallId, kind, title, status: 'pending', rawInput: {} }
//   tool_call_update      { toolCallId, status, title?, rawInput?, locations?, content? }
//   usage_update          { used, size, cost: { amount, currency } }
//
// A tool call's command or path arrives on a later update than the call itself,
// and its completion carries neither, which is why the worker joins them.

/** What a tool call was, once the worker has joined its updates. */
export interface AcpTool {
  id: string;
  kind: string;
  /** The command, the path, or the tool's own title. */
  detail: string;
  status: 'started' | 'completed' | 'failed';
  /** Files it changed, when it was an edit, a delete or a move that completed. */
  paths: string[];
}

export interface AcpTurnEnd {
  stopReason?: string | null;
  /** The tool call the person refused, when the agent ended the turn over it. */
  refused?: string | null;
}

export interface AcpSession {
  sessionId?: string | null;
  result?: string;
  resultIsError?: boolean;
  saying?: string;
  sayingAt?: number;
  acpMessage?: { id: string | null; text: string } | null;
  acpChange?: string[];
  acpUsage?: { used?: number; size?: number; cost?: number; currency?: string };
}

interface Update {
  sessionUpdate?: unknown;
  messageId?: unknown;
  content?: { type?: unknown; text?: unknown } | null;
  used?: unknown;
  size?: unknown;
  cost?: { amount?: unknown; currency?: unknown } | null;
}

type Params = { update?: Update | null; sessionId?: unknown; text?: unknown } & Partial<AcpTool> & AcpTurnEnd | null | undefined;

// The events the worker adds. Never on the wire.
export const ACP_SESSION = 'agentbox/session';
export const ACP_MESSAGE = 'agentbox/message';
export const ACP_TOOL = 'agentbox/tool';
export const ACP_TURN = 'agentbox/turn';

const SAYING_CAP = 20_000;

/** The word a person would use for each of ACP's tool kinds. */
const KIND_WORDS: Record<string, string> = {
  execute: 'Bash', edit: 'Edit', delete: 'Delete', move: 'Move', read: 'Read',
  search: 'Search', fetch: 'Fetch', think: 'Think', other: 'Tool',
};
export const acpToolWord = (kind: unknown) => KIND_WORDS[String(kind ?? '')] ?? 'Tool';

const updateOf = (method: unknown, params: Params): Update | null => (method === 'session/update' && params && typeof params === 'object' ? params.update ?? null : null);
const proseOf = (update: Update | null): string | null => (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text' && typeof update.content.text === 'string' ? update.content.text : null);

/** Why a turn that did not end on its own ended, as a sentence for the thread. */
function stopSentence({ stopReason, refused }: AcpTurnEnd): { text: string; isError: boolean } | null {
  if (stopReason === 'end_turn') return null;
  if (stopReason === 'cancelled') return refused ? { text: `It stopped when you refused: ${refused}`, isError: false } : null;
  if (stopReason === 'max_tokens') return { text: 'It stopped part way: the model reached the most it can write in one turn. Reply to carry on.', isError: true };
  if (stopReason === 'max_turn_requests') return { text: 'It stopped part way: it reached the most steps it may take in one turn. Reply to carry on.', isError: true };
  if (stopReason === 'refusal') return { text: 'The model refused this request.', isError: true };
  return { text: `It stopped without finishing (${String(stopReason ?? 'no reason given')}).`, isError: true };
}

/**
 * What the run was, kept on the session as it goes. The answer is the last
 * message of the turn: prose arrives in pieces under a message id, and a new id
 * starts a new message.
 */
export function captureAcpEvent(session: AcpSession | null | undefined, method: unknown, params?: Params) {
  try {
    if (!session || typeof method !== 'string') return;
    const p = params ?? {};
    if (method === ACP_SESSION) {
      if (typeof p.sessionId === 'string' && p.sessionId) session.sessionId = p.sessionId;
      return;
    }
    if (method === ACP_TOOL) {
      if (p.status !== 'completed') return;
      for (const file of p.paths ?? []) {
        session.acpChange ??= [];
        if (!session.acpChange.includes(file)) session.acpChange.push(file);
      }
      return;
    }
    if (method === ACP_TURN) {
      const stopped = stopSentence(p);
      if (!stopped) return;
      // What it said before it stopped is kept, with why it stopped under it.
      const said = stopped.isError ? '' : String(session.result ?? '').trim();
      session.result = said ? `${said}\n\n${stopped.text}` : stopped.text;
      session.resultIsError = stopped.isError;
      return;
    }
    const update = updateOf(method, p);
    if (!update) return;
    if (update.sessionUpdate === 'usage_update') {
      session.acpUsage = {
        ...(Number.isFinite(update.used) ? { used: update.used as number } : {}),
        ...(Number.isFinite(update.size) ? { size: update.size as number } : {}),
        ...(Number.isFinite(update.cost?.amount) ? { cost: update.cost!.amount as number, currency: String(update.cost!.currency ?? '') } : {}),
      };
      return;
    }
    const piece = proseOf(update);
    if (piece === null) return;
    const id = typeof update.messageId === 'string' ? update.messageId : null;
    if (!session.acpMessage || session.acpMessage.id !== id) session.acpMessage = { id, text: '' };
    session.acpMessage.text += piece;
    const text = session.acpMessage.text.trim();
    if (text) { session.result = text; session.resultIsError = false; }
  } catch {
    // A reader that throws kills a run that was going fine: read what parses.
  }
}

/**
 * The agent has begun on the words it was sent: thinking counts, because a
 * turn stopped while it thought still left those words in its conversation
 * (OpenCode 2.3.2 acted on them on the next reply).
 */
export function acpTookTheWords(method: unknown, params?: Params): boolean {
  const kind = updateOf(method, params)?.sessionUpdate;
  return kind === 'agent_thought_chunk' || kind === 'agent_message_chunk' || kind === 'tool_call';
}

/** The prose as it is typed, for the line on the row that moves. A tool starting ends it. */
export function acpStreamingText(session: AcpSession | null | undefined, method: unknown, params?: Params): boolean {
  try {
    if (!session) return false;
    const update = updateOf(method, params);
    if (update?.sessionUpdate === 'tool_call') { session.saying = ''; session.sayingAt = Date.now(); return true; }
    const piece = proseOf(update);
    if (!piece) return false;
    if (!session.sayingAt) session.sayingAt = Date.now();
    const next = (session.saying ?? '') + piece;
    session.saying = next.length > SAYING_CAP ? '' : next;
    return true;
  } catch {
    return false;
  }
}

/** One short line for the row: what it just did. */
export function summarizeAcpEvent(method: unknown, params?: Params): string | null {
  try {
    const p = params ?? {};
    if (method === ACP_MESSAGE) return String(p.text ?? '').trim().slice(0, 300) || null;
    if (method === ACP_TOOL && p.status === 'completed') return `tool: ${acpToolWord(p.kind)}`;
    return null;
  } catch {
    return null;
  }
}

/** One line for the run trace, the record a person can open afterwards. */
export function traceAcpEvent(method: unknown, params?: Params): string | null {
  try {
    const p = params ?? {};
    const at = new Date().toISOString().slice(11, 19);
    if (method === ACP_MESSAGE) {
      const text = String(p.text ?? '').trim();
      return text ? `${at}  ${text}` : null;
    }
    if (method === ACP_TOOL && (p.status === 'completed' || p.status === 'failed')) {
      const detail = String(p.detail ?? '').trim();
      return `${at}  [${acpToolWord(p.kind)}]${p.status === 'failed' ? ' (refused or failed)' : ''}${detail ? ` ${detail.slice(0, 200)}` : ''}`;
    }
    return null;
  } catch {
    return null;
  }
}
