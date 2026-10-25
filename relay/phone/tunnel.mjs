// THE PHONE'S END OF THE RELAY. The phone's service worker (relay/phone/sw.mjs)
// answers every request the inbox makes, the page itself included, by sealing
// it, sending it to the relay, and opening the Mac's sealed answer frame by
// frame back into an ordinary Response. So the inbox runs unchanged: it asks
// /api/…, /events and /f/… as it does on the Wi-Fi, and never knows a relay
// is there.
import { seal, open, packRequest, pieces, FRAME, frameAad, b64u } from '../../shared/relay-crypto.mjs';

/** What a phone's request may carry; the Mac passes on the same few. */
const PASS = ['accept', 'content-type', 'range', 'user-agent', 'if-none-match', 'x-agentbox-token', 'x-agentbox-device'];

/**
 * Hands the worker the key this page was opened with. The worker answers
 * "key-taken" only when it differs from the one it kept, so a computer that is
 * really away is not reloaded in a loop.
 */
export const TAKE_KEY = `(function(){var m=/(?:^#|&)k=([A-Za-z0-9_-]{24,})/.exec(location.hash),s=navigator.serviceWorker,c=s&&s.controller;if(!m||!c)return;s.addEventListener('message',function(e){if(e.data==='key-taken')location.reload()});c.postMessage({key:m[1]})})()`;

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#1e1b1a"><meta http-equiv="refresh" content="8"><title>${title}</title>
<style>html,body{margin:0;height:100%;background:#1e1b1a;color:#e8e4dc;font:16px/1.45 -apple-system,system-ui,sans-serif}main{min-height:100%;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:32px 28px;box-sizing:border-box}h1{margin:0;font-size:21px;font-weight:500}p{margin:0;color:#a39e94}button{align-self:flex-start;margin-top:8px;height:40px;padding:0 18px;font:inherit;color:#e8e4dc;background:#34312e;border:1px solid #4a4642}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><button onclick="location.reload()">Try again</button></main><script>${TAKE_KEY}</script></body></html>`;

/**
 * How long opening the app keeps trying before it says the computer is away
 * (tests/a-phone-opened-from-an-alert-waits-for-its-computer). An alert is
 * tapped after a quiet spell, which is when a link is likeliest to be coming
 * back, and the computer reconnects within seconds.
 */
export const PATIENCE_MS = 20_000;
const GAP_MS = 1_500;
/** "Not there yet" or "could not answer", from the relay, the tunnel or the computer's end of it. */
const AWAY = new Set([502, 503, 504]);

/**
 * `once` asked again while it answers "not there yet", for up to PATIENCE_MS.
 * Only for opening a page: anything that changes something is sent once.
 */
export async function withPatience(once, { now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const start = now();
  for (;;) {
    const res = await once();
    if (!AWAY.has(res.status) || now() - start + GAP_MS > PATIENCE_MS) return res;
    await sleep(GAP_MS);
  }
}

/** Said in words, as a page for the page and as json for everything else. */
function away(request, status, said) {
  const wantsPage = request.mode === 'navigate' || (request.headers.get('accept') ?? '').includes('text/html');
  if (wantsPage) {
    return new Response(page('Your computer is not connected', said), { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return new Response(JSON.stringify({ error: said }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

/**
 * One request, through the relay, to the Mac and back.
 * `ctx` is { room, keys } from relayIds/relayKeys; `fetchImpl` reaches the relay.
 */
/**
 * May this request be waited on past the room's 30 s? Only a reply: an agent
 * takes it at its next break, which can be minutes. Every other request that
 * long unanswered is given up, or a busy computer piles them up until the room
 * turns the phone away (tests/a-phone-never-piles-up-requests-on-its-computer).
 */
export const waitsForAgent = (method, pathname) => String(method).toUpperCase() === 'POST' && pathname === '/api/zero:answer';

export async function tunnelFetch(request, ctx, fetchImpl = (...a) => fetch(...a), { wait = waitsForAgent(request.method, new URL(request.url).pathname) } = {}) {
  const url = new URL(request.url);
  const headers = {};
  for (const name of PASS) {
    const v = request.headers.get(name);
    if (v) headers[name] = v;
  }
  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? new Uint8Array(0) : new Uint8Array(await request.arrayBuffer());
  const nonce = b64u(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const head = { v: 1, ts: Date.now(), nonce, method, path: url.pathname + url.search, headers, ...(wait ? { wait: 1 } : {}) };
  const sealed = await seal(ctx.keys.up, packRequest(head, body), 'req');

  let res;
  try {
    res = await fetchImpl(`/t/${ctx.room}`, { method: 'POST', body: sealed, signal: request.signal, headers: { 'content-type': 'application/octet-stream' } });
  } catch {
    return away(request, 503, 'Your phone could not reach the relay. Check that it is online.');
  }
  if (!res.ok || !res.body) {
    const said = await res.json().then((j) => j?.error).catch(() => null);
    return away(request, res.status || 503, said ?? 'Your computer did not answer.');
  }

  // The reader is kept, so a phone that stops listening (a closed thread's
  // event stream) cancels it even while a read is waiting, and the relay tells
  // the Mac to stop.
  const reader = res.body.getReader();
  const frames = pieces(reader);
  let seq = 0;
  const next = async () => {
    const { value, done } = await frames.next();
    if (done) throw new Error('The answer was cut short.');
    const plain = await open(ctx.keys.down, value, frameAad(nonce, seq++));
    return { type: plain[0], data: plain.subarray(1) };
  };

  // "Still working" frames come first while the Mac waits on an agent; they
  // say nothing else.
  let first;
  try {
    do first = await next(); while (first.type === FRAME.WAIT);
  } catch {
    return away(request, 502, 'The answer from your computer could not be read.');
  }
  if (first.type !== FRAME.HEAD) return away(request, 502, 'The answer from your computer could not be read.');
  const { status, headers: out } = JSON.parse(new TextDecoder().decode(first.data));

  const bodyStream = new ReadableStream({
    async pull(controller) {
      try {
        const { type, data } = await next();
        if (type === FRAME.DATA) controller.enqueue(data.slice());
        else if (type === FRAME.END) controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  const nullBody = status === 204 || status === 304 || method === 'HEAD';
  return new Response(nullBody ? null : bodyStream, { status, headers: out });
}
