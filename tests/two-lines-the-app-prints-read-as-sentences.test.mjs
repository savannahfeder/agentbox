// TWO LINES NOBODY HAD READ BACK (QA, 2026-10-23).
//
//   zero: diagnostics is has nowhere to send to, nothing is sent
//   agentbox: made 2 node-pty spawn-helper binaryies executable
//
// The first is one line printing `diagnostics is ${reason}` against a reason
// that already carried its verb. The second is `binary${n === 1 ? '' : 'ies'}`,
// which only reads for one. Both are the first thing somebody sees in a
// terminal, on a launch and on an install.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAnalytics } from '../main/analytics.mjs';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reads-as-a-sentence-'));

describe('the line about diagnostics reads as a sentence', () => {
  it('says what is happening, whichever of the three reasons it is', () => {
    const say = (reason) => `zero: diagnostics ${reason}, nothing is sent`;

    // No key baked in, which is every build from a checkout.
    const nowhere = createAnalytics({ config: {}, dir: dir(), version: '1.2.3' });
    expect(nowhere.hasDestination).toBe(false);
    expect(say(nowhere.reason)).toBe('zero: diagnostics has nowhere to send to, nothing is sent');

    // A key, and the switch off.
    const off = createAnalytics({
      config: { diagnostics: false }, dir: dir(), version: '1.2.3', client: { capture() {}, shutdown() {} },
    });
    expect(say(off.reason)).toBe('zero: diagnostics is turned off, nothing is sent');

    // And on, which is the reason that is never printed but is still a phrase.
    const on = createAnalytics({
      config: { diagnostics: true }, dir: dir(), version: '1.2.3', client: { capture() {}, shutdown() {} },
    });
    expect(on.reason).toBe('is on');
  });

  it('is printed by the one line that prints it, with no verb of its own', () => {
    const main = fs.readFileSync(path.join(repo, 'main', 'main.mjs'), 'utf8');
    expect(main).toMatch(/zero: diagnostics \$\{analytics\.reason\}, nothing is sent/);
    expect(main).not.toMatch(/diagnostics is \$\{analytics\.reason\}/);
  });
});

describe('the line about the terminal binaries reads as a sentence', () => {
  it('counts one and many', () => {
    const said = (fixed) => `agentbox: made ${fixed} node-pty spawn-helper binar${fixed === 1 ? 'y' : 'ies'} executable, so the terminal works.`;
    expect(said(1)).toBe('agentbox: made 1 node-pty spawn-helper binary executable, so the terminal works.');
    expect(said(2)).toBe('agentbox: made 2 node-pty spawn-helper binaries executable, so the terminal works.');
    expect(said(2)).not.toContain('binaryies');
    // And the install prints that exact template, which is the thing that was
    // wrong: the sentence above is only worth anything if it is the one shipped.
    const after = fs.readFileSync(path.join(repo, 'scripts', 'after-install.mjs'), 'utf8');
    expect(after).toContain("binar${fixed === 1 ? 'y' : 'ies'}");
    expect(after).not.toContain("binary${");
  });
});
