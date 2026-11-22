// THE WINDOW ASKED TWICE A SECOND WHETHER CLAUDE CODE OR CODEX WAS UPDATING.
//
// renderer/src/components/AgentUpdates.tsx asked the main process for each
// engine's update status every second, for as long as the window was open,
// and stored each answer as a new object, so everything reading the context
// drew again. An update only runs after a click in this window, and its
// status changes on its own only while it runs, so the window now asks every
// second only while one is running, and stops once it has finished.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { AgentUpdates, useAgentUpdates } from './renderer/src/components/AgentUpdates';
      function Button() {
        const { start } = useAgentUpdates();
        return <button id="update" onClick={() => start('claude')}>Update</button>;
      }
      createRoot(document.getElementById('root')).render(<AgentUpdates><Button /></AgentUpdates>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

// A main process whose Claude Code update runs until `window.finish()`.
const FAKE = `
  window.asked = [];
  let claude = { engine: 'claude', state: 'available', installed: '2.1.1', latest: '2.1.2' };
  window.finish = () => { claude = { engine: 'claude', state: 'current', installed: '2.1.2', latest: '2.1.2' }; };
  window.zero = {
    agentUpdate: async ({ engine, action }) => {
      window.asked.push(engine + ':' + action);
      if (engine === 'codex') return { engine, state: 'current' };
      if (action === 'start') claude = { engine: 'claude', state: 'running', installed: '2.1.1', latest: '2.1.2' };
      return claude;
    },
    terminal: async () => ({ ok: true, output: '', offset: 0 }),
    onTerminalData: () => () => {},
  };`;

async function page() {
  const p = await browser.newPage();
  p.setDefaultTimeout(5_000);
  await p.route('http://updates.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><div id="root"></div></html>' }));
  await p.goto('http://updates.test/');
  await p.addScriptTag({ content: FAKE });
  await p.addScriptTag({ content: bundle });
  await p.locator('#update').waitFor();
  return p;
}
const statusAsks = (p) => p.evaluate(() => (window as unknown as { asked: string[] }).asked.filter((a) => a.endsWith(':status')).length);

describe.skipIf(!browserAvailable)('the agent update status', () => {
  it('is not asked for while no update runs', async () => {
    const p = await page();
    await p.waitForTimeout(2_500);
    expect(await statusAsks(p)).toBe(0);
    await p.close();
  });

  it('is asked every second while one runs, and no more once it has finished', async () => {
    const p = await page();
    await p.click('#update');
    await p.waitForTimeout(2_500);
    expect(await statusAsks(p)).toBeGreaterThanOrEqual(4);
    await p.evaluate(() => (window as unknown as { finish: () => void }).finish());
    await p.waitForTimeout(1_500);
    const after = await statusAsks(p);
    await p.waitForTimeout(2_000);
    expect(await statusAsks(p)).toBe(after);
    await p.close();
  }, 20_000);
});
