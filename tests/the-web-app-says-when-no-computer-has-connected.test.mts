// THE WEB APP SAYS WHEN NO COMPUTER HAS CONNECTED, AND NAMES THE ACCOUNT.
//
// What broke (2026-10-26, the web app driven in Chromium against a stand-in
// cloud): signed in to an account no computer had sent anything to, the inbox
// read "Nothing needs you", and New thread said "Nowhere to send this yet. Make
// your first project", a project the web app cannot make. Nothing said a
// computer was missing, which account the page was signed in as, or how to
// connect one. The out-of-date line also said "Mac" to people on Linux.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phoneConnectState, phoneStatusLine } from '../renderer/src/phone-rows';
import { noProjectYet } from '../renderer/src/compose-says';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const NOW = Date.parse('2026-10-26T12:00:00Z');
const MIN = 60_000;
const project = { device: '0a1b2c3d4e5f', project: 'alpha', name: 'Alpha', updated_at: new Date(NOW - MIN).toISOString() };

describe('no computer has connected to this account', () => {
  it('asks for one, naming the account the page is signed in as', () => {
    expect(phoneConnectState({ signedIn: true, started: true, error: null, projects: [], email: 'you@example.com' }))
      .toEqual({ email: 'you@example.com' });
  });

  it('is not asked once a computer has sent a project', () => {
    expect(phoneConnectState({ signedIn: true, started: true, error: null, projects: [project], email: 'you@example.com' })).toBeNull();
  });

  it('is not asked before the first read is back, signed out, or when the read failed', () => {
    expect(phoneConnectState({ signedIn: true, started: false, error: null, projects: [], email: 'a@b.c' })).toBeNull();
    expect(phoneConnectState({ signedIn: false, started: true, error: null, projects: [], email: null })).toBeNull();
    // A failed read is not an empty account: the line over the inbox says that one.
    expect(phoneConnectState({ signedIn: true, started: true, error: 'Failed to fetch', projects: [], email: 'a@b.c' })).toBeNull();
  });

  it('still asks when the sign-in carries no email', () => {
    expect(phoneConnectState({ signedIn: true, started: true, error: null, projects: [], email: null })).toEqual({ email: null });
  });

  it('is drawn in place of the inbox, with a way to use another account', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/snap\.phoneConnect\s*\?\s*<ConnectComputer/);
    const pages = read('renderer/src/threads/Pages.tsx');
    expect(pages).toContain('export function ConnectComputer');
    expect(pages).toContain('Connect your computer');
    expect(pages).toContain('Use another account');
    expect(read('renderer/src/cloud-bridge.ts')).toMatch(/phoneConnect:\s*phoneConnectState\(/);
  });

  it('offers no New thread while there is no computer to send one to', () => {
    expect(read('renderer/src/threads/pages.css')).toMatch(/\.workspace-layout:has\(\.th-connect\) \.th-new \{ display: none; \}/);
  });
});

describe('the new thread box with no computer', () => {
  it('says a computer is missing, not to make a project', () => {
    expect(noProjectYet(null, { noComputer: true })).toEqual({ reason: 'No computer is connected yet.', action: '' });
    expect(noProjectYet(null)).toEqual({ reason: 'Nowhere to send this yet.', action: 'Make your first project' });
    expect(noProjectYet({ slug: 'a' }, { noComputer: true })).toBeNull();
  });
});

describe('the line over the inbox', () => {
  it('says computer, not Mac', () => {
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - 3 * 60 * MIN }, NOW)).toBe('Your computer was last online 3 hours ago. What you send waits for it.');
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - 3 * 60 * MIN }, NOW)).not.toMatch(/Mac/);
  });
});
