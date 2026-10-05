// WHICH COMMANDS ARE HEAVY ON THIS MAC, LEARNED FROM WHAT THEY DID (w-3958c3753d).
//
// NOTHING HERE KNOWS WHAT ANY PROGRAM IS. The first proposal for holding heavy
// work back matched names (npm, pytest, xcodebuild) and the founder turned it
// down: another package manager, a script run directly, a training job, and a
// list of names is wrong. So a command is filed under what it is (its program
// and the first word after it that is not a flag) and judged by what it was
// measured using, here, the last few times it ran.
//
// THE ONE RULE THAT IS NOT NEGOTIABLE: missing evidence never makes a command
// light. Light means "seen light, more than once, and never heavy since". One
// heavy run is enough to make that exact command heavy. A program that has been
// light every time across many different arguments lends that to an argument
// it has not seen, and stops the moment one of its runs is not light.
//
// A RUN THAT ENDED INSIDE 2 SECONDS AND WAS NEVER SEEN BIG COUNTS AS LIGHT.
// Measured on 2026-10-04 across 30 recent agent sessions (2006 commands): the
// median command ran 1.3 s, so most finish between two samples and would never
// be measured at all. A command that short cannot hold memory long enough to
// starve anything, which is the whole of what this gate is for. A command sent
// to the background is the exception: its tool call returns at once while its
// process carries on, so its quickness proves nothing.
//
// The five lines of shell knowledge below are about the SHELL, not about any
// program: builtins start nothing, and time/nice/env/timeout/nohup only run the
// command after them.

const BUILTINS = new Set(['cd', 'export', 'echo', 'printf', 'true', 'false', 'test', '[', '[[', ']]', 'set', 'unset',
  'pwd', 'read', 'exit', 'return', 'shift', 'wait', ':', 'alias', 'type', 'local', 'declare', 'pushd', 'popd', 'umask']);
