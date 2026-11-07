// THE FIXTURE SEAL TAKES ONLY A FULL-LENGTH TAG.
//
// w-9844544e9038, 2026-11-02. With the scan's dead folder taken out, semgrep
// ran for the first time in two days and named the finding it had been hiding:
// gcm-no-tag-length. GCM verifies a 4-, 8- or 12-byte tag unless the length is
// named, and a short tag is what an attacker forges. The slice
// `raw.subarray(12, 28)` already pins 16 bytes, so naming it keeps that true if
// the format moves. Nothing covered this seal at all, hence the round-trip.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fixtureCipher } from '../main/connections/start.mjs';

const seal = fixtureCipher(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seal-')), 'connections.enc.test-key'));

describe('the fixture seal', () => {
  it('reads back what it sealed', () => {
    expect(seal.decrypt(seal.encrypt('a token'))).toBe('a token');
  });

  it('refuses a body someone changed', () => {
    const sealed = seal.encrypt('a token');
    sealed[sealed.length - 1] ^= 1;
    expect(() => seal.decrypt(sealed)).toThrow();
  });

  it('refuses a tag someone changed', () => {
    const sealed = seal.encrypt('a token');
    sealed[12] ^= 1;
    expect(() => seal.decrypt(sealed)).toThrow();
  });
});

describe('every GCM seal in the code that ships', () => {
  const files = ['main/connections/start.mjs'];

  it.each(files)('%s names the tag length its format pins', (file) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const gcm = lines.filter((l) => /create(De)?cipheriv\(\s*'aes-\d+-gcm'/.test(l));
    expect(gcm.length).toBeGreaterThan(0);
    for (const line of gcm) expect(line).toMatch(/authTagLength:\s*16/);
  });
});
