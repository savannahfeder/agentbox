// THE APP'S END OF A CONNECTION, AND THE ONLY PLACE ITS RULES ARE ENFORCED.
//
// A worker's proxy sends requests here over a local socket, each carrying a key
// made for that one run. The key names a run, its thread and its connections,
// and dies with the run. It is not a token and buys nothing a run could not
// already do: a worker can read it, and with it can only ask this file.
//
// Engine approvals are not relied on: cloud defaults bypass them. A read on the
// catalog's list passes, a write on its list goes to her card through the same
// channel and signed decision every approval uses, and anything else is denied.
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { connectionServerName, downWords, STATES, stateWords, type CatalogTool } from '../../shared/connections-catalog.mts';
import { approvalPublicKey, spoolDir } from '../approvals.mts';
import { serveApprovals } from '../approval-prompt-core.mts';
import type { ConnectionServers } from '../codex-session.mts';
import type { Connections } from './index.mts';
import { stateOfError, type ToolError } from './talk.mts';
import type { ConnectionStatus, VaultData } from './vault.mts';
import { stripTypesFlags } from '../strip-types.mts';
import { Name } from '../../shared/product-name.mjs';
import { serveLocal } from '../local-channel.mts';

const MAX_LINE = 1024 * 1024;
const MAX_ANSWER = 900 * 1024;
const MAX_AT_ONCE = 16;
export const CHANNEL_KIND = 'connections';

/** The thread a run is for, whose card a write asks on. */
interface RunItem {
  id: string;
  product: string;
}

interface BrokerRun {
  runId: string;
  item: RunItem;
  ids: Set<string>;
  live: Set<AbortController>;
}

/** One line from a worker's proxy (mcp/connection-proxy.mts). */
interface BrokerRequest {
  id: number | string;
  run: string;
  connection: string;
  method: string;
  params?: { name?: unknown; arguments?: Record<string, unknown> };
}

interface CardVerdict {
  behavior: 'allow' | 'deny';
  message?: string;
}

/** How a write reads on her card: the card's own "server / tool" line. */
export const WRITE_CARD_TOOL = (name: string, tool: string): string => `mcp__${name}__${tool}`;