const WRAPPERS = new Set(['time', 'nice', 'env', 'timeout', 'nohup', 'caffeinate', 'exec', 'command']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const REDIRECT = /^\d*(>>?|<<?<?|&>>?|>&|<&)/;

/** Light below this many MB at its sampled peak, heavy at or above HEAVY_MB. */
export const LIGHT_MB = 150;
export const HEAVY_MB = 400;
/** A run this short, never seen big, counts as light. */
export const QUICK_MS = 2_000;

/**
 * Split a shell command into the programs it starts, as `program firstArg`
 * keys, without running or fully parsing it. `opaque` is true when part of it
 * is computed at run time ($(...) or backticks outside single quotes), which
 * this cannot see into.
 */
export function commandSegments(command) {
  const text = String(command ?? '');
  const segments = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  let opaque = false;
  const heredocs = [];
  const endWord = () => {
    if (inWord) words.push(word);
    word = ''; inWord = false;
  };
  const endSegment = () => { endWord(); if (words.length) segments.push(words); words = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = null; else word += c;
      continue;
    }
    if (c === '\\' && i + 1 < text.length) { word += text[++i]; inWord = true; continue; }
    if (quote === '"') {
      if (c === '"') quote = null;
      else {
        if (c === '`' || (c === '$' && text[i + 1] === '(')) opaque = true;
        word += c;
      }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; inWord = true; continue; }
    if (c === '`' || (c === '$' && text[i + 1] === '(')) opaque = true;
    if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      // A here-document: its body is text handed to a program, not commands.
      endWord();
      let j = i + 2;
      if (text[j] === '-') j++;
      while (text[j] === ' ') j++;
      let delim = '';
      while (j < text.length && !/[\s;&|]/.test(text[j])) delim += text[j++];
      heredocs.push(delim.replace(/^['"]|['"]$/g, ''));
      i = j - 1;
      continue;
    }
    if (c === '\n') {
      endSegment();
      while (heredocs.length) {
        const delim = heredocs.shift();
        let end = text.indexOf('\n', i + 1);
        while (true) {
          const line = text.slice(i + 1, end === -1 ? text.length : end);
          i = end === -1 ? text.length : end;
          if (line.trim() === delim || end === -1) break;
          end = text.indexOf('\n', i + 1);
        }
      }
      continue;
    }
    if (c === ';' || c === '|' || (c === '&' && !/[<>]$/.test(word) && text[i + 1] !== '>')) {
      endSegment();
      if ((c === '|' || c === '&') && text[i + 1] === c) i++;
      continue;
    }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    word += c; inWord = true;
  }
  endSegment();

  const keys = [];
  for (const seg of segments) {
    const key = keyOf(seg);
    if (key) keys.push(key);
  }
  return { keys, opaque };
}

function keyOf(segmentWords) {
  const words = [];
  for (let i = 0; i < segmentWords.length; i++) {
    const w = segmentWords[i];
    if (REDIRECT.test(w)) {
      // `> out.txt` carries its target as the next word; `>out.txt` does not.
      if (/^\d*(>>?|<|&>>?)$/.test(w)) i++;
      continue;
    }
    if (w === '(' || w === ')' || w === '{' || w === '}' || w === '!') continue;
    words.push(w);
  }
  let i = 0;
  while (i < words.length && ASSIGNMENT.test(words[i])) i++;
  while (i < words.length && WRAPPERS.has(basename(words[i]))) {
    i++;
    while (i < words.length && (words[i].startsWith('-') || /^\d+(\.\d+)?[smhd]?$/.test(words[i]) || ASSIGNMENT.test(words[i]))) i++;
  }
  if (i >= words.length) return null;
  const program = basename(words[i]);
  if (!program || BUILTINS.has(program)) return null;
  const arg = words.slice(i + 1).find((w) => !w.startsWith('-'));
  return arg ? `${program} ${arg.slice(0, 80)}` : program;
}

function basename(p) {
  const s = String(p);
  const at = s.lastIndexOf('/');
  return at === -1 ? s : s.slice(at + 1);
}

const programOf = (key) => key.split(' ')[0];

/**
 * The learned record. Each key and each program keeps its last ten
 * observations as letters: l light, m in between, h heavy, ? not measured.
 * Both maps are kept in least-recently-seen-first order so the oldest falls off
 * first when either passes `maxKeys`.
 */
export class CommandHistory {
  constructor({ lightMb = LIGHT_MB, heavyMb = HEAVY_MB, maxKeys = 2_000 } = {}) {
    this.lightMb = lightMb;
    this.heavyMb = heavyMb;
    this.maxKeys = maxKeys;
    this.keys = new Map();
    this.programs = new Map();
  }

  /** What one finished run tells us. `peakMb` null means it was never sampled. */
  record(command, { peakMb = null, durationMs = null, background = false } = {}) {
    const { keys, opaque } = commandSegments(command);
    if (!keys.length) return;
    let obs;
    if (typeof peakMb === 'number' && Number.isFinite(peakMb)) {
      obs = peakMb >= this.heavyMb ? 'h' : peakMb < this.lightMb ? 'l' : 'm';
    } else {
      obs = !background && typeof durationMs === 'number' && durationMs < QUICK_MS ? 'l' : '?';
    }
    // A chain's memory belongs to the chain: `git status && npm test` measured
    // heavy says nothing bad about `git status`. Only a light chain vouches for
    // each of its parts.
    if (keys.length > 1 || opaque) {
      this._push(this.keys, chainKey(keys, opaque), obs);
      if (obs !== 'l') return;
    }
    for (const key of keys) {
      this._push(this.keys, key, obs);
      this._push(this.programs, programOf(key), obs);
    }
  }

  /** 'light' | 'unknown' | 'heavy' for a command about to run. */
  classify(command) {
    const { keys, opaque } = commandSegments(command);
    if (!keys.length && !opaque) return 'light';
    let verdict = 'light';
    const worse = (v) => {
      if (v === 'heavy' || verdict === 'heavy') verdict = 'heavy';
      else if (v === 'unknown') verdict = 'unknown';
    };
    if (keys.length > 1 || opaque) {
      const chain = this.keys.get(chainKey(keys, opaque));
      if (chain?.slice(-5).includes('h')) return 'heavy';
      if (opaque) worse('unknown');
    }
    for (const key of keys) worse(this._classifyKey(key));
    return verdict;
  }

  _classifyKey(key) {
    const own = this.keys.get(key);
    const recent = own?.slice(-5) ?? [];
    if (recent.includes('h')) return 'heavy';
    if (own && own.length >= 2 && recent.every((o) => o === 'l')) return 'light';
    if (recent.some((o) => o !== 'l')) return 'unknown';
    const prog = this.programs.get(programOf(key));
    if (prog && prog.length >= 5 && prog.slice(-10).every((o) => o === 'l')) return 'light';
    return 'unknown';
  }

  _push(map, key, obs) {
    const list = map.get(key) ?? [];
    map.delete(key);
    list.push(obs);
    map.set(key, list.slice(-10));
    while (map.size > this.maxKeys) map.delete(map.keys().next().value);
  }

  toJSON() {
    return { v: 1, keys: [...this.keys], programs: [...this.programs] };
  }

  /** Anything unreadable is an empty history, which only means "unknown". */
  static fromJSON(raw, opts) {
    const h = new CommandHistory(opts);
    if (!raw || raw.v !== 1) return h;
    const load = (map, entries) => {
      if (!Array.isArray(entries)) return;
      for (const e of entries) {
        if (Array.isArray(e) && typeof e[0] === 'string' && Array.isArray(e[1])) {
          map.set(e[0], e[1].filter((o) => ['l', 'm', 'h', '?'].includes(o)).slice(-10));
        }
      }
    };
    load(h.keys, raw.keys);
    load(h.programs, raw.programs);
    return h;
  }
}

function chainKey(keys, opaque) {
  return `${opaque ? '$( ' : ''}${keys.join(' && ')}`;
}
