// Expanding the summary left the reader at the oldest message. Measure the
// real scroll box after clicking, then verify history can be read upward.
import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

it.skipIf(!browserAvailable)('opens long history at the newest message and allows scrolling upward', async () => {
  const bundle = await build({
    stdin: { contents: `import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {QueueSummary} from './renderer/src/components/OneThingAtATime';
      function Page() { const [open, setOpen] = useState(false); return <div className="focus-scroll" style={{height:600,overflow:'auto'}}>
        <QueueSummary title="Conversation" context="Earlier discussion" earlier={37} open={open} onToggle={()=>setOpen(!open)}/>
        {open && Array.from({length:37},(_,i)=><p key={i} style={{height:100}}>Earlier message {i+1}</p>)}
        <p id="newest">The most recent message</p></div> }
      createRoot(document.getElementById('root')).render(<Page/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, jsx: 'automatic',
  });
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    await page.setContent('<html style="background:#24211f;color:#eee;font:22px sans-serif"><div id="root"></div></html>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('button', {name:'Show 37 earlier messages'}).click();
    expect(await page.locator('.focus-scroll').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(2);
    await page.locator('.focus-scroll').hover();
    await page.mouse.wheel(0,-500);
    await page.waitForTimeout(150);
    expect(await page.locator('.focus-scroll').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeGreaterThan(100);
    await page.getByRole('button', {name:'Hide earlier messages'}).evaluate(el=>el.click());
    expect(await page.locator('.focus-scroll').evaluate(el=>el.scrollTop)).toBe(0);
    await page.getByRole('button', {name:'Show 37 earlier messages'}).click();
    expect(await page.locator('.focus-scroll').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(2);
  } finally { await browser.close(); }
});
