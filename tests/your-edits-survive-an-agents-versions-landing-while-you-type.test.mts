// YOUR EDITS SURVIVE AN AGENT'S VERSIONS LANDING WHILE YOU TYPE (w-fff0a9c3a6).
//
// Reported: a person typed into a script while its agent kept writing new
// versions. The big view then read "v30 of 28" over words that were v27's:
// the edits they had saved as v28 and v29 were not on screen, and the agent's
// changes were not either.
//
// Measured on the real view below, with the real save code under it:
// - With no live room, a version landing under the open editor never reached it.
//   The person read and typed on the words they opened, under the newer
//   version's name.
// - In a live room, the copy that merged the new version in then saved the words
//   the sitting opened on. Typing nothing after the merge was read as typing back
//   to them, so the next version took out what the person had saved earlier.
// - Words kept from a sitting on an older version opened as they were, over the
//   newest one.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveNextVersion } from '../main/file-version.mts';
import { startLiveRelay } from '../cloud/live/server.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = !!chromium && fs.existsSync(chromium.executablePath());

const V1 = [
  '# Script', '',
  'I stay on top of every teammate.', '',
  'The moment someone needs me, it pops up on my screen.', '',
  'Keeping a team in the loop takes a standup.', '',
  'Comment if you want in.', '',
].join('\n');
const MINE = 'Always on top.';
const AGENTS = 'Here, the agents share what they did with the team.';

let browser; let bundle; let relay;
let page; let dir; let lines;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ArtifactView } from './renderer/src/components/ArtifactView';
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(window.room ?? null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      function App() {
        const [lines, setLines] = useState(window.firstLines);
        window.addLine = (l) => setLines((was) => [...was, l]);
        return <ArtifactView product="p" thread="t" lines={lines} marks={{ notes: [], approvals: [], seen: {} }} me="me"
          people={[]} open={{ path: window.opens, at: 1 }} ownerOfRow="me" withAgent write={async () => ({ ok: true })}
          onNewVersion={async (_name, text, path, _id, since) => {
            const out = await window.saveVersion({ path, text, since });
            if (out.line) window.addLine(out.line);
            return out.error ?? null;
          }}
          onClose={() => {}} files={{ find: async (p) => p, readText: (p) => window.readFile(p) }} />;
      }
      createRoot(document.getElementById('root')).render(<App />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  // The page is not on loopback and the relay is, which Chromium refuses unless told not to.
  browser = await chromium.launch({ headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] });
  relay = await startLiveRelay({ port: 0 });
}, 60_000);
afterAll(async () => { await browser?.close(); await relay?.close?.(); });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edits-survive-'));
  fs.mkdirSync(path.join(dir, 'designs/t'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'designs/t/script.md'), V1);
  lines = [{ id: 'l1', ts: 1, source: 'agent', patch: { note: 'Here: [script.md](designs/t/script.md)' } }];
});
afterEach(async () => { await page?.close(); page = null; fs.rmSync(dir, { recursive: true, force: true }); });

const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const newest = () => {
  const names = fs.readdirSync(path.join(dir, 'designs/t'));
  const n = (f) => Number(/-v(\d+)\.md$/.exec(f)?.[1] ?? 1);
  return read(`designs/t/${names.sort((a, b) => n(a) - n(b)).at(-1)}`);
};

