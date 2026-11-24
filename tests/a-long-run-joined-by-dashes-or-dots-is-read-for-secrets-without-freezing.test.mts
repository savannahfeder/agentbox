// A long run joined by dashes or dots is read for secrets without freezing the app.
//
// 2026-11-24: after the file-path pattern was fixed, two more patterns in the
// same pass still cost time growing with the square of a run's length. The
// key-shaped-word one tried a key at every dash and read the whole run each
// time; the `password=` one tried a name at every dot or dash and read back
// over the whole run for "password", "secret" and the rest. Measured on the
// cloud machine: 300 KB of hex in groups of four joined by dashes took 107 s
// of processor, 50 KB joined by dots took 1.7 s, 50 KB of url-safe base64
// joined by dashes took 2.1 s.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { hideSecrets, hideNamed, hideKeyShaped } from '../shared/phone-snapshot.mts';

// The patterns as they were: what is hidden must still be, character for character.
const KEYLIKE_AS_IT_WAS = /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{32,}\b/g;
const STRONG = '[A-Za-z0-9_.-]*(?:passw(?:or)?d|passphrase|secret|api[_-]?key|access[_-]?key|private[_-]?key|credentials?|authorization|(?:auth|access|refresh|session|bearer|id)[_-]?token)[A-Za-z0-9_.-]*';
const VALUE = '(?:"((?:[^"\\\\\\n]|\\\\.)*)"|\'((?:[^\'\\\\\\n]|\\\\.)*)\'|([^\\s"\',;]+))';
const NAMED_STRONG_AS_IT_WAS = new RegExp(`\\b(${STRONG})(["']?\\s*[:=]\\s*)${VALUE}`, 'gi');
const NAMED_WEAK = new RegExp(`\\b((?:[A-Z0-9_]*TOKEN[A-Z0-9_]*|token))(["']?\\s*[:=]\\s*)${VALUE}`, 'g');
type Quoted = string | undefined;
const hidden = (name: string, sep: string, dq: Quoted, sq: Quoted): string => `${name}${sep}${dq !== undefined ? '"[hidden]"' : sq !== undefined ? "'[hidden]'" : '[hidden]'}`;
function hideNamedAsItWas(text: string): string {
  const out = text.replace(NAMED_STRONG_AS_IT_WAS, (m: string, name: string, sep: string, dq: Quoted, sq: Quoted, bare: Quoted) => (bare === '[hidden]' ? m : hidden(name, sep, dq, sq)));
  return out.replace(NAMED_WEAK, (m: string, name: string, sep: string, dq: Quoted, sq: Quoted, bare: Quoted) => {
    const value = dq ?? sq ?? bare ?? '';
    const envStyle = name !== 'token' && name === name.toUpperCase() && !/^[0-9]+$/.test(value);
    const keyLike = value.length >= 16 && /[0-9]/.test(value) && !/\s/.test(value);
    return value !== '[hidden]' && (envStyle || keyLike) ? hidden(name, sep, dq, sq) : m;
  });
}
const hex = (bytes: number) => crypto.randomBytes(bytes).toString('hex');

const cpuMs = (fn: () => unknown): number => {
  const from = process.cpuUsage();
  fn();
  const used = process.cpuUsage(from);
  return (used.user + used.system) / 1000;
};
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const PIECES = ['a', 'Q', '7', '_', '-', '.', ' ', '"', "'", '=', ':', '\n', ',', ';', '\\', '/', 'é',
  'password', 'PASSWD', 'secret', 'api-key', 'api_key', 'apikey', 'auth_token', 'idToken', 'credential', 'credentials', 'Authorization',
  'XyZ12abcDEF34ghiJKL56mnoPQR78stuVW', 'aB3', '[hidden]', 'pass', 'word'];
function someText(rand: () => number): string {
  let out = '';
  const pieces = 1 + Math.floor(rand() * 40);
  for (let n = 0; n < pieces; n += 1) {
    const piece = PIECES[Math.floor(rand() * PIECES.length)]!;
    const times = rand() < 0.15 ? [2, 5, 31, 32, 33, 40][Math.floor(rand() * 6)]! : 1;
    out += piece.repeat(piece.length === 1 ? times : 1);
  }
  return out;
}

describe('a long run joined by dashes or dots', () => {

  it('costs 300 KB of hex joined by dashes a fraction of a second', () => {
    const text = hex(150_000).replace(/(.{4})/g, '$1-');
    // 107 s of processor before.
    expect(cpuMs(() => hideSecrets(text))).toBeLessThan(300);
  });

  it('costs 300 KB of hex joined by dots a fraction of a second', () => {
    const text = hex(150_000).replace(/(.{4})/g, '$1.');
    expect(cpuMs(() => hideSecrets(text))).toBeLessThan(300);
  });

  it('costs 300 KB of url-safe base64 joined by dashes a fraction of a second', () => {
    const text = crypto.randomBytes(225_000).toString('base64url').replace(/(.{3})/g, '$1-');
    expect(cpuMs(() => hideSecrets(text))).toBeLessThan(300);
  });
});

describe('what is hidden is what was hidden', () => {
  it('for a key-shaped word, in every mix of runs, dashes and cases', () => {
    const rand = seeded(20261124);
    for (let n = 0; n < 4000; n += 1) {
      const text = someText(rand);
      expect(hideKeyShaped(text), JSON.stringify(text)).toBe(text.replace(KEYLIKE_AS_IT_WAS, '[hidden]'));
    }
  });

  it('for a value given a secret\'s name, in every mix of names, quotes and separators', () => {
    const rand = seeded(1124);
    for (let n = 0; n < 4000; n += 1) {
      const text = someText(rand);
      expect(hideNamed(text), JSON.stringify(text)).toBe(hideNamedAsItWas(text));
    }
  });

  it('still hides a key in a dashed run, and spares one that is too short or one case', () => {
    const key = 'XyZ12abcDEF34ghiJKL56mnoPQR78stuVW';
    expect(hideKeyShaped(`--${key}-- x`)).toBe('--[hidden]-- x');
    expect(hideKeyShaped(`${'aB3'.repeat(10)}a`)).toBe(`${'aB3'.repeat(10)}a`);
    expect(hideKeyShaped(`${'aB3'.repeat(10)}ab`)).toBe('[hidden]');
    const commit = hex(20);
    expect(hideKeyShaped(commit)).toBe(commit);
    const uuid = crypto.randomUUID();
    expect(hideKeyShaped(uuid)).toBe(uuid);
  });

  it('still hides a value after a dotted or dashed secret name, and not after a plain one', () => {
    expect(hideNamed('db.password=hunter22 next')).toBe('db.password=[hidden] next');
    expect(hideNamed('.-x-api-key: "a b c"')).toBe('.-x-api-key: "[hidden]"');
    expect(hideNamed('foo=password=abc')).toBe('foo=password=[hidden]');
    expect(hideNamed('db.host=localhost')).toBe('db.host=localhost');
  });
});
