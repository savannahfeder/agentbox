// ONE SHORT MCP CONVERSATION WITH A TOOL, AND ITS ERRORS SORTED INTO WHAT THEY
// MEAN TO A PERSON. Fresh each time: nothing to go stale, no stream left open.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { STATES } from '../../shared/connections-catalog.mjs';
import { Name } from '../../shared/product-name.mjs';

export class ToolAnswered extends Error {
  constructor(status) { super(`the tool answered ${status}`); this.status = status; }
}

// An answer that says this address is not an MCP server, or not one we know.
// Waiting does not change it, so it is not "down".
const NOT_HERE = new Set([404, 405, 406, 410, 415]);
const METHOD_NOT_FOUND = -32601;

/** Which state an error means. Anything not plainly about the account or the address is "down". */
export function stateOfError(err) {
  if (err?.status === 401) return STATES.NOT_SIGNED_IN;
  if (err?.status === 403) return STATES.NOT_ALLOWED;
  if (err?.unreachable || NOT_HERE.has(err?.code) || err?.code === -1 || err?.code === METHOD_NOT_FOUND
    || err?.name === 'SyntaxError' || err?.name === 'ZodError') return STATES.UNREACHABLE;
  return STATES.DOWN;
}

const NO_RECONNECTS = { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 };

/**
 * Opens, runs `use(client)`, closes, all inside `ms`. A 401, 403 or 5xx ends it
 * at once, thrown as `ToolAnswered`. `err.shaken` says whether it had got past
 * the handshake: a write may only be tried again if it had not.
 */
export async function talk({ address, token, ms, use }) {
  const ended = new AbortController();
  const timer = setTimeout(() => ended.abort(new Error('the tool did not answer in time')), ms);
  const client = new Client({ name: Name, version: '1.0.0' });
  let shaken = false;
  const fetchWithToken = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers, signal: init.signal ? AbortSignal.any([init.signal, ended.signal]) : ended.signal });
    if (res.status === 401 || res.status === 403 || res.status >= 500) throw new ToolAnswered(res.status);
    return res;
  };
  const transport = new StreamableHTTPClientTransport(new URL(address), { fetch: fetchWithToken, reconnectionOptions: NO_RECONNECTS });
  const hard = new Promise((_, reject) => { ended.signal.addEventListener('abort', () => reject(ended.signal.reason), { once: true }); });
  const conversation = (async () => {
    await client.connect(transport, { timeout: ms });
    shaken = true;
    return use(client);
  })();
  try {
    return await Promise.race([hard, conversation]);
  } catch (err) {
    err.shaken = shaken;
    throw err;
  } finally {
    clearTimeout(timer);
    conversation.catch(() => {});
    client.close().catch(() => {});
  }
}

const LINE_MAX = 120;
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, LINE_MAX);

function firstList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') for (const v of Object.values(value)) { if (Array.isArray(v)) return v; }
  return null;
}

const nameIn = (row) => row.title ?? row.name ?? row.display_name ?? row.login ?? row.properties?.dealname;

const describe = (row) => {
  if (row && typeof row === 'object') {
    // "Who is this sign-in" answers often wrap the person one level down.
    const inner = Object.values(row).find((v) => v && typeof v === 'object' && !Array.isArray(v) && nameIn(v));
    if (!nameIn(row) && !row.identifier && inner) return oneLine(nameIn(inner));
    const named = nameIn(row);
    const id = row.identifier ?? row.id;
    // A database's long id means nothing beside a title; "LUM-41" does.
    const label = [named && String(id ?? '').length > 16 ? null : id, named].filter(Boolean).join(' ');
    return oneLine(label || JSON.stringify(row));
  }
  return oneLine(row);
};

/** How many things a read tool's answer lists, or null when it is not a list. */
export function countRead(result) {
  const text = (result?.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n').trim();
  try { return firstList(JSON.parse(text))?.length ?? null; } catch { return null; }
}

/** A read tool's answer as one line, or null when it read nothing at all. */
export function oneLineRead(result) {
  const text = (result?.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n').trim();
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return oneLine(text.split('\n')[0]) || null; }
  const list = firstList(parsed);
  if (list) return list.length ? describe(list[0]) : null;
  if (parsed == null || (typeof parsed === 'object' && !Object.keys(parsed).length)) return null;
  return describe(parsed);
}
