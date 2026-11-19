// A TESTER'S BROWSER STAYS DARK BETWEEN COMMANDS.
//
// Test day 2026-11-18: a teammate's choices were drawn in a dim blue on a dark
// page, and the founder asked why. The app follows the computer's light or dark
// through prefers-color-scheme. cdp.mjs asked for dark per connection, and
// every browse.mjs command connects, acts and lets go, so between commands the
// page read light: in a copy on Match system, a connection that asks for
// nothing read { dark: false, machine: "light" }, and a picture caught the
// strip in the light theme's slate (74, 82, 102) over the dark page. The
// browser is now started dark, so the page stays dark with nobody connected.
import { it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchChrome, canDrive } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-between-'));
let chrome: { kill: (s?: string) => void } | null = null;
afterAll(() => { chrome?.kill('SIGKILL'); fs.rmSync(profile, { recursive: true, force: true }); });

it.skipIf(!canDrive())('a page asked nothing about its colours still reads dark', async () => {
  const launched = await launchChrome({ profile, width: 400, height: 300 });
  chrome = launched.chrome;
  const ws = new WebSocket(launched.wsUrl);
  await new Promise((r) => { ws.onopen = r; });
  let n = 0;
  const waiting = new Map<number, (v: unknown) => void>();
  ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); waiting.get(d.id)?.(d.result); };
  const send = (method: string, params = {}, sessionId?: string) => new Promise<any>((r) => { const id = ++n; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const out = await send('Runtime.evaluate', { expression: "matchMedia('(prefers-color-scheme: dark)').matches", returnByValue: true }, sessionId);
  ws.close();
  expect(out.result.value).toBe(true);
}, 60_000);
