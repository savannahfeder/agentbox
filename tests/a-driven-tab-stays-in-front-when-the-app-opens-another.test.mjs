// A DRIVEN TAB STAYS IN FRONT WHEN THE APP OPENS ANOTHER.
//
// No film played in any of three driven browser copies: a black box, the
// Play button turned to Pause, and 0:00 / 0:00. The server was not it: its
// Range answers were measured right (206s, video/mp4, 416 past the end) and the
// same 6 MB H.264 film played in the browser copy in a fresh tab. What they all
// did first was Connections > Connect, which opens the sign-in in a new tab.
// Headless Chrome then counts the app's tab as hidden, and Chrome does not load
// a film in a hidden tab: measured readyState 0, networkState LOADING, duration
// NaN and play() never settling, for as long as anyone waited. Pictures still
// load, so nothing else looked wrong. Each command now brings its tab to front.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME, launchChrome, connect } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

it.skipIf(!fs.existsSync(CHROME))('the next command finds the driven tab visible after the page opened another tab', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'front-profile-'));
  const { chrome, wsUrl } = await launchChrome({ profile, width: 400, height: 300 });
  try {
    const first = await connect(wsUrl, { width: 400, height: 300 });
    expect(await first.evaluate('document.visibilityState')).toBe('visible');
    const opened = await first.call('Runtime.evaluate', { expression: '!!window.open("about:blank#signin", "_blank")', userGesture: true, returnByValue: true });
    expect(opened.result.value).toBe(true);
    await first.wait(800);
    // What the tab was left as for the rest of the day.
    expect(await first.evaluate('document.visibilityState')).toBe('hidden');
    first.detach();

    const next = await connect(wsUrl, { width: 400, height: 300, targetId: first.targetId });
    expect(await next.evaluate('document.visibilityState')).toBe('visible');
    next.detach();
  } finally {
    chrome.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}, 30_000);