const open = async ({ room = false, opens = 'designs/t/script.md', draft = null } = {}) => {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(8_000);
  await page.exposeFunction('readFile', (p) => { try { return read(p); } catch { return null; } });
  await page.exposeFunction('saveVersion', ({ path: basePath, text, since }) => {
    const saved = saveNextVersion({ dir, threadId: 't', lines, basePath, text, since });
    if (!saved.ok) return { error: saved.error };
    if (saved.unchanged) return {};
    const line = { id: `e${lines.length + 1}`, ts: lines.length + 1, source: 'founder', by: 'me', patch: { artifact: { do: 'edit', file: saved.file, path: saved.path } } };
    lines.push(line);
    return { line };
  });
  const ticket = room ? { url: `ws://127.0.0.1:${relay.port}/room/team.${path.basename(dir)}`, me: { name: 'You', person: 'me', color: '#e66', kind: 'person', canSave: true, owner: true } } : null;
  await page.addInitScript(({ first, ticket, opens, draft }) => {
    window.firstLines = first; window.room = ticket; window.opens = opens;
    if (draft) localStorage.setItem(draft.key, draft.words);
  }, { first: lines, ticket, opens, draft });
  await page.route('http://doc.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://doc.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('.ProseMirror').waitFor();
  if (room) {
    await expect.poll(() => relay.rooms.size).toBe(1);
    await expect.poll(onScreen).toContain('I stay on top');
  }
};

const onScreen = () => page.locator('.ProseMirror').textContent();
const typeAfter = async (words, typed) => {
  await page.locator('.ProseMirror p', { hasText: words }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(` ${typed}`);
};
const leaveTheWindow = () => page.evaluate(() => window.dispatchEvent(new Event('blur')));
const versions = () => lines.length;
/** The agent writes its next version from the newest one, as told to. */
const agentWrites = async (change) => {
  const n = fs.readdirSync(path.join(dir, 'designs/t')).length + 1;
  const rel = `designs/t/script-v${n}.md`;
  fs.writeFileSync(path.join(dir, rel), change(newest()));
  const line = { id: `a${n}`, ts: lines.length + 1, source: 'agent', patch: { note: `Again: [script-v${n}.md](${rel})` } };
  lines.push(line);
  await page.evaluate((l) => window.addLine(l), line);
  return n;
};
const standupRewritten = (t) => t.replace('Keeping a team in the loop takes a standup.', AGENTS);

for (const room of [false, true]) {
  describe.skipIf(!browserAvailable)(room ? 'in a live room' : 'with no live room', () => {
    it('a version the agent writes while you type comes onto your screen, with your words', async () => {
      await open({ room });
      await typeAfter('every teammate', MINE);
      await leaveTheWindow();
      await expect.poll(versions).toBe(2);
      expect(newest()).toContain(MINE);

      const n = await agentWrites(standupRewritten);
      await expect.poll(onScreen).toContain(AGENTS);
      expect(await onScreen()).toContain(MINE);
      await expect.poll(() => page.locator('.av-of').textContent()).toBe(`v${n} of ${n}`);
    });

    it('the save after the agent\'s version keeps what you saved before it', async () => {
      await open({ room });
      await typeAfter('every teammate', MINE);
      await leaveTheWindow();
      await expect.poll(versions).toBe(2);
      await agentWrites(standupRewritten);
      await expect.poll(onScreen).toContain(AGENTS);
      await page.waitForTimeout(1500);
      await leaveTheWindow();
      await page.waitForTimeout(500);
      expect(newest()).toContain(MINE);
      expect(newest()).toContain(AGENTS);

      await typeAfter('Comment if you want in.', 'Or send a DM.');
      await leaveTheWindow();
      await expect.poll(newest).toContain('Or send a DM.');
      expect(newest()).toContain(MINE);
      expect(newest()).toContain(AGENTS);
    });

    it('words not saved yet stay, beside the agent\'s change to the same line', async () => {
      await open({ room });
      await typeAfter('pops up on my screen.', 'Unsaved.');
      await agentWrites((t) => standupRewritten(t).replace('it pops up on my screen.', 'it shows in the corner.'));
      await expect.poll(onScreen).toContain(AGENTS);
      expect(await onScreen()).toContain('it shows in the corner. Unsaved.');
      await leaveTheWindow();
      await expect.poll(newest).toContain('it shows in the corner. Unsaved.');
      expect(newest()).toContain(AGENTS);
    });
  });
}

describe.skipIf(!browserAvailable)('words kept from a sitting on an older version', () => {
  it('open on the newest version with your words merged in, not over it', async () => {
    fs.writeFileSync(path.join(dir, 'designs/t/script-v2.md'), standupRewritten(V1));
    lines.push({ id: 'a2', ts: 2, source: 'agent', patch: { note: 'Again: [script-v2.md](designs/t/script-v2.md)' } });
    const kept = V1.replace('I stay on top of every teammate.', `I stay on top of every teammate. ${MINE}`);
    await open({ opens: 'designs/t/script-v2.md', draft: { key: 'doc-edit-draft:p:designs/t/script.md', words: kept } });
    await expect.poll(onScreen).toContain(MINE);
    expect(await onScreen()).toContain(AGENTS);
    await leaveTheWindow();
    await expect.poll(versions).toBe(3);
    expect(newest()).toContain(MINE);
    expect(newest()).toContain(AGENTS);
  });

  it('a version nobody wrote under the editor leaves it as it is', async () => {
    await open();
    await typeAfter('every teammate', MINE);
    await page.waitForTimeout(800);
    expect(await onScreen()).toContain(MINE);
    expect(await onScreen()).not.toContain(AGENTS);
    expect(versions()).toBe(1);
  });
});
