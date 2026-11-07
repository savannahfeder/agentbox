// A CHARACTER SPLIT BETWEEN TWO LOG READS ARRIVES WHOLE.
//
// An open thread's agent log is sent only what it grew by
// (shared/trace-delta.mjs). When one read ended partway through a character
// of more than one byte, say the first byte of "€", and the next read brought
// the rest, each piece was decoded alone and the window showed "���" where a
// whole read shows "€". It stayed that way until the log was read whole again.
// Found in Codex's review of the memory fixes (w-c13990a57e) and reproduced
// with a scratch harness that wrote "€" a byte at a time between reads.
//
// So a read stops at the last whole character and its stamp says how far it
// got: a character the writer has not finished waits for the next read.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { traceAnswer, traceReader } from '../shared/trace-delta.mjs';

const BROKEN = '�';
let dir, file, read;
const key = 'p/w-split';
const startedAt = 1000;

const ask = () => read.take(key, { ok: true, sessions: [traceAnswer({ fs, file, startedAt, had: read.have(key)?.[startedAt] })] });
const shown = () => ask().sessions[0].text;
const whole = () => traceAnswer({ fs, file, startedAt }).text;
const append = (bytes) => fs.appendFileSync(file, Buffer.from(bytes));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-split-'));
  file = path.join(dir, `${startedAt}.log`);
  read = traceReader();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const characters = ['é', '€', '😀'];
const splits = characters.flatMap((ch) => {
  const bytes = [...Buffer.from(ch)];
  return bytes.slice(1).map((_, i) => ({ ch, head: bytes.slice(0, i + 1), rest: bytes.slice(i + 1) }));
});

describe('a character split between two reads', () => {
  it.each(splits)('$ch cut after $head.length byte(s) of a growth read shows as itself', ({ ch, head, rest }) => {
    fs.writeFileSync(file, 'the run started\n');
    shown();
    append([...Buffer.from('it cost '), ...head]);
    expect(shown()).not.toContain(BROKEN);
    append([...rest, ...Buffer.from(' in the end\n')]);
    const text = shown();
    expect(text).toBe(`the run started\nit cost ${ch} in the end\n`);
    expect(text).toBe(whole());
  });

  it.each(splits)('$ch cut after $head.length byte(s) of a first read shows as itself', ({ ch, head, rest }) => {
    fs.writeFileSync(file, Buffer.from([...Buffer.from('it cost '), ...head]));
    expect(shown()).toBe('it cost ');
    append([...rest, ...Buffer.from('\n')]);
    expect(shown()).toBe(`it cost ${ch}\n`);
  });

  it('a character written one byte at a time between reads never shows broken', () => {
    fs.writeFileSync(file, 'faces: ');
    shown();
    for (const ch of ['😀', '€', 'é', '😀']) {
      for (const b of Buffer.from(ch)) {
        append([b]);
        const text = shown();
        expect(text).not.toContain(BROKEN);
        expect(text).toBe(whole());
      }
    }
    expect(shown()).toBe('faces: 😀€é😀');
  });

  it('a read that ends on a whole character sends all of it, and the next read is marked the same', () => {
    fs.writeFileSync(file, 'start\n');
    shown();
    append([...Buffer.from('it cost €')]);
    const grew = traceAnswer({ fs, file, startedAt, had: read.have(key)[startedAt] });
    expect(grew.more).toBe('it cost €');
    expect(grew.stamp.split(':')[0]).toBe(String(fs.statSync(file).size));
    read.take(key, { ok: true, sessions: [grew] });
    expect(traceAnswer({ fs, file, startedAt, had: read.have(key)[startedAt] }).same).toBe(true);
  });

  it.each([
    ['a byte no character starts with', [0xff]],
    ['a stray continuation byte', [0x80]],
  ])('a log ending in %s is not held back waiting for more', (_, tail) => {
    fs.writeFileSync(file, 'start\n');
    shown();
    append([...Buffer.from('odd '), ...tail]);
    const text = shown();
    expect(text).toBe(`start\nodd ${BROKEN}`);
    expect(text).toBe(whole());
    expect(traceAnswer({ fs, file, startedAt, had: read.have(key)[startedAt] }).same).toBe(true);
  });
});