const denied = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });
const firstWords = (result: CallToolResult | null | undefined): string => (result?.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join(' ') || 'It said the call failed.';

function wordsFor(entry: CatalogTool, err: unknown, { wrote = false, status = null, now = Date.now() }: { wrote?: boolean; status?: ConnectionStatus | null; now?: number } = {}): string {
  const state = stateOfError(err as ToolError);
  const name = entry.name;
  if (state === STATES.UNREACHABLE) return `${name} answered, but not as a tool agents can use, so this was not done. ${stateWords(state).todo} Tell the owner; do not offer to connect it, as it is connected.`;
  if (state === STATES.NOT_SIGNED_IN) return `${name} no longer accepts this sign-in, so this was not done. Ask the owner to sign in again on the Connections page in ${Name}.`;
  if (state === STATES.NOT_ALLOWED) return `${name} says the owner's account is not allowed to do this, so it was not done. They may need to ask for access.`;
  if (wrote) return `${name} did not answer after this was sent, so it may or may not have gone through. Check whether it took effect before trying again.`;
  const down = status?.at ? downWords({ name, since: status.since, at: status.at }, now) : `${name} is temporarily down.`;
  return `${down} So this was not done. The app tries it again by itself and puts a row in Needs you when it works. Carry on without it and say what you could not read.`;
}

function askTheCard({ storeRoot, item, tool, input, signal }: { storeRoot: string; item: RunItem; tool: string; input: unknown; signal: AbortSignal }): Promise<CardVerdict> {
  return new Promise((resolve) => {
    const toChannel = new PassThrough();
    const fromChannel = new PassThrough();
    const channel = serveApprovals({
      env: { ZERO_APPROVALS_DIR: spoolDir(storeRoot), ZERO_APPROVALS_PUBKEY: approvalPublicKey(), ZERO_PRODUCT: item.product, ZERO_ITEM: item.id },
      input: toChannel, output: fromChannel,
    });
    let held = '';
    fromChannel.setEncoding('utf8');
    fromChannel.on('data', (d) => {
      held += d;
      const end = held.indexOf('\n');
      if (end < 0) return;
      signal.removeEventListener('abort', channel.close);
      channel.close();
      try { resolve(JSON.parse(JSON.parse(held.slice(0, end)).result.content[0].text)); } catch { resolve({ behavior: 'deny', message: 'The card could not be read, so nothing was done.' }); }
    });
    signal.addEventListener('abort', channel.close, { once: true });
    toChannel.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'approval_prompt', arguments: { tool_name: tool, input } } })}\n`);
  });
}

/** The Windows local channel the broker serves: its folder and stamp, or why it has no folder. */
export type BrokerChannel = { dir: string; stamp: string } | { dir: null; problem: string };

/**
 * `channel` is set on Windows only, by start.mts brokerChannel.
 * Without it the broker is a unix socket at `socketPath`.
 */
export function createBroker({ connections, storeRoot, socketPath, proxyFile, runtime = process.execPath, channel = null }: {
  connections: Connections;
  storeRoot: string;
  socketPath: string;
  proxyFile: string;
  runtime?: string;
  channel?: BrokerChannel | null;
}) {
  const runs = new Map<string, BrokerRun>();
  const sockets = new Set<net.Socket>();
  let server: net.Server | null = null;

  async function listenOnChannel(open: BrokerChannel): Promise<void> {
    if (open.dir === null) throw new Error(`there is no folder for the app's local channel: ${open.problem}`);
    const pipe = net.createServer(serveSocket);
    const served = await serveLocal(pipe, { kind: CHANNEL_KIND, stamp: open.stamp, dir: open.dir, platform: 'win32', log: (line) => console.warn(`zero: ${line}`) });
    if (served.state === 'serving') { server = pipe; return; }
    if (served.state === 'taken') throw new Error(`another copy of ${Name} on this store already serves its connections`);
    throw new Error(`the connections server already running for this store (${served.name}) did not answer in time, so this one did not start`);
  }

  // Every entry here comes from `_entryOf` or `workingNow`, whose `reads` are always a list.
  async function listTools(entry: CatalogTool): Promise<Tool[]> {
    let tools: Tool[] | null = null;
    try {
      tools = (await connections._withTool(entry, (client) => client.listTools(undefined, { timeout: connections.callMs }), { ms: connections.callMs })).tools;
      await connections._noteTools(entry.id, tools);
    } catch (err) {
      if (stateOfError(err as ToolError) !== STATES.DOWN) await connections._saveStatus(entry.id, { state: stateOfError(err as ToolError) }).catch(() => {});
      tools = (await connections._read()).connections?.[entry.id]?.status?.tools ?? [];
    }
    const listed = tools.filter((t) => entry.reads!.includes(t.name) || entry.writes.includes(t.name));
    return listed.map((t) => (entry.writes.includes(t.name)
      ? { ...t, description: `${t.description ?? ''} Changes something in ${entry.name}: the owner is asked first, and this call waits for their answer.`.trim() }
      : t));
  }

  async function callTool(entry: CatalogTool, name: string, args: Record<string, unknown>, { wrote = false }: { wrote?: boolean } = {}): Promise<CallToolResult> {
    try {
      const result = await connections._withTool(entry, (client) => client.callTool({ name, arguments: args }, undefined, { timeout: connections.callMs }), { ms: connections.callMs }) as CallToolResult;
      if (!wrote && !result.isError) await connections._noteRead(entry.id);
      await connections._noteUse(entry.id, { tool: name, wrote, ok: !result.isError, why: result.isError ? firstWords(result) : null }).catch(() => {});
      return JSON.stringify(result).length > MAX_ANSWER ? denied(`${entry.name} answered with too much to pass on. Ask for less at once.`) : result;
    } catch (err) {
      const state = stateOfError(err as ToolError);
      if (state !== STATES.DOWN || !wrote) await connections._saveStatus(entry.id, { state }).catch(() => {});
      await connections._noteUse(entry.id, { tool: name, wrote, ok: false, why: wrote && state === STATES.DOWN ? 'It did not answer, so this may or may not have gone through.' : stateWords(state).word }).catch(() => {});
      const status = (await connections._read().catch((): VaultData => ({}))).connections?.[entry.id]?.status ?? null;
      return denied(wordsFor(entry, err, { wrote, status, now: connections._now?.() ?? Date.now() }));
    }
  }

  async function answer(req: BrokerRequest, signal: AbortSignal): Promise<{ result: CallToolResult | { tools: Tool[] } }> {
    const run = runs.get(req.run);
    if (!run) return { result: denied('This run has ended, or the app restarted since it began, so it cannot use this connection. A new run can.') };
    const entry = connections._entryOf(req.connection);
    if (!entry || !run.ids.has(req.connection)) return { result: denied(`This run was not given ${entry?.name ?? 'that connection'}.`) };
    // The person is asked again on every call: they may have signed out since the run began.
    if (!connections.workingNow({ includeLapsed: true }).some((e) => e.id === entry.id)) {
      return { result: denied(`${entry.name} is not connected any more, so this was not done. Ask the owner to sign in again on the Connections page in ${Name}.`) };
    }
    if (req.method === 'tools/list') return { result: { tools: await listTools(entry) } };
    if (req.method !== 'tools/call') return { result: denied('That is not something a connection offers.') };
    const name = String(req.params?.name ?? '');
    const args = req.params?.arguments ?? {};
    if (entry.reads!.includes(name)) return { result: await callTool(entry, name, args) };
    if (!entry.writes.includes(name)) {
      await connections._noteUse(entry.id, { tool: name, ok: false, why: 'It is not on the list agents may use, so it was not sent.' }).catch(() => {});
      return { result: denied(`${name} is not on the list of tools agents may use on ${entry.name}, so it was not sent. Tell the owner if you need it.`) };
    }
    const verdict = await askTheCard({ storeRoot, item: run.item, tool: WRITE_CARD_TOOL(entry.name, name), input: args, signal });
    if (verdict.behavior !== 'allow' || signal.aborted) {
      return { result: denied(verdict.message || `The owner said no to this ${entry.name} change, so it was not made.`) };
    }
    // The input she saw, and only once. A lost answer is said, never sent again.
    return { result: await callTool(entry, name, args, { wrote: true }) };
  }

  function serveSocket(sock: net.Socket): void {
    sockets.add(sock);
    sock.setEncoding('utf8');
    let buf = '';
    const live = new Set<AbortController>();
    let inFlight = 0;
    const handle = async (line: string) => {
      let req: BrokerRequest;
      try { req = JSON.parse(line); } catch { return; }
      if (inFlight >= MAX_AT_ONCE) { sock.write(`${JSON.stringify({ id: req.id, result: denied('Too many calls at once. Wait for one to finish.') })}\n`); return; }
      inFlight += 1;
      const ended = new AbortController();
      const run = runs.get(req.run);
      live.add(ended);
      run?.live.add(ended);
      let out;
      try { out = await answer(req, ended.signal); } catch (err) { out = { result: denied(`The app could not do this: ${(err as Error | null)?.message ?? err}`) }; }
      inFlight -= 1;
      live.delete(ended);
      run?.live.delete(ended);
      if (!sock.destroyed) sock.write(`${JSON.stringify({ id: req.id, ...out })}\n`);
    };
    sock.on('data', (d) => {
      buf += d;
      if (buf.length > MAX_LINE) { sock.destroy(); return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        handle(line);
      }
    });
    sock.on('error', () => {});
    // A card waiting on a proxy that has died has nobody to report to.
    sock.on('close', () => { sockets.delete(sock); for (const e of live) e.abort(); });
  }

  return {
    socketPath,
    _answer: answer,
    listen(): Promise<void> {
      if (channel) return listenOnChannel(channel);
      try { fs.rmSync(socketPath, { force: true }); } catch { /* listening will say */ }
      server = net.createServer(serveSocket);
      return new Promise((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(socketPath, () => { fs.chmodSync(socketPath, 0o600); resolve(); });
      });
    },

    /** One run's key and servers. `close` is called when the run has ended. */
    openRun({ runId, item }: { runId: string; item: RunItem }): { servers: ConnectionServers; names: string[]; close: () => void } {
      const usable = connections.workingNow();
      if (!usable.length) return { servers: {}, names: [], close: () => {} };
      if (channel && channel.dir === null) return { servers: {}, names: [], close: () => {} };
      const key = crypto.randomBytes(32).toString('base64url');
      const run: BrokerRun = { runId, item, ids: new Set(usable.map((e) => e.id)), live: new Set() };
      runs.set(key, run);
      const servers: ConnectionServers = {};
      for (const entry of usable) {
        servers[connectionServerName(entry.id)] = {
          command: runtime,
          args: [...stripTypesFlags(), proxyFile],
          env: channel ? {
            ELECTRON_RUN_AS_NODE: '1',
            AGENTBOX_CHANNEL_DIR: channel.dir,
            AGENTBOX_CHANNEL_KIND: CHANNEL_KIND,
            AGENTBOX_CHANNEL_STAMP: channel.stamp,
            AGENTBOX_CONNECTION_RUN: key,
            AGENTBOX_CONNECTION: entry.id,
            AGENTBOX_CONNECTION_NAME: entry.name,
          } : {
            ELECTRON_RUN_AS_NODE: '1',
            AGENTBOX_CONNECTIONS_SOCK: socketPath,
            AGENTBOX_CONNECTION_RUN: key,
            AGENTBOX_CONNECTION: entry.id,
            AGENTBOX_CONNECTION_NAME: entry.name,
          },
        };
      }
      return { servers, names: Object.keys(servers), close: () => { runs.delete(key); for (const e of run.live) e.abort(); } };
    },

    async stop(): Promise<void> {
      for (const r of runs.values()) for (const e of r.live) e.abort();
      runs.clear();
      for (const s of sockets) s.destroy();
      await new Promise<void>((done) => { if (server?.listening) server.close(() => done()); else done(); });
      server = null;
      if (channel) return;
      try { fs.rmSync(socketPath, { force: true }); } catch { /* it went with the server */ }
    },
  };
}
