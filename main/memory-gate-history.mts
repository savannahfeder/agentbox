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
// light. Light means "measured light, more than once, and never heavy since".
// One heavy run is enough to make that exact command heavy. A program that has
// been light every time it was measured, across many different arguments, lends
// that to an argument it has not seen, and stops the moment one of its runs is
// measured as anything else.
//
// AND MISSING EVIDENCE DOES NOT MAKE A COMMAND HEAVY EITHER (w-b689e9fc0c). A
// run nothing measured is filed as `?` and read as nothing at all, rather than
// as a run that might have been big: see `measured` below for what that cost.
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

// `kill` is one too, and the one that must never wait: it is how a thread
// gives memory back when asked (main/memory-give-back.mts).
const BUILTINS = new Set(['cd', 'export', 'echo', 'printf', 'true', 'false', 'test', '[', '[[', ']]', 'set', 'unset',
  'pwd', 'read', 'exit', 'return', 'shift', 'wait', ':', 'alias', 'type', 'local', 'declare', 'pushd', 'popd', 'umask', 'kill']);
const WRAPPERS = new Set(['time', 'nice', 'env', 'timeout', 'nohup', 'caffeinate', 'exec', 'command']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const REDIRECT = /^\d*(>>?|<<?<?|&>>?|>&|<&)/;

/** Light below this many MB at its sampled peak, heavy at or above HEAVY_MB, on the 16 GB they were measured on. */
export const LIGHT_MB = 150;
export const HEAVY_MB = 400;
const MEASURED_ON_MB = 16 * 1024;

/**
 * The two lines for a computer with `ramMb` of memory: the same shares of it
 * that 150 and 400 MB are of 16 GB. What a command takes is learned on each
 * computer from its own runs; a line in megabytes would judge an 8 GB laptop
 * and a 64 GB desktop as if they were that one Mac. A size that cannot be
 * read leaves the measured lines.
 */
export function linesFor(ramMb: unknown): { lightMb: number; heavyMb: number } {
  const ram = typeof ramMb === 'number' && Number.isFinite(ramMb) && ramMb > 0 ? ramMb : MEASURED_ON_MB;
  return { lightMb: Math.round(LIGHT_MB * ram / MEASURED_ON_MB), heavyMb: Math.round(HEAVY_MB * ram / MEASURED_ON_MB) };
}
/** A run this short, never seen big, counts as light. */
export const QUICK_MS = 2_000;
/**
 * A command, or a program lending to an argument nobody has seen, is not
 * light once this many of its last ten chain runs were chains measured heavy.
 * Replayed over a week of one 16 GB Mac, three caught 4 more heavy commands
 * and held 34 more small ones, and five caught the same as four.
 */
export const HEAVY_CHAINS = 4;
/** How many runs of each kind a record keeps: measured alone, and seen in a chain. */
const KEPT = 10;

/**
 * Split a shell command into the programs it starts, as `program firstArg`
 * keys, without running or fully parsing it. What `$(...)` runs is read like
 * the rest, its programs filed before the command it sits in. `opaque` is true
 * when part of it cannot be seen into: backticks, or a `$(` that never closes.
 */
export function commandSegments(command: unknown): { keys: string[]; opaque: boolean } {
  const text = String(command ?? '');
  const keys: string[] = [];
  let opaque = false;
  // One `$(` never closed and the rest are left as text: each would read the
  // rest of the command again, twice the work for every one of them.
  let unclosed = false;

  // Reads from `from` to the end of the text, or, inside a `$(`, to the `)`
  // that closes it. Answers where it stopped, or -1 inside one never closed.
  const scan = (from: number, nested = 0): number => {
    const inside = nested > 0;
    // Deeper than anyone types; past it the command is one this cannot see into.
    if (nested > 32) return -1;
    const segments: string[][] = [];
    let words: string[] = [];
    let word = '';
    let inWord = false;
    let quote: string | null = null;
    let depth = 0;
    const heredocs: string[] = [];
    const endWord = () => {
      if (inWord) words.push(word);
      word = ''; inWord = false;
    };
    const endSegment = () => { endWord(); if (words.length) segments.push(words); words = []; };
    const file = () => {
      endSegment();
      for (const seg of segments) {
        const key = keyOf(seg);
        if (key) keys.push(key);
      }
    };

    for (let i = from; i < text.length; i++) {
      const c = text[i];
      if (quote === "'") {
        if (c === "'") quote = null; else word += c;
        continue;
      }
      if (c === '\\' && i + 1 < text.length) { word += text[++i]; inWord = true; continue; }
      if (c === '`') opaque = true;
      if (c === '$' && text[i + 1] === '(' && !unclosed) {
        // `$((` is arithmetic and starts nothing.
        const arithmetic = text[i + 2] === '(';
        const close = arithmetic ? text.indexOf('))', i + 3) : scan(i + 2, nested + 1);
        if (close === -1) { opaque = true; unclosed = true; } else {
          const end = arithmetic ? close + 1 : close;
          word += text.slice(i, end + 1);
          inWord = true;
          i = end;
          continue;
        }
      }
      if (quote === '"') {
        if (c === '"') quote = null; else word += c;
        continue;
      }
      if (c === "'" || c === '"') { quote = c; inWord = true; continue; }
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
      if (c === ')' && inside && depth === 0) { file(); return i; }
      if (c === '(') depth++;
      else if (c === ')' && depth > 0) depth--;
      word += c; inWord = true;
    }
    if (inside) return -1;
    file();
    return text.length;
  };
  scan(0);
  return { keys, opaque };
}

function keyOf(segmentWords: string[]): string | null {
  const words: string[] = [];
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

function basename(p: unknown): string {
  const s = String(p);
  const at = s.lastIndexOf('/');
  return at === -1 ? s : s.slice(at + 1);
}

const programOf = (key: string) => key.split(' ')[0];

/**
 * The observations that are evidence, which is all of them but `?`.
 *
 * `?` IS THE ABSENCE OF EVIDENCE AND IS READ AS NOTHING AT ALL (w-b689e9fc0c).
 * It used to count against a command: `git branch` stood at "lllll?llll", nine
 * light runs and one that nothing measured, and the single `?` inside the last
 * five made every `git branch` command `unknown` — and because the command's own
 * record had answered, the `git` program record, ten light runs with nothing else
 * in it, was never reached. On a 16 GB M4 on 2026-10-07 that put
 * `git fetch -q origin | tail -2; git branch -r --contains <sha> | head -3`
 * behind one of two slots for 89 seconds to use 0 MB. One unmeasured run held
 * that command back for its next nine, and a loaded Mac is precisely where runs
 * go unmeasured, so the gate made itself hold more and more.
 *
 * The rule it must not break is the one above: missing evidence never makes a
 * command light. It cannot, because a `?` is dropped rather than counted, and
 * what is left still has to be light and still has to be more than one run.
 */
const measured = (list?: string[] | null) => (list ?? []).filter((o) => o !== '?');

/**
 * Light, however it was learned: `l` measured on its own, `c` only as part of
 * a chain. Read the same everywhere, so `c` changes no verdict; it is there to
 * be counted. Pinned by
 * tests/the-record-says-whether-it-learned-light-from-a-chain.test.mts.
 */
const isLight = (o: string) => o === 'l' || o === 'c';

/**
 * What a chain said of its parts: `c` it came out light, `H` it came out
 * heavy. Neither says which part did it, so they are kept apart from the runs
 * measured alone and never push one out: ten light chains used to push out
 * the one heavy reading a test run had on its own.
 */
const isChainMark = (o: string) => o === 'c' || o === 'H';
const alone = (list?: string[] | null) => (list ?? []).filter((o) => !isChainMark(o));
const chainMarks = (list?: string[] | null) => (list ?? []).filter(isChainMark);
const heavyChains = (list?: string[] | null) => chainMarks(list).filter((o) => o === 'H').length;

/**
 * The last `KEPT` of each kind, in the order they came. Of the runs alone, one
 * nobody measured goes before one somebody did: it is no evidence, and must
 * not be what pushes evidence out.
 */
function lastOfEachKind(list: string[]): string[] {
  const out = [...list];
  for (let over = chainMarks(out).length - KEPT; over > 0; over--) out.splice(out.findIndex(isChainMark), 1);
  for (let over = alone(out).length - KEPT; over > 0; over--) {
    const unmeasured = out.indexOf('?');
    out.splice(unmeasured === -1 ? out.findIndex((o) => !isChainMark(o)) : unmeasured, 1);
  }
  return out;
}

/**
 * The learned record. Each key and each program keeps its last ten runs
 * measured alone and its last ten seen in a chain, as letters: l light, m in
 * between, h heavy, ? not measured; c in a chain that came out light, H in one
 * that came out heavy. A build that predates `c` or `H` drops it on load,
 * which costs those runs as evidence; it cannot call anything light that is
 * not.
 * Both maps are kept in least-recently-seen-first order so the oldest falls off
 * first when either passes `maxKeys`.
 */
export type Verdict = 'light' | 'unknown' | 'heavy';

export interface CommandHistoryOptions {
  lightMb?: number;
  heavyMb?: number;
  maxKeys?: number;
  /** This computer's memory, which the two lines are shares of (`linesFor`). */
  ramMb?: number;
}

/** How many sizes a command keeps. */
const SIZES_KEPT = 5;

/** The middle of a list of sizes, or null for none. */
function middle(list?: number[] | null): number | null {
  if (!list?.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2);
}

export interface RecordOptions {
  peakMb?: number | null;
  durationMs?: number | null;
  background?: boolean;
  onlyIfLight?: boolean;
}

export class CommandHistory {
  declare lightMb: number;
  declare heavyMb: number;
  declare maxKeys: number;
  declare keys: Map<string, string[]>;
  declare programs: Map<string, string[]>;
  /** What a key took, in MB, the last few times it was measured as itself and was not light. */
  declare sizes: Map<string, number[]>;
  /** What the heavy chains that marked a key took. */
  declare chainSizes: Map<string, number[]>;

  constructor({ ramMb, lightMb = linesFor(ramMb).lightMb, heavyMb = linesFor(ramMb).heavyMb, maxKeys = 2_000 }: CommandHistoryOptions = {}) {
    this.lightMb = lightMb;
    this.heavyMb = heavyMb;
    this.maxKeys = maxKeys;
    this.keys = new Map();
    this.programs = new Map();
    this.sizes = new Map();
    this.chainSizes = new Map();
  }

  /**
   * What one finished run tells us. `peakMb` null means it was never sampled.
   * Answers whether anything was filed.
   *
   * `onlyIfLight` is for a run whose memory reading belonged to several
   * commands at once: one `codex app-server` serves every Codex thread of a
   * login, so two Codex commands running together are measured together
   * (w-5601e99977). How long each took is still its own, so a quick one is
   * light on that alone — and anything else from such a run is dropped rather
   * than filed as "not measured", because that would un-learn a command this
   * app has seen light before, and missing evidence must never move a command
   * either way.
   */
  record(command: unknown, { peakMb = null, durationMs = null, background = false, onlyIfLight = false }: RecordOptions = {}): boolean {
    const { keys, opaque } = commandSegments(command);
    if (!keys.length) return false;
    let obs: string;
    if (typeof peakMb === 'number' && Number.isFinite(peakMb)) {
      obs = peakMb >= this.heavyMb ? 'h' : peakMb < this.lightMb ? 'l' : 'm';
    } else {
      obs = !background && typeof durationMs === 'number' && durationMs < QUICK_MS ? 'l' : '?';
    }
    if (onlyIfLight && obs !== 'l') return false;
    // A chain's memory belongs to the chain: `git status && npm test` measured
    // heavy does not say `git status` is heavy. A light chain vouches for each
    // of its parts (`c`), and a heavy one marks each (`H`): agents pipe nearly
    // everything, so parts that only ever heard of the light chains read light
    // for good. Enough marks and a part is no longer light (`HEAVY_CHAINS`).
    // A size is kept only for a run that was not light: it is there to say how
    // much room a command needs, and a light one needs none worth counting.
    const size = obs === 'm' || obs === 'h' ? Math.round(peakMb as number) : null;
    if (keys.length > 1 || opaque) {
      const whole = chainKey(keys, opaque);
      this._push(this.keys, whole, obs);
      if (size !== null) this._keepSize(this.sizes, whole, size);
      if (obs === 'l') {
        for (const key of keys) {
          this._push(this.keys, key, 'c');
          this._push(this.programs, programOf(key), 'c');
        }
      } else if (obs === 'h') {
        const marked = [...new Set(keys)].filter((key) => !this._clearedAlone(key));
        for (const key of marked) {
          this._push(this.keys, key, 'H');
          this._keepSize(this.chainSizes, key, size!);
        }
        for (const program of new Set(marked.map(programOf))) this._push(this.programs, program, 'H');
      }
      return true;
    }
    for (const key of keys) {
      this._push(this.keys, key, obs);
      this._push(this.programs, programOf(key), obs);
      if (size !== null) this._keepSize(this.sizes, key, size);
    }
    return true;
  }

  /**
   * How many MB this command usually took on this computer when it was not
   * light, or null when nothing here says: its own record first, the only
   * reading that covered everything it starts, then the biggest of its parts
   * that are not light. A record from before sizes were kept answers with the
   * line its letter crossed.
   */
  usualMb(command: unknown): number | null {
    const { keys, opaque } = commandSegments(command);
    if (!keys.length) return null;
    const own = middle(this.sizes.get(keys.length > 1 || opaque ? chainKey(keys, opaque) : keys[0]));
    if (own !== null) return own;
    let most: number | null = null;
    for (const key of new Set(keys)) {
      if (this._classifyKey(key) === 'light') continue;
      const weight = middle(this.sizes.get(key)) ?? middle(this.chainSizes.get(key)) ?? this._lineCrossed(key);
      if (weight !== null && (most === null || weight > most)) most = weight;
    }
    return most;
  }

  _lineCrossed(key: string): number | null {
    const own = this.keys.get(key) ?? [];
    if (own.includes('h') || own.includes('H')) return this.heavyMb;
    return own.includes('m') ? this.lightMb : null;
  }

  _keepSize(map: Map<string, number[]>, key: string, mb: number) {
    const list = map.get(key) ?? [];
    list.push(mb);
    map.set(key, list.slice(-SIZES_KEPT));
  }

  /** 'light' | 'unknown' | 'heavy' for a command about to run. */
  classify(command: unknown): Verdict {
    const { keys, opaque } = commandSegments(command);
    if (!keys.length && !opaque) return 'light';
    let verdict: Verdict = 'light';
    const worse = (v: Verdict) => {
      if (v === 'heavy' || verdict === 'heavy') verdict = 'heavy';
      else if (v === 'unknown') verdict = 'unknown';
    };
    // A command's own record outranks the records of its parts: it is the only
    // reading that covered everything the command starts, and a chain never
    // says which part did it (see `record`). The key is coarser than the command, so an old
    // heavy run also holds back cheap variants that share it; that is the
    // price. A middling run only keeps the command out of the light lane, where
    // `lightLane` of them would start together, and `_holdsSlot` hands the slot
    // back once a run measures small.
    const own = measured(alone(this.keys.get(keys.length > 1 || opaque ? chainKey(keys, opaque) : keys[0])));
    if (own.includes('h')) return 'heavy';
    if (own.includes('m')) worse('unknown');
    if (opaque) worse('unknown');
    for (const key of keys) worse(this._classifyKey(key));
    return verdict;
  }

  /**
   * What it was measured as alone comes first. Then the chains it was part
   * of: marked heavy `HEAVY_CHAINS` times in ten it is not light, and two
   * light runs of either kind make it light. With too little of its own, its
   * program lends light on five runs, none measured anything else.
   */
  _classifyKey(key: string): Verdict {
    const own = this.keys.get(key);
    const recent = measured(alone(own)).slice(-5);
    if (recent.includes('h')) return 'heavy';
    if (recent.some((o) => !isLight(o))) return 'unknown';
    if (heavyChains(own) >= HEAVY_CHAINS) return 'unknown';
    if (recent.length + chainMarks(own).slice(-5).filter(isLight).length >= 2) return 'light';
    const program = this.programs.get(programOf(key));
    if (heavyChains(program) >= HEAVY_CHAINS) return 'unknown';
    const direct = measured(alone(program));
    if (direct.some((o) => !isLight(o))) return 'unknown';
    return direct.length + chainMarks(program).filter(isLight).length >= 5 ? 'light' : 'unknown';
  }

  /**
   * A part a heavy chain is not held against: never measured alone itself,
   * and its program measured alone five times or more, light every time.
   * That is `tail` on the end of a test run. A part with runs of its own is
   * marked however light they were: `npm run lint` and `npm run build` are
   * filed under one key.
   */
  _clearedAlone(key: string): boolean {
    if (measured(alone(this.keys.get(key))).length) return false;
    const direct = measured(alone(this.programs.get(programOf(key))));
    return direct.length >= 5 && direct.every(isLight);
  }

  _push(map: Map<string, string[]>, key: string, obs: string) {
    const list = map.get(key) ?? [];
    map.delete(key);
    list.push(obs);
    map.set(key, lastOfEachKind(list));
    while (map.size > this.maxKeys) this._forget(map);
  }

  /**
   * Past the limit the least recently seen goes, and while records of a single
   * run are more than half of all, the least recently seen of those. Four keys
   * in five are a search or a chain nobody runs twice, and they pushed
   * `npm run` out within hours, its heavy readings with it.
   */
  _forget(map: Map<string, string[]>) {
    let once = 0;
    for (const list of map.values()) if (list.length <= 1) once++;
    let gone: string = map.keys().next().value!;
    if (once * 2 > map.size) {
      for (const [key, list] of map) if (list.length <= 1) { gone = key; break; }
    }
    map.delete(gone);
    if (map === this.keys) {
      this.sizes.delete(gone);
      this.chainSizes.delete(gone);
    }
  }

  toJSON() {
    return { v: 1, keys: [...this.keys], programs: [...this.programs], sizes: [...this.sizes], chainSizes: [...this.chainSizes] };
  }

  /** Anything unreadable is an empty history, which only means "unknown". */
  static fromJSON(raw: { v?: unknown; keys?: unknown; programs?: unknown; sizes?: unknown; chainSizes?: unknown } | null | undefined, opts?: CommandHistoryOptions): CommandHistory {
    const h = new CommandHistory(opts);
    if (!raw || raw.v !== 1) return h;
    const loadSizes = (map: Map<string, number[]>, entries: unknown) => {
      if (!Array.isArray(entries)) return;
      for (const e of entries) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || !Array.isArray(e[1])) continue;
        const mbs = e[1].filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0).slice(-SIZES_KEPT);
        if (mbs.length) map.set(e[0], mbs);
      }
    };
    loadSizes(h.sizes, raw.sizes);
    loadSizes(h.chainSizes, raw.chainSizes);
    const load = (map: Map<string, string[]>, entries: unknown) => {
      if (!Array.isArray(entries)) return;
      for (const e of entries) {
        if (Array.isArray(e) && typeof e[0] === 'string' && Array.isArray(e[1])) {
          map.set(e[0], lastOfEachKind(e[1].filter((o) => ['l', 'c', 'm', 'h', '?', 'H'].includes(o))));
        }
      }
    };
    load(h.keys, raw.keys);
    load(h.programs, raw.programs);
    return h;
  }
}

function chainKey(keys: string[], opaque: boolean) {
  return `${opaque ? '$( ' : ''}${keys.join(' && ')}`;
}
