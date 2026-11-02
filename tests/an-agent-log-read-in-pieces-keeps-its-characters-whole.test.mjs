// AN AGENT LOG READ IN PIECES KEEPS ITS CHARACTERS WHOLE.
//
// From Codex's review of the memory fixes (2026-10-31, filed as w-6b9446683a):
// an open thread is sent only what its agent's log grew by, and each piece was
// decoded alone. A log read while it ended on the first byte of "€" and read
// again once the other two bytes landed showed "prefix ���" where a whole read
// shows "prefix €", and kept it until the log was read whole again. Each read
// now stops after the last whole character, and its stamp says so, so the
// half-written one is read with the rest of it next time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { traceAnswer, traceReader } from '../shared/trace-delta.mjs';

function log() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-')), '1.log');
  fs.writeFileSync(file, '');
  const reader = traceReader();
  let had;
  return {
    add(bytes) { fs.appendFileSync(file, Buffer.from(bytes)); },
    read() {
      const answer = traceAnswer({ fs, file, startedAt: 1, had });
      const got = reader.take('p/w-1', { sessions: [answer] });
      had = answer.stamp;
      return got?.sessions[0]?.text;
    },
    whole: () => traceAnswer({ fs, file, startedAt: 1 }).text,
  };
}

const EURO = [0xe2, 0x82, 0xac];
const ROCKET = [0xf0, 0x9f, 0x9a, 0x80];

describe('an agent log read in pieces keeps its characters whole', () => {
  it('a character split between two reads comes out whole, as a whole read shows it', () => {
    const l = log();
    l.add([...Buffer.from('prefix '), EURO[0]]);
    l.read();
    l.add(EURO.slice(1));
    expect(l.read()).toBe('prefix €');
    expect(l.whole()).toBe('prefix €');
  });

  it('a four-byte character split over three reads, and growth after it, stay whole', () => {
    const l = log();
    l.add([...Buffer.from('go '), ROCKET[0]]);
    l.read();
    l.add(ROCKET.slice(1, 3));
    l.read();
    l.add([ROCKET[3], ...Buffer.from(' done')]);
    expect(l.read()).toBe('go 🚀 done');
  });

  it('a log that first ends inside a character is held back from the first read too', () => {
    const l = log();
    l.add([...Buffer.from('a'), EURO[0], EURO[1]]);
    expect(l.read()).toBe('a');
    l.add([EURO[2]]);
    expect(l.read()).toBe('a€');
  });

  it('a read that ends on a whole character, or on plain text, holds nothing back', () => {
    const l = log();
    l.add([...Buffer.from('cost '), ...EURO]);
    expect(l.read()).toBe('cost €');
    l.add([...Buffer.from(' and more')]);
    expect(l.read()).toBe('cost € and more');
  });
});
