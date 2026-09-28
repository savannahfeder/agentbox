// HER MESSAGES OPEN CHAPTERS, photographed in the BUILT renderer (w-250047ba5f).
//
//   arch -arm64 node scripts/draw-her-messages-stand-out.mjs <outDir> <dist>
//
// <dist> is the renderer built from the branch astral/w-250047ba5f. Nothing is
// injected: the rule and the type are the app's own. Boots it headless on a
// made-up product ("North Sound") whose one task is a conversation built to test
// the one rule she set: a divider above each turn of hers, never above the
// agent's, however many messages it sends in a row. It carries her opening ask
// at the very top, two agent messages back to back with work lines between them,
// two of her replies back to back, and a second run.
//
// Round one drew five looks by injecting CSS; she picked chapters on 09-26 and
// the other four are in the product's decisions.md, verbatim.
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';

const outDir = process.argv[2] ?? '/tmp/w-250047ba5f-chapters';
const dist = process.argv[3];
if (!dist) throw new Error('pass the dist built from the branch');
fs.mkdirSync(outDir, { recursive: true });

const ID = 'w-0c4e5a91b2';
const T0 = Date.UTC(2026, 8, 25, 15, 2);
const min = (n) => T0 + n * 60_000;
// A trace line is stamped with the UTC clock, as the supervisor writes it (notes.ts `momentOf`).
const stamp = (ts) => new Date(ts).toISOString().slice(11, 19);
const trace = (startedAt, rows) => ({ startedAt, text: rows.map(([m, s]) => `${stamp(startedAt + m * 60_000)}  ${s}`).join('\n') + '\n' });

const lines = [
  { id: ID, ts: min(0), source: 'founder', patch: {
    title: 'The welcome email reads like a receipt',
    body: 'The welcome email reads like a receipt. Can you rewrite it so it sounds like a person, and keep it under 120 words?',
    kind: 'directive', status: 'open', labels: [], priority: 5 } },
  { id: ID, ts: min(1), source: 'agent', claim: { holder: 'mcp-1', leaseUntil: min(40) } },
  { id: ID, ts: min(5), source: 'agent', patch: { note: [
    'I read the current email and the three that go out after it. The receipt feel comes from two places. It opens with the order number, and every sentence starts with "Your".',
  ].join('\n') } },
  { id: ID, ts: min(8), source: 'agent', patch: { note: [
    'I wrote two drafts. The first keeps the order details but moves them to the bottom. The second drops them and links to the account page instead.',
    '',
    'I also checked the subject line against the last forty sends. The ones that name a person open eleven points higher, so I would send it from Ines by name.',
  ].join('\n') } },
  { id: ID, ts: min(10), source: 'founder', patch: { answer: 'Drop the order details. And yes, send it from Ines.' } },
  { id: ID, ts: min(10) + 40_000, source: 'founder', patch: { answer: 'Oh, and keep the tide chart link near the top.' } },
  { id: ID, ts: min(11), source: 'agent', claim: { holder: 'mcp-2', leaseUntil: min(60) } },
  { id: ID, ts: min(17), source: 'agent', patch: { note: [
    'Done on the draft. The order details are gone, the tide chart link is the second line, and the sender is now Ines. Replies go to her inbox, not the no-reply one.',
  ].join('\n') } },
  { id: ID, ts: min(19), source: 'agent', patch: { note: [
    'One thing came up while I was in there. The second email in the series still says "as we mentioned in your receipt", which will read oddly now. I rewrote that sentence so it stands on its own.',
  ].join('\n') } },
  { id: ID, ts: min(23), source: 'founder', patch: { answer: 'Love it. The charter line feels salesy, make it calmer.' } },
  { id: ID, ts: min(24), source: 'agent', claim: { holder: 'mcp-3', leaseUntil: min(70) } },
  { id: ID, ts: min(30), source: 'agent', patch: { result: [
    'The charter line is calmer now: "You were looking at charters, so here is when the boats go out and who to ask." The email is 104 words at its longest.',
    '',
    'I sent a test to your inbox so you can read it where your customers will. Nothing goes to a real customer until you say so.',
  ].join('\n') } },
];

const sessions = [
  trace(min(1), [
    [0.2, '[Read] emails/welcome.html'],
    [0.5, '[Read] emails/day-two.html'],
    [0.8, '[Grep] "Your order" in emails/'],
    [5.6, '[Write] drafts/welcome-a.html'],
    [5.9, '[Write] drafts/welcome-b.html'],
    [6.4, '[Bash] node scripts/open-rates.mjs --last 40'],
  ]),
  trace(min(11), [
    [0.3, '[Edit] drafts/welcome-b.html'],
    [0.9, '[Edit] emails/welcome.html'],
    [6.5, '[Edit] emails/day-two.html'],
  ]),
  trace(min(24), [
    [0.4, '[Edit] emails/welcome.html'],
    [3.2, '[Bash] node scripts/send-test.mjs --to founder'],
  ]),
];

