// ONE TURN OF ONE THREAD ON AN AGENT THAT SPEAKS ACP.
//
// To the supervisor this is a worker like any other: it emits the agent's own
// notifications as `event`, its failures as stderr text, and `exit` once. What
// it adds is what the wire leaves out. A tool call's command arrives on a later
// update than the call and its completion carries neither, so the updates are
// joined here and sent on as one event; a finished message, the session's id
// and the end of the turn get an event each (main/acp-readers.mts).
//
// A start that fails says why on stderr and exits 1 with no result, the way a
// refused Codex worker does, so the run counts as one that never began.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { createAcpClient, rejectionOption, ACP_PROTOCOL_VERSION } from './acp.mts';
import type { PermissionOption } from './acp.mts';
import { ACP_SESSION, ACP_MESSAGE, ACP_TOOL, ACP_TURN } from './acp-readers.mts';
import type { AcpTool } from './acp-readers.mts';

export interface AcpMcpServer { name: string; command: string; args: string[]; env: { name: string; value: string }[] }

/** What the agent wants a yes for, in the three shapes a card can draw. */
export type AcpApproval =
  | { kind: 'command'; command: string; cwd: string | null }
  | { kind: 'edit'; changes: { path: string; oldText: string | null; newText: string }[] }
  | { kind: 'tool'; title: string };

export interface AcpWorkerOptions {
  /** Starts the agent with its stdin and stdout piped. */
  start: () => ChildProcess;
  /** The tool's name, for the sentences a person reads. */
  label: string;
  cwd: string;
  prompt: string;
  resumeSessionId?: string | null;
  mcpServers?: AcpMcpServer[];
  model?: string | null;
  /** Puts the question to the person; true allows it once. With none, everything asked is refused. */
  ask?: ((approval: AcpApproval) => Promise<boolean>) | null;
  /** Where this conversation's record is kept, by its id. */
  recordFile?: ((sessionId: string) => string) | null;
  /** The command that signs this tool in, for the sentence that says to. */
  signIn?: string | null;
}

export interface AcpWorker extends EventEmitter {
  stderr: EventEmitter;
  sessionId: string | null;
  pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  done: Promise<void>;
}

interface ToolUpdate {
  sessionUpdate?: string;
  toolCallId?: string;
  kind?: string;
  title?: string;
  status?: string;
  messageId?: string;
  rawInput?: { command?: unknown; cwd?: unknown; path?: unknown; filePath?: unknown; content?: unknown } | null;
  locations?: { path?: unknown }[] | null;
  content?: ({ type?: unknown; path?: unknown; oldText?: unknown; newText?: unknown; text?: unknown } | null)[] | { type?: unknown; text?: unknown } | null;
}

interface ConfigOption { id?: string; category?: string; options?: { value?: string }[] }

// How long a stopped turn gets to say it stopped before the agent is ended.
const STOP_GRACE_MS = 2_000;
const STDERR_TAIL = 600;

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const changesIn = (content: ToolUpdate['content']) => (Array.isArray(content) ? content : [])
  .filter((part) => part?.type === 'diff' && text(part.path))
  .map((part) => ({ path: text(part!.path), oldText: typeof part!.oldText === 'string' ? part!.oldText : null, newText: text(part!.newText) }));

/** The command for a shell call, the file for anything on a file, else the tool's own title. */
function detailOf(call: ToolUpdate): string {
  if (call.kind === 'execute') return text(call.rawInput?.command) || text(call.title);
  return text(call.locations?.[0]?.path) || text(call.rawInput?.path) || text(call.rawInput?.filePath) || text(call.title);
}

