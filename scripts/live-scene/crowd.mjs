#!/usr/bin/env node
// A CROWD IN THE SCENE'S DOC OR TABLE, typing the way a team does: most people
// start a paragraph of their own and type a word at a time, a few add a
// sentence where one ends, and agents land whole sentences now and then, the
// way an agent's version arrives. Everyone moves a cursor.
//
//   node scripts/live-scene/crowd.mjs --team <id> --file launch-plan.md --people 100 --agents 20 --seconds 120
//
// `--deaf` lets a few hundred type from one machine without taking in each
// other's edits; `--typists` is the share of people typing rather than reading.
import WebSocket from 'ws';
import * as Y from 'yjs';
import { connectLive } from '../../renderer/src/live/client.ts';
import { liveRoomId } from '../../main/team/live-room.mts';
import { liveColorOf } from '../../shared/live/colors.mts';
import { gridOf, isSeeded, putGrid } from '../../renderer/src/live/table-doc.ts';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const TEAM = arg('team');
const FILE = arg('file', 'launch-plan.md');
const PEOPLE = Number(arg('people', 40));
const AGENTS = Number(arg('agents', 10));
const SECONDS = Number(arg('seconds', 120));
const TYPISTS = Number(arg('typists', 0.2));
const DEAF = process.argv.includes('--deaf');
const url = `ws://127.0.0.1:${arg('port', 54900)}/room/${encodeURIComponent(liveRoomId(TEAM, 'Launch', FILE))}`;
const isTable = /\.(csv|tsv)$/i.test(FILE);

const FIRST = ['Ana', 'Ben', 'Leo', 'Priya', 'Sam', 'Noor', 'Kai', 'Iris', 'Omar', 'Zoe', 'Theo', 'Mina', 'Ravi', 'Lena', 'Jun', 'Ines', 'Tom', 'Aya', 'Eli', 'Sofia', 'Hugo', 'Nia', 'Owen', 'Mei', 'Luca', 'Hana', 'Dev', 'Rosa', 'Finn', 'Yara'];
const LAST = ['Park', 'Okafor', 'Silva', 'Rao', 'Klein', 'Haddad', 'Moreau', 'Tanaka', 'Novak', 'Reyes'];
const AGENT_NAMES = ['Research agent', 'Copy agent', 'Pricing agent', 'Film agent', 'Outreach agent', 'Notes agent', 'Data agent', 'Review agent'];
const PHRASES = [
  'the film shows the whole team in one doc', 'with a link to the shared plan', 'every reply gets an answer the same day',
  'two customers read the page first', 'we keep the price on the page', 'the waiting list hears about it first',
  'the phone app follows a week later', 'the film stays under a minute', 'nobody has to ask where the doc is',
  'we write down every question we could not answer', 'each agent drafts while a person sends', 'it is the real app, not a mockup',
];
const sentence = (k) => { const p = PHRASES[k % PHRASES.length]; return `${p[0].toUpperCase()}${p.slice(1)}.`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function socket() {
  const ws = new WebSocket(url);
  if (!DEAF) return ws;
  const out = { binaryType: 'arraybuffer' };
  Object.defineProperty(out, 'readyState', { get: () => ws.readyState });
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => out.onopen?.();
  ws.onclose = (e) => out.onclose?.(e);
  ws.onerror = (e) => out.onerror?.(e);
  ws.onmessage = (e) => { const t = new Uint8Array(e.data)[0]; if (t !== 3 && t !== 4) out.onmessage?.(e); };
  out.send = (b) => ws.send(b);
  out.close = () => ws.close();
  return out;
}

// Every paragraph's words, list items included, never a heading.
function texts(frag) {
  const out = [];
  const walk = (node) => {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText) { if (node.nodeName === 'paragraph') out.push(child); continue; }
      if (child instanceof Y.XmlElement && child.nodeName !== 'heading') walk(child);
    }
  };
  walk(frag);
  return out;
}