const folded = [...foldWorkItems(lines).values()].map((it) => ({ ...it, status: 'done', claim: null, product: 'north-sound', productName: 'North Sound' }));
const snapshot = {
  products: [{ slug: 'north-sound', name: 'North Sound' }],
  items: folded,
  approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
    productOrder: ['north-sound'], hiddenProducts: [], personalProducts: [], capacity: 0 },
  restartNeeded: null,
  config: {},
};

const LOOKS = [
  { name: 'valley', theme: 'dark', skin: 'valley-haze' },
  { name: 'frost', theme: 'light', skin: 'frost-haze' },
  { name: 'dark', theme: 'dark', skin: 'none' },
];

const W = 1440, H = 900;
const h = await openInbox({ dist, width: W, height: H, snapshot });
await h.call('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.zero = Object.assign(window.zero || {}, {
    itemHistory: async () => ({ ok: true, lines: ${JSON.stringify(lines)} }),
    sessionTrace: async () => ({ ok: true, sessions: ${JSON.stringify(sessions)} }),
    codeChange: async () => ({ ok: false }),
    // Nothing is compacting. Without this the harness's missing bridge reads as
    // a failed compaction and draws one under the thread.
    compactionStatus: async () => null,
  });
  localStorage.setItem('zero.firstRun.done', '1');
` });

async function openRow() {
  await h.goto(h.origin);
  await h.wait(1200);
  const opened = await h.evaluate(`(() => {
    const hit = [...document.querySelectorAll('.row')].find((r) => (r.textContent || '').includes('welcome email'));
    if (!hit) return 'NOT FOUND'; hit.click(); return 'opened'; })()`);
  await h.wait(1500);
  return opened;
}

// What every message on the screen actually is, read off the DOM: who said it,
// whether it wears the rule, and the computed border and type.
const readMessages = () => h.evaluate(`[...document.querySelectorAll('.thread .msg')].map((m) => {
  const cs = getComputedStyle(m); const body = getComputedStyle(m.querySelector('.msg-body'));
  return (m.classList.contains('yours') ? 'HER  ' : 'AGENT') + ' above=' + cs.borderTopWidth + ' below=' + cs.borderBottomWidth
    + ' type=' + body.fontSize + '/' + body.fontWeight + '  ' + (m.querySelector('.msg-body').innerText || '').slice(0, 48).replace(/\\n/g, ' ');
}).join('\\n')`);

const report = [];
for (const look of LOOKS) {
  await h.wear({ theme: look.theme, skin: look.skin });
  report.push(`== ${look.name}: ${await openRow()}`);
  report.push(await readMessages());
  report.push(`work lines: ${await h.evaluate(`document.querySelectorAll('.thread .did, .thread .did-run').length`)}`);

  // The whole conversation in one picture: the window made as tall as the thread.
  const tall = await h.evaluate(`(() => { const box = document.querySelector('.focus-scroll'); return box.scrollHeight - box.clientHeight; })()`);
  await h.call('Emulation.setDeviceMetricsOverride', { width: W, height: H + tall + 40, deviceScaleFactor: 2, mobile: false });
  await h.wait(900);
  await h.evaluate(`document.querySelector('.focus-scroll').scrollTop = 0`);
  await h.wait(300);
  const { data } = await h.call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H + tall + 40, scale: 1 } });
  fs.writeFileSync(path.join(outDir, `${look.name}-whole.png`), Buffer.from(data, 'base64'));
  await h.call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  await h.wait(600);

  // And the window she actually reads in, scrolled back to the middle.
  const at = await h.evaluate(`(() => {
    const box = document.querySelector('.focus-scroll');
    box.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    const target = document.querySelectorAll('.thread .msg.turn')[0];
    const r = box.getBoundingClientRect();
    box.scrollTop += target.getBoundingClientRect().top - r.top - r.height * 0.3;
    return 'scrollTop ' + Math.round(box.scrollTop) + ' of ' + box.scrollHeight;
  })()`);
  await h.wait(400);
  await h.capture(path.join(outDir, `${look.name}-scrolled.png`));
  report.push(`scrolled: ${at} ${await h.evaluate('window.__ERR__ || ""')}`);
}
console.log(report.join('\n'));
h.close();
