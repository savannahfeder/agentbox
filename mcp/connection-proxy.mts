// THE WORKER'S END OF A CONNECTION. It holds no token and decides nothing: it
// passes bounded MCP requests to the app over the run's channel and hands back
// the answer. A worker can read everything this process is given, so it is given
// nothing worth reading (main/connections/broker.mts is the other end).
//
// Node's own modules only, so it starts on the app's own binary with no install.
// On Windows it also loads main/local-channel.mts, which needs Node's own modules
// and shared/product-name.mjs and nothing else.
import net from 'node:net';
import readline from 'node:readline';

const MAX_REQUEST = 512 * 1024;
const OFFLINE_TOOL = 'connection_status';

const {
  AGENTBOX_CONNECTIONS_SOCK: SOCK,
  AGENTBOX_CHANNEL_DIR: CHANNEL_DIR,
  AGENTBOX_CHANNEL_KIND: CHANNEL_KIND,
  AGENTBOX_CHANNEL_STAMP: CHANNEL_STAMP = '',
  AGENTBOX_CONNECTION_RUN: RUN,
  AGENTBOX_CONNECTION: CONNECTION,
  AGENTBOX_CONNECTION_NAME: NAME = 'This tool',
} = process.env;

const OFFLINE = `The owner's app is offline, so ${NAME} cannot be reached and nothing was done. It works again when their Agentbox is open.`;
interface ToolResult { isError?: boolean; content: { type: 'text'; text: string }[] }
interface McpTool { name: string; description?: string; inputSchema: Record<string, unknown> }
interface AppAnswer { id: number; result?: { tools?: McpTool[] } & Partial<ToolResult> }
interface RpcRequest { id?: string | number; method?: string; params?: { protocolVersion?: string; name?: string; [key: string]: unknown } }

const failed = (text: string): ToolResult => ({ isError: true, content: [{ type: 'text', text }] });
const send = (msg: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(msg)}\n`);

let sock: net.Socket | null = null;
let buf = '';
let nextId = 0;
const waiting = new Map<number, (answer: AppAnswer | null) => void>();

function gone() {
  sock = null;
  buf = '';
  for (const resolve of waiting.values()) resolve(null);
  waiting.clear();
}

// Calls made while the channel is still connecting wait for that one connection,
// since every connection's answers feed the one buffer.
let connecting: Promise<net.Socket | null> | null = null;

const channel = (): Promise<net.Socket | null> => {
  if (!sock && CHANNEL_DIR) return (connecting ??= overTheLocalChannel(CHANNEL_DIR).finally(() => { connecting = null; }));
  return new Promise<net.Socket | null>((resolve) => {
    if (sock) { resolve(sock); return; }
    if (!SOCK) { resolve(null); return; }
    const s = net.createConnection(SOCK);
    s.once('connect', () => { sock = s; resolve(s); });
    readAnswers(s, resolve);
  });
};

// The app's server proves itself before this writes a byte. A refusal is said on
// stderr and answered as offline.
function overTheLocalChannel(dir: string): Promise<net.Socket | null> {
  return import('../main/local-channel.mts')
    .then(({ connectLocal }) => connectLocal({ kind: CHANNEL_KIND, stamp: CHANNEL_STAMP, dir }))
    .then((s) => { readAnswers(s); sock = s; return s; }, (err: unknown) => {
      process.stderr.write(`${NAME} could not reach the app: ${(err as Error | null)?.message ?? err}\n`);
      return null;
    });
}

function readAnswers(s: net.Socket, resolve: (s: net.Socket | null) => void = () => {}): void {
  s.setEncoding('utf8');
  s.on('error', () => { resolve(null); });
  s.on('close', () => { if (sock === s) gone(); resolve(null); });
  s.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let m: AppAnswer;
      try { m = JSON.parse(line); } catch { continue; }
      waiting.get(m.id)?.(m);
      waiting.delete(m.id);
    }
  });
}

/** The app's answer, or null when the app cannot be reached. */
async function ask(method: string, params: unknown): Promise<AppAnswer | null> {
  const s = await channel();
  if (!s) return null;
  const id = nextId += 1;
  return new Promise<AppAnswer | null>((resolve) => {
    waiting.set(id, resolve);
    s.write(`${JSON.stringify({ id, run: RUN, connection: CONNECTION, method, params })}\n`);
  });
}

let lastTools: McpTool[] | null = null;
async function toolsList() {
  const got = await ask('tools/list', {});
  if (got?.result?.tools) { lastTools = got.result.tools; return { tools: lastTools }; }
  if (lastTools) return { tools: lastTools };
  // Something for the agent to call, or it could only guess why the tool is missing.
  return { tools: [{ name: OFFLINE_TOOL, description: `Says why ${NAME} cannot be reached right now.`, inputSchema: { type: 'object', properties: {} } }] };
}

async function toolsCall(params: RpcRequest['params']) {
  if (params?.name === OFFLINE_TOOL) {
    const got = await ask('tools/list', {});
    return { content: [{ type: 'text', text: got ? `${NAME} is reachable again.` : OFFLINE }], ...(got ? {} : { isError: true }) };
  }
  if (JSON.stringify(params ?? {}).length > MAX_REQUEST) return failed(`That request is too large to send to ${NAME}. Nothing was done. Ask for less at once.`);
  const got = await ask('tools/call', params);
  if (!got) return failed(OFFLINE);
  return got.result ?? failed(`${NAME} gave no answer.`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let msg: RpcRequest;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined) return;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: `${NAME} through Agentbox`, version: '1.0.0' } } });
  } else if (method === 'ping') send({ jsonrpc: '2.0', id, result: {} });
  else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: await toolsList() });
  else if (method === 'tools/call') send({ jsonrpc: '2.0', id, result: await toolsCall(params) });
  else send({ jsonrpc: '2.0', id, error: { code: -32601, message: `${method} is not offered` } });
});
rl.on('close', () => process.exit(0));
