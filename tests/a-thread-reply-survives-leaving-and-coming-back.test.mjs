// The side-panel composer discarded unsent words and files on navigation.
// Exercise the real editor across unmounts, thread changes, reloads and sends.
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());
let browser, page, bundle;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {ThreadPanel} from './renderer/src/team/ThreadPanel';
      function Page() {
        const [open, setOpen] = useState(true);
        const [thread, setThread] = useState('a');
        const [id, setId] = useState('conversation-a');
        const [product, setProduct] = useState('project-a');
        window.zero = {saveAttachments: async ({files}) => files.map(f => ({...f, rel:'attachments/'+f.name}))};
        return <React.StrictMode>
          <button onClick={()=>setOpen(false)}>Back</button>
          <button onClick={()=>setOpen(true)}>Open thread</button>
          <button onClick={()=>setThread(thread==='a'?'b':'a')}>Switch thread</button>
          <button onClick={()=>setId(id==='conversation-a'?'conversation-b':'conversation-a')}>Switch conversation</button>
          <button onClick={()=>setProduct(product==='project-a'?'project-b':'project-a')}>Switch project</button>
          {open && <ThreadPanel product={product} id={id}
            parent={{uid:thread,at:1,who:'you',text:'Can we review this?'}} replies={[]}
            md={text=><p>{text}</p>} width={520} onResize={()=>{}} onClose={()=>setOpen(false)}
            onSend={text=>{window.sent=text;return new Promise(resolve=>{window.finishSend=resolve;});}}/>}
        </React.StrictMode>;
      }
      createRoot(document.getElementById('root')).render(<Page/>);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, jsx: 'automatic',
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  if (!browserAvailable) return;
  await page?.close();
  page = await browser.newPage();
  page.setDefaultTimeout(5_000);
  await page.route('http://draft.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://draft.test/');
  await page.addScriptTag({ content: bundle });
});
const editor = () => page.getByRole('textbox', { name: 'Reply in thread', exact: true });
const text = () => editor().innerText();
async function reopen() {
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Open thread', exact: true }).click();
}
async function attach() {
  await page.locator('input[type=file]').setInputFiles({ name: 'review.txt', mimeType: 'text/plain', buffer: Buffer.from('Review notes') });
  await page.getByRole('button', { name: 'review.txt ×', exact: true }).waitFor();
}

it.skipIf(!browserAvailable)('restores paragraphs and formatting after Back and after reloading', async () => {
  await editor().fill('First paragraph');
  await editor().press('Control+a');
  await editor().press('Control+b');
  await editor().press('ArrowRight');
  await editor().press('Control+b');
  await editor().press('Shift+Enter');
  await editor().press('Shift+Enter');
  await page.keyboard.type('Second paragraph');
  const plain = () => editor().evaluate(el => el.closest('.rich-reply').value);
  const before = await plain();
  await reopen();
  expect(await plain()).toBe(before);
  expect(await editor().locator('strong').innerText()).toBe('First paragraph');
  await page.reload();
  await page.addScriptTag({ content: bundle });
  expect(await plain()).toBe(before);
  expect(await editor().locator('strong').innerText()).toBe('First paragraph');
});

for (const scope of ['thread', 'conversation', 'project']) {
  it.skipIf(!browserAvailable)(`keeps separate drafts when switching ${scope}s without unmounting the panel`, async () => {
    await editor().fill('Draft A');
    await page.getByRole('button', { name: `Switch ${scope}`, exact: true }).click();
    expect((await text()).trim()).toBe('');
    await editor().fill('Draft B');
    await page.getByRole('button', { name: `Switch ${scope}`, exact: true }).click();
    expect(await text()).toBe('Draft A');
    await page.getByRole('button', { name: `Switch ${scope}`, exact: true }).click();
    expect(await text()).toBe('Draft B');
  });
}

it.skipIf(!browserAvailable)('keeps an attachment-only draft, then remembers its removal and deleted text', async () => {
  await attach();
  await reopen();
  expect(await page.getByRole('button', { name: 'review.txt ×', exact: true }).count()).toBe(1);
  await page.getByRole('button', { name: 'review.txt ×', exact: true }).click();
  await editor().fill('Erase this');
  await editor().press('Control+a');
  await editor().press('Backspace');
  await reopen();
  expect((await text()).trim()).toBe('');
  expect(await page.getByRole('button', { name: 'review.txt ×', exact: true }).count()).toBe(0);
  expect(await page.getByRole('button', { name: 'Send ↵', exact: true }).isDisabled()).toBe(true);
});

it.skipIf(!browserAvailable)('restores a pasted image and leaves the main conversation draft alone', async () => {
  await page.evaluate(() => localStorage.setItem('zero.draft.project-a:conversation-a', 'Main conversation draft'));
  await page.locator('input[type=file]').setInputFiles({
    name: 'diagram.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2f8AAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByAltText('diagram.png', { exact: true }).waitFor();
  await reopen();
  expect(await page.getByAltText('diagram.png', { exact: true }).count()).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('zero.draft.project-a:conversation-a'))).toBe('Main conversation draft');
});

it.skipIf(!browserAvailable)('clears a delivered draft without clearing newer typing', async () => {
  await editor().fill('First reply');
  await page.getByRole('button', { name: 'Send ↵', exact: true }).click();
  await page.waitForFunction(() => window.finishSend);
  await editor().fill('Next reply');
  await page.evaluate(() => window.finishSend(true));
  await reopen();
  expect(await text()).toBe('Next reply');
  await page.getByRole('button', { name: 'Send ↵', exact: true }).click();
  await page.waitForFunction(() => window.sent === 'Next reply');
  await page.evaluate(() => window.finishSend(true));
  await reopen();
  expect((await text()).trim()).toBe('');
});

it.skipIf(!browserAvailable)('returns a failed send to its own thread after navigation, preserving newer words', async () => {
  await editor().fill('Reply that fails');
  await attach();
  await page.getByRole('button', { name: 'Send ↵', exact: true }).click();
  await page.waitForFunction(() => window.finishSend);
  await editor().fill('Newer words');
  await page.getByRole('button', { name: 'Switch thread', exact: true }).click();
  await editor().fill('Other thread');
  await page.evaluate(() => window.finishSend(false));
  expect(await text()).toBe('Other thread');
  await page.getByRole('button', { name: 'Switch thread', exact: true }).click();
  expect(await text()).toContain('Newer words');
  expect(await text()).toContain('Reply that fails');
  expect(await page.getByRole('button', { name: 'review.txt ×', exact: true }).count()).toBe(1);
});