export function approvalOf(call: ToolUpdate | null | undefined, cwd: string): AcpApproval {
  const changes = changesIn(call?.content);
  if (changes.length) return { kind: 'edit', changes };
  // A new file is asked about with its path and content and no diff.
  const file = text(call?.rawInput?.path) || text(call?.rawInput?.filePath);
  if (call?.kind === 'edit' && file && typeof call.rawInput?.content === 'string') return { kind: 'edit', changes: [{ path: file, oldText: null, newText: call.rawInput.content }] };
  const command = text(call?.rawInput?.command);
  if (command || call?.kind === 'execute') return { kind: 'command', command: command || text(call?.title), cwd: text(call?.rawInput?.cwd) || cwd };
  return { kind: 'tool', title: text(call?.title) || 'use a tool' };
}

const approvalWords = (approval: AcpApproval) => (approval.kind === 'command' ? approval.command
  : approval.kind === 'edit' ? `a change to ${approval.changes.map((c) => c.path).join(', ')}`
  : approval.title);

export function createAcpWorker({
  start, label, cwd, prompt, resumeSessionId = null, mcpServers = [], model = null, ask = null, recordFile = null, signIn = null,
}: AcpWorkerOptions): AcpWorker {
  const worker = new EventEmitter() as AcpWorker;
  worker.stderr = new EventEmitter();
  worker.sessionId = resumeSessionId;

  let ended = false;
  let stopping = false;
  let replaying = false;
  let prompting: Promise<unknown> | null = null;
  let refused: string | null = null;
  let record: string | null = null;
  let message: { id: string | null; text: string } | null = null;
  const calls = new Map<string, ToolUpdate & { started?: boolean }>();

  const keep = (line: Record<string, unknown>) => {
    if (!record) return;
    try { fs.appendFileSync(record, `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`); } catch { /* a record is never worth a run */ }
  };
  const send = (method: string, params: unknown) => worker.emit('event', method, params);
  const sendOurs = (method: string, params: Record<string, unknown>) => { keep({ event: method, ...params }); send(method, params); };

  const endMessage = () => {
    const said = message?.text.trim();
    message = null;
    if (said) sendOurs(ACP_MESSAGE, { text: said });
  };
  const tool = (call: ToolUpdate, status: AcpTool['status']) => {
    const paths = status === 'completed' && ['edit', 'delete', 'move'].includes(call.kind ?? '')
      ? [...new Set([...changesIn(call.content).map((c) => c.path), ...(call.locations ?? []).map((l) => text(l?.path)).filter(Boolean)])]
      : [];
    sendOurs(ACP_TOOL, { id: call.toolCallId, kind: call.kind ?? 'other', detail: detailOf(call), status, paths });
  };

  /** Joins what the wire sends in pieces, before the piece itself is passed on. */
  const join = (update: ToolUpdate | null | undefined) => {
    if (!update) return;
    if (update.sessionUpdate === 'agent_message_chunk') {
      const id = update.messageId ?? null;
      if (message && message.id !== id) endMessage();
      message ??= { id, text: '' };
      const piece = !Array.isArray(update.content) ? text(update.content?.text) : '';
      message.text += piece;
      return;
    }
    if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') return;
    if (!update.toolCallId) return;
    endMessage();
    const { sessionUpdate: _kind, ...fresh } = update;
    const had = calls.get(update.toolCallId) ?? {};
    // A later update names only what changed, so what an earlier one said is kept.
    const call = { ...had, ...Object.fromEntries(Object.entries(fresh).filter(([, value]) => value != null && !(Array.isArray(value) && !value.length))) } as ToolUpdate & { started?: boolean };
    calls.set(update.toolCallId, call);
    if (!call.started && call.status === 'in_progress') { call.started = true; tool(call, 'started'); }
    if (call.status === 'completed' || call.status === 'failed') { calls.delete(update.toolCallId); tool(call, call.status); }
  };

  const child = start();
  worker.pid = child.pid;
  const client = createAcpClient({
    transport: child as never,
    onNotification(method, params) {
      // A loaded session replays its history, which is not this turn.
      if (replaying) return;
      if (method === 'session/update') join((params as { update?: ToolUpdate }).update);
      send(method, params);
    },
    async onPermission(request) {
      const options = (request.options ?? []) as PermissionOption[];
      const no = rejectionOption(options);
      const once = options.find((option) => option.kind === 'allow_once')?.optionId ?? null;
      const approval = approvalOf(request.toolCall as ToolUpdate | undefined, cwd);
      // An agent that offers no "allow once" cannot be allowed once, and "always" is nobody's answer to one card.
      const allowed = ask && once ? await ask(approval).catch(() => false) : false;
      if (!allowed) refused = approvalWords(approval);
      return allowed ? once : no;
    },
  });

  const end = (code: number | null, signal: NodeJS.Signals | null) => {
    if (ended) return;
    ended = true;
    client.close('The run is over');
    worker.emit('exit', code, signal);
  };
  const fail = (sentence: string) => {
    const tail = client.diagnostics().trim().slice(-STDERR_TAIL);
    worker.stderr.emit('data', tail ? `${sentence}\n${tail}` : sentence);
    end(1, null);
  };

  const run = async () => {
    try {
      const hello = await client.initialize() as { protocolVersion?: number } | null;
      if (hello?.protocolVersion !== ACP_PROTOCOL_VERSION) {
        return fail(`${label} answered with version ${String(hello?.protocolVersion)} of the agent protocol, and this app speaks version ${ACP_PROTOCOL_VERSION}. Update whichever is older.`);
      }
      let offered: ConfigOption[] = [];
      if (resumeSessionId) {
        if (!client.can('loadSession')) return fail(`${label} cannot carry on an earlier conversation, so this reply had nothing to continue.`);
        replaying = true;
        const loaded = await client.loadSession({ sessionId: resumeSessionId, cwd, mcpServers }) as { configOptions?: ConfigOption[] } | null;
        replaying = false;
        offered = loaded?.configOptions ?? [];
      } else {
        const made = await client.newSession({ cwd, mcpServers }) as { sessionId?: string; configOptions?: ConfigOption[] } | null;
        if (!made?.sessionId) return fail(`${label} did not name the conversation it opened.`);
        worker.sessionId = made.sessionId;
        offered = made.configOptions ?? [];
      }
      if (stopping) return;
      const sessionId = worker.sessionId!;
      if (model) {
        const choice = offered.find((option) => option.id === 'model' || option.category === 'model');
        if (!choice?.id || !choice.options?.some((option) => option.value === model)) return fail(`${label} does not offer the model ${model} on this computer. Pick another model for this thread.`);
        await client.setConfigOption({ sessionId, configId: choice.id, value: model });
      }
      if (recordFile) {
        record = recordFile(sessionId);
        fs.mkdirSync(path.dirname(record), { recursive: true });
      }
      worker.emit('spawn');
      send(ACP_SESSION, { sessionId });
      keep({ event: 'prompt', text: prompt });
      prompting = client.prompt({ sessionId, text: prompt });
      const turn = await prompting as { stopReason?: string } | null;
      prompting = null;
      if (stopping) return;
      endMessage();
      sendOurs(ACP_TURN, { stopReason: turn?.stopReason ?? null, refused });
      end(0, null);
    } catch (error) {
      replaying = false;
      prompting = null;
      if (stopping || ended) return;
      const said = (error as Error)?.message ?? String(error);
      if (/auth/i.test(said)) return fail(`${label} is not signed in on this computer.${signIn ? ` Sign in by running: ${signIn}` : ''}`);
      fail(`${label} stopped: ${said}`);
    }
  };

  worker.kill = () => {
    if (ended) return false;
    stopping = true;
    const turn = prompting;
    // A turn told to stop answers `cancelled`; the wait is only so it can, and the kill follows either way.
    if (turn && worker.sessionId) client.cancel(worker.sessionId);
    const finish = () => { endMessage(); end(143, 'SIGTERM'); };
    if (!turn) finish();
    else Promise.race([turn.catch(() => null), new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS))]).then(finish);
    return true;
  };
  worker.done = run();
  return worker;
}
