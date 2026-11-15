// A THREAD'S LINK OPENS IT FROM SLACK OR EMAIL, NOT ONLY INSIDE THE APP (w-d19fcb9309).
//
// Share… copied https://app.agentbox.ac/t/<owner>/<thread>. Clicked inside
// Agentbox it opened the thread; pasted into Slack or an email and clicked, it
// opened the web app, which ignored the path and showed its own inbox. Now the
// web app draws that thread for a teammate who can read its card, says so
// plainly to anyone else, and offers Open in Agentbox, which is
// agentbox://t/<owner>/<thread>; the desktop app opens that thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadAppLink, threadFromAppLink, tokenFromLink, JOIN_SCHEME } from '../shared/room-links.mts';
import { sharedThreadOf, saidLine, whoSaid, readSharedThread } from '../renderer/src/shared-thread/shared-thread.ts';
import { REQUEST_CHANNELS, PUSH_CHANNELS } from '../shared/bridge-map.mts';
import { sharedFileWorker } from '../cloud/web/shared-file-worker.mjs';

const MAYA = 'p-maya';
const THEO = 'p-theo';

describe('the app\'s own link to a thread', () => {
  it('is agentbox://t/<owner>/<thread>, and reads back', () => {
    const link = threadAppLink(MAYA, 'w-1');
    expect(link).toBe(`${JOIN_SCHEME}://t/${MAYA}/w-1`);
    expect(threadFromAppLink(link)).toEqual({ owner: MAYA, id: 'w-1' });
    expect(threadFromAppLink(`${link}/`)).toEqual({ owner: MAYA, id: 'w-1' });
  });
  it('is not a room invite, and a room invite is not a thread', () => {
    expect(tokenFromLink(threadAppLink(MAYA, 'w-1'))).toBeNull();
    expect(threadFromAppLink(`${JOIN_SCHEME}://join/abcdefabcdefabcd`)).toBeNull();
  });
  it('is not made from, or read as, ids that would bend the path', () => {
    expect(threadAppLink('p/x', 'w-1')).toBeNull();
    expect(threadFromAppLink(`${JOIN_SCHEME}://t/${MAYA}/w-1/extra`)).toBeNull();
    expect(threadFromAppLink(`other://t/${MAYA}/w-1`)).toBeNull();
  });
  it('reaches the window the way a room invite does, on the desktop and in the browser copy', () => {
    expect(REQUEST_CHANNELS.takeThreadLink).toBe('zero:take-thread-link');
    expect(PUSH_CHANNELS.onThreadLink).toBe('zero:thread-link');
    const main = fs.readFileSync(new URL('../main/main.mts', import.meta.url), 'utf8');
    expect(main).toContain("ipcMain.handle('zero:take-thread-link'");
    expect(fs.readFileSync(new URL('../main/serve.mts', import.meta.url), 'utf8')).toContain("ipcMain.handle('zero:take-thread-link'");
    expect(fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8')).toContain("takeThreadLink: () => ipcRenderer.invoke('zero:take-thread-link')");
  });
});

describe('the web app\'s page for a thread', () => {
  it('is /t/<owner>/<thread> on the web app, and nothing in the desktop window', () => {
    expect(sharedThreadOf(`/t/${MAYA}/w-1`, true)).toEqual({ owner: MAYA, id: 'w-1' });
    expect(sharedThreadOf(`/t/${MAYA}/w-1`, false)).toBeNull();
    expect(sharedThreadOf('/f/abcdefabcdefabcd', true)).toBeNull();
    expect(sharedThreadOf(`/t/${MAYA}`, true)).toBeNull();
    expect(sharedThreadOf(`/t/${MAYA}/w-1/x`, true)).toBeNull();
  });

  const db = (rows) => ({ async select(table, query) { db.asked.push([table, query]); return rows[table] ?? []; } });
  db.asked = [];

  it('draws the thread for someone the cloud lets read it, owner\'s words, agent\'s and comments, each under its name', async () => {
    const work = { lines: [
      { ts: 1, source: 'founder', by: MAYA, patch: { body: 'Write the release notes' } },
      { ts: 2, source: 'agent', patch: { result: 'Drafted them.' } },
      { ts: 3, source: 'system', by: THEO, uid: 'comment-1', patch: { comment: { text: 'Tone is good' } } },
      { ts: 4, source: 'agent', patch: {} },
    ] };
    const shown = await readSharedThread(db({ thread_work: [{ work }], thread_cards: [{ title: 'Release notes' }], people: [{ id: MAYA, name: 'Maya Chen' }, { id: THEO, name: 'Theo Park' }] }), MAYA, 'w-1');
    expect(shown.state).toBe('shown');
    expect(shown.title).toBe('Release notes');
    expect(shown.lines.map((l) => [whoSaid(l, MAYA, shown.names), l.text])).toEqual([
      ['Maya', 'Write the release notes'], ["Maya's agent", 'Drafted them.'], ['Theo', 'Tone is good'],
    ]);
  });

  it('says it is not shared with you when the cloud returns nothing, and never asks with a bent id', async () => {
    expect(await readSharedThread(db({}), MAYA, 'w-1')).toEqual({ state: 'hidden' });
    db.asked = [];
    expect(await readSharedThread(db({}), MAYA, 'w-1,thread_id.neq.x')).toEqual({ state: 'hidden' });
    expect(db.asked).toEqual([]);
  });

  it('leaves out a line that says nothing', () => {
    expect(saidLine({ ts: 1, source: 'agent', patch: { status: 'done' } }, 0)).toBeNull();
  });

  it('is routed before the inbox boots, and only on the web app', () => {
    const main = fs.readFileSync(new URL('../renderer/src/main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/sharedThreadOf\(location\.pathname, !!readCloudConfig\(document\)\)/);
    expect(main).toMatch(/else if \(sharedThread && cloud\) bootSharedThread\(sharedThread, cloud\)/);
  });
});

describe('the site\'s edge for a thread\'s link', () => {
  const SHELL = '<!doctype html><html><head><title>Agentbox</title><script type="module" src="./assets/main.js"></script><link rel="stylesheet" href="./assets/main.css"></head><body></body></html>';
  const asked = [];
  const worker = sharedFileWorker({ cloud: 'https://db.example', anonKey: 'anon', headers: { 'X-Frame-Options': 'SAMEORIGIN' } }, { fetchImpl: async (u) => { asked.push(u); return new Response('[]'); } });
  const ASSETS = { fetch: async (u) => new Response(new URL(u instanceof Request ? u.url : String(u)).pathname === '/' ? SHELL : 'asset') };
  it('answers /t/<owner>/<thread> with the app page, its files loaded from the root, and asks the cloud nothing', async () => {
    const res = await worker.fetch(new Request(`https://app.example/t/${MAYA}/w-1`), { ASSETS });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('src="/assets/main.js"');
    expect(html).toContain('href="/assets/main.css"');
    expect(html).not.toContain('"./assets');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(asked).toEqual([]);
  });
});
