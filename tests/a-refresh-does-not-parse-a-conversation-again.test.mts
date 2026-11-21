// A REFRESH PARSED THE WHOLE CONVERSATION AGAIN, THOUGH NOT A WORD OF IT HAD CHANGED.
// While an agent works the app refreshes up to two and a half times a second,
// and every message in the open thread went through react-markdown again on
// each one. Profiled in the built app with a 15 KB message open and a refresh
// every 400 ms: of 680 ms of rendering in 8 seconds, 508 ms was the markdown
// parser, about 25 ms a refresh. The messages are now drawn by a memoized
// react-markdown, and Focus hands it plugins and components that keep their
// identity from one render to the next, so a message is parsed again only
// when its words or how they are drawn change.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const focus = readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

describe('the open thread', () => {
  it('draws every message through the memoized markdown', () => {
    const md = focus.slice(focus.indexOf('const md = (text: string) => {'));
    expect(md.slice(0, 600)).toMatch(/<MessageMarkdown remarkPlugins=\{mdPlugins\} components=\{mdComponents\} urlTransform=\{artifactUrlTransform\}>/);
    expect(focus).not.toMatch(/<ReactMarkdown/);
  });

  it('keeps the plugins and components the same from one render to the next', () => {
    expect(focus).toMatch(/const \{ resolveSrc, mdComponents, openHref \} = useMemo\(/);
    expect(focus).toMatch(/const mdPlugins = useMemo\(/);
  });
});

describe('the other conversations and a file opened as a sheet', () => {
  const read = (f: string) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

  it('draw through the memoized markdown with props that keep their identity', () => {
    expect(read('team/rooms/RoomChat.tsx')).toMatch(/<MessageMarkdown remarkPlugins=\{MARKDOWN_PLUGINS\} components=\{components\} urlTransform=\{keepConnectionLinks\}>/);
    expect(read('threads/TeammateThread.tsx')).toMatch(/<MessageMarkdown remarkPlugins=\{THREAD_PLUGINS\} components=\{components\} urlTransform=\{artifactUrlTransform\}>/);
    expect(read('components/FileSheet.tsx')).toMatch(/<MessageMarkdown remarkPlugins=\{PLUGINS\} components=\{TEXT_PARTS\}>/);
  });
});

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  // A parent redrawn on every press, as App is on every refresh, around one message.
  bundle = (await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { MessageMarkdown } from './renderer/src/components/MessageMarkdown';
      window.parses = 0;
      const counted = () => { window.parses++; };
      const plugins = [counted];
      const components = { em: ({ children }) => <i>{children}</i> };
      function Page() {
        const [tick, setTick] = useState(0);
        const [text, setText] = useState('Hello *there*, and a [link](a.md).');
        const [own, setOwn] = useState(plugins);
        window.redraw = () => setTick((t) => t + 1);
        window.say = setText;
        window.newPlugins = () => setOwn([counted]);
        return <div data-tick={tick}><MessageMarkdown remarkPlugins={own} components={components}>{text}</MessageMarkdown></div>;
      }
      createRoot(document.getElementById('root')).render(<Page />);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function page() {
  const p = await browser.newPage();
  await p.setContent('<div id="root"></div>');
  await p.addScriptTag({ content: bundle });
  await p.waitForFunction(() => document.querySelector('i'));
  return p;
}
const redraws = (p, n: number) => p.evaluate(async (n) => {
  for (let i = 0; i < n; i++) { window.redraw(); await new Promise((r) => setTimeout(r, 0)); }
  await new Promise((r) => setTimeout(r, 50));
  return window.parses;
}, n);

describe.skipIf(!browserAvailable)('a message in a thread that is redrawn', () => {
  it('is parsed once over ten redraws with the same words (the reported case)', async () => {
    const p = await page();
    expect(await p.evaluate(() => window.parses)).toBe(1);
    expect(await redraws(p, 10)).toBe(1);
    await p.close();
  }, 30_000);

  it('is parsed again when its words change, and drawn with them', async () => {
    const p = await page();
    await p.evaluate(() => window.say('Now *changed*.'));
    await p.waitForFunction(() => document.querySelector('i')?.textContent === 'changed');
    expect(await redraws(p, 5)).toBe(2);
    await p.close();
  }, 30_000);

  it('is parsed again when it is handed new plugins', async () => {
    const p = await page();
    await p.evaluate(() => window.newPlugins());
    expect(await redraws(p, 3)).toBe(2);
    await p.close();
  }, 30_000);
});