function stepDoc(w) {
  const frag = w.doc.getXmlFragment('default');
  const list = texts(frag);
  if (!list.length) return;
  if (!w.target || !list.includes(w.target) || !w.words?.length) {
    // Under one of the plan's own paragraphs, so new ones spread through the doc.
    const top = frag.toArray().map((n, i) => [n, i]).filter(([n]) => n instanceof Y.XmlElement && n.nodeName === 'paragraph' && n.toString().length > 60);
    w.words = sentence(w.i * 7 + w.n).split(' ');
    // A typist starts a paragraph of their own, with its first word in it: an empty one is a gap on everyone's page.
    if ((w.agent || w.typist) && top.length) {
      const para = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      w.doc.transact(() => {
        para.insert(0, [text]);
        frag.insert(top[Math.floor(Math.random() * top.length)][1] + 1, [para]);
        text.insert(0, w.words.shift());
      });
      w.target = text;
    } else {
      // Not the first paragraph: that one is the person filming's.
      const others = list.length > 1 ? list.slice(1) : list;
      w.target = others[Math.floor(Math.random() * others.length)];
    }
    w.pos = w.target.length;
    w.rel = null;
  }
  const t = w.target;
  if (w.rel) { const abs = Y.createAbsolutePositionFromRelativePosition(w.rel, w.doc); if (abs && abs.type === t) w.pos = abs.index; }
  w.pos = Math.min(w.pos, t.length);
  if (w.agent || w.typist) {
    // An agent's words land whole, as its version does; a person types a word at a time.
    const words = w.words.splice(0, w.agent ? w.words.length : 1);
    const bit = t.length ? ` ${words.join(' ')}` : words.join(' ');
    t.insert(w.pos, bit);
    w.pos += bit.length;
  }
  w.n += 1;
  w.rel = Y.createRelativePositionFromTypeIndex(t, w.pos);
  const at = Y.relativePositionToJSON(w.rel);
  w.live.awareness.setLocalStateField('cursor', { anchor: at, head: at });
}

function stepTable(w) {
  if (!isSeeded(w.doc)) return;
  const before = gridOf(w.doc);
  const free = before.grid.map((_, i) => i).filter((i) => i > 0 && !/^(Maya)$/.test(before.grid[i][3] ?? ''));
  if (!w.r || !free.includes(w.r) || Math.random() < 0.1) { w.r = free[Math.floor(Math.random() * free.length)]; w.c = Math.floor(Math.random() * before.grid[0].length); }
  if ((w.agent || w.typist) && Math.random() < 0.5) {
    const next = before.grid.map((r) => [...r]);
    if (w.c === 4) next[w.r][4] = ['New', 'Contacted', 'Replied', 'Meeting', 'Trial'][(w.n + w.i) % 5];
    if (w.c === 5) next[w.r][5] = ['Book a call', 'Send the film', 'Share the doc', 'Follow up Friday'][(w.n + w.i) % 4];
    putGrid(w.doc, before, next);
  }
  w.n += 1;
  w.live.awareness.setLocalStateField('at', { cell: `${before.rowIds[w.r - 1]}|${before.colIds[w.c]}` });
}

const crowd = [];
for (let i = 0; i < PEOPLE + AGENTS; i++) {
  const agent = i >= PEOPLE;
  const n = i - PEOPLE;
  const name = agent ? `${AGENT_NAMES[n % AGENT_NAMES.length]}${n >= AGENT_NAMES.length ? ` ${Math.floor(n / AGENT_NAMES.length) + 1}` : ''}` : `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
  const person = `crowd-${i}`;
  const color = liveColorOf(person);
  const doc = new Y.Doc();
  const live = connectLive({ doc, hello: { name, kind: agent ? 'agent' : 'person', person, color, canSave: false, canSeed: false }, open: socket });
  live.awareness.setLocalStateField('user', { name, color, kind: agent ? 'agent' : 'person', person });
  crowd.push({ i, agent, doc, live, n: 0, typist: !agent && Math.random() < TYPISTS });
  if (i % 20 === 19) await sleep(100);
}
console.log(`joined ${crowd.length}`);
const until = Date.now() + SECONDS * 1000;
for (const w of crowd) {
  const every = w.agent ? 8000 + Math.random() * 7000 : 2000 + Math.random() * 2500;
  const tick = () => {
    if (Date.now() > until) return;
    try { (isTable ? stepTable : stepDoc)(w); } catch (err) { console.error(err.message); }
    setTimeout(tick, every);
  };
  setTimeout(tick, Math.random() * every);
}
await sleep(SECONDS * 1000 + 500);
for (const w of crowd) w.live.close();
process.exit(0);
