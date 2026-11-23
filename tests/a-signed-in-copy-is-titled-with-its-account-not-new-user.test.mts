// A test copy kept saying "Agentbox (new user)" after it signed in.
//
// QA on the Linux box, 2026-11-15 (session m20): a copy launched as a fresh
// user signed in to the test cloud, Home and Settings showed the account, and
// the title bar still read "Agentbox (new user)" for the rest of the session.
// The title was set once when the window was built and nothing changed it
// after. Signed in, the copy is titled with its account, which still tells it
// apart from your own window; signed out it goes back to "(new user)".
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUserTitle, newUserWindow } from '../main/new-user-window.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'main/main.mts'), 'utf8');

describe('the title of a test copy', () => {
  it('says new user before anyone signs in', () => {
    expect(newUserTitle({ fresh: true, name: 'Agentbox', account: null })).toBe('Agentbox (new user)');
    expect(newUserTitle({ fresh: true, name: 'Agentbox', account: '' })).toBe('Agentbox (new user)');
  });

  it('names the account once one is signed in', () => {
    expect(newUserTitle({ fresh: true, name: 'Agentbox', account: 'cloud3@example.com' })).toBe('Agentbox (cloud3@example.com)');
  });

  // THE CASE THAT MUST NOT MATCH: your own window is titled as it always was.
  it('leaves your own window titled with the app name, signed in or not', () => {
    expect(newUserTitle({ fresh: false, name: 'Agentbox', account: 'you@example.com' })).toBe('Agentbox');
    expect(newUserTitle({ fresh: false, name: 'Agentbox', account: null })).toBe('Agentbox');
  });

  it('is the title the window is built with', () => {
    expect(newUserWindow({ fresh: true, name: 'Agentbox' }).title).toBe('Agentbox (new user)');
    expect(newUserWindow({ fresh: true, name: 'Agentbox', account: 'a@b.co' }).title).toBe('Agentbox (a@b.co)');
  });

  it('follows the sign-in while the app runs', () => {
    expect(main).toMatch(/onChange: \(\) => \{[^}]*retitle\(\)/);
    expect(main).toMatch(/retitle = \(\) => \{[\s\S]{0,400}newUserTitle\([\s\S]{0,200}setTitle/);
  });
});
