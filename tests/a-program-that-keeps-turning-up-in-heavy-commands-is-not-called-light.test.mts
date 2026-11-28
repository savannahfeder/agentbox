// A PROGRAM THAT KEEPS TURNING UP IN HEAVY COMMANDS IS NOT CALLED LIGHT.
//
// What broke: from 17 to 23 November 2026 the memory gate called 93 of the 145
// commands that went on to hold 400 MB or more "light" (35 of the 52 that
// passed 1 GB), so each started at once, whatever the memory: test runs,
// builds, a copy of the app. At 13:01 on 23 November a build it called light
// started while the Mac was already short and Agentbox was over its allowance.
// It took 2.2 GB, memory swapped at 15 MB a second, and the window answered a
// click after 4.6 s.
//
// Agents pipe nearly everything (`npx vitest run … | tail -5`), and a chain
// measured heavy told its parts nothing, while every chain measured light
// vouched for each of them. So the record for `npx vitest` read cccccccccc,
// light ten times and each time only inside a light chain, and those ten also
// pushed out the heavy reading from the one time it ran alone. What it did
// learn it forgot within hours: it remembers 2,000 commands, and 1,597 of
// them had been run once.
//
// The other half: a command carrying `$(...)` was never light, because the
// gate could not see into it. On a Mac whose agents put node on the path with
// `$(ls ~/.nvm/versions/node | tail -1)` that was nearly every node command,
// and 418 small commands that week were held as not light.
//
// Now a chain measured heavy marks each of its parts, a part marked in four of
// its last ten chain runs is not light, what was measured alone is kept apart
// from what was only seen in chains, a command run once is forgotten before
// one run often, and `$(...)` is read as the commands in it. The same week
// replayed from an empty record through the rule as shipped and as changed
// (6,776 commands logged whole): 11 heavy commands called light in place of
// 70, 3 over 1 GB in place of 26, and 355 small ones held in place of 356.
import { describe, expect, it } from 'vitest';
import { CommandHistory, commandSegments, HEAVY_CHAINS } from '../main/memory-gate-history.mts';

const letters = (map: Map<string, string[]>, key: string) => map.get(key)?.join('') ?? null;
const light = (h: CommandHistory, command: string, times = 1) => { for (let i = 0; i < times; i++) h.record(command, { peakMb: 30, durationMs: 5_000 }); };
const heavy = (h: CommandHistory, command: string, times = 1) => { for (let i = 0; i < times; i++) h.record(command, { peakMb: 1_400, durationMs: 60_000 }); };

/** `tail`, `head` and `git` as an agent's day leaves them: measured alone, many times, and light. */
function aDayOfReading() {
  const h = new CommandHistory();
  for (let i = 0; i < 6; i++) { light(h, `tail -20 /tmp/log${i}.txt`); light(h, `head -20 /tmp/log${i}.txt`); light(h, `git show ${i}`); }
  return h;
}

describe('a chain measured heavy marks its parts', () => {
  it('four of a part\'s last ten chain runs is where it stops being light', () => {
    expect(HEAVY_CHAINS).toBe(4);
    const h = aDayOfReading();
    // The measured case: the test run is light when it is one small file, and heavy when it is not.
    light(h, 'npx vitest run tests/a.test.mts 2>&1 | tail -5', 6);
    expect(h.classify('npx vitest run tests/b.test.mts 2>&1 | grep passed')).toBe('unknown');
    light(h, 'grep -c passed out.txt', 5);
    expect(h.classify('npx vitest run tests/b.test.mts 2>&1 | grep passed')).toBe('light');
    heavy(h, 'npx vitest run 2>&1 | tail -5', 3);
    expect(letters(h.keys, 'npx vitest')).toBe('ccccccHHH');
    expect(h.classify('npx vitest run tests/b.test.mts 2>&1 | grep passed')).toBe('light');
    heavy(h, 'npx vitest run 2>&1 | tail -5');
    expect(h.classify('npx vitest run tests/b.test.mts 2>&1 | grep passed')).toBe('unknown');
    expect(h.classify('npx vitest run tests/b.test.mts')).toBe('unknown');
  });

  it('and it is light again once light chains have pushed the marks back under four', () => {
    const h = aDayOfReading();
    light(h, 'npx vitest run tests/a.test.mts | tail -5', 6);
    heavy(h, 'npx vitest run | tail -5', 4);
    // Asked of another chain: the one measured heavy is heavy by its own record.
    expect(h.classify('npx vitest run tests/a.test.mts | tail -3')).toBe('heavy');
    expect(h.classify('npx vitest run tests/a.test.mts | head -3')).toBe('unknown');
    // Seven light chains later the ten it keeps hold three marks.
    light(h, 'npx vitest run tests/a.test.mts | grep -c ok', 6);
    expect(h.classify('npx vitest run tests/a.test.mts | head -3')).toBe('unknown');
    light(h, 'npx vitest run tests/a.test.mts | grep -c ok');
    expect(letters(h.keys, 'npx vitest')).toBe('HHHccccccc');
    expect(h.classify('npx vitest run tests/a.test.mts | head -3')).toBe('light');
  });

  it('one heavy chain condemns nothing', () => {
    const h = new CommandHistory();
    light(h, 'git status --short | head -5', 3);
    heavy(h, 'git status --short && npm test');
    expect(letters(h.keys, 'git status')).toBe('cccH');
    expect(h.classify('git status --short | head -5')).toBe('light');
    expect(h.classify('git status --short && npm test')).toBe('heavy');
  });

  it('a filter measured alone and light, time after time, is not marked at all', () => {
    const h = aDayOfReading();
    heavy(h, 'npx vitest run 2>&1 | tail -5', 6);
    // `tail` with nothing after it only ever runs in a pipe; `tail <file>` ran alone six times.
    expect(letters(h.keys, 'tail')).toBe(null);
    expect(letters(h.programs, 'tail')).toBe('llllll');
    expect(h.classify('git show 3 | tail -5')).toBe('light');
  });

  it('but a part that was itself measured alone is marked, however light those runs were', () => {
    // `npm run lint` alone is light and `npm run build` is not, and both are filed under `npm run`.
    const h = aDayOfReading();
    light(h, 'npm run lint', 5);
    heavy(h, 'npm run build 2>&1 | tail -3', 4);
    expect(letters(h.keys, 'npm run')).toBe('lllllHHHH');
    expect(h.classify('npm run build 2>&1 | head -8')).toBe('unknown');
    // The price of one name for both: the light one waits its turn too.
    expect(h.classify('npm run lint')).toBe('unknown');
  });

  it('a program in heavy chains under many names stops lending light to a name nobody has seen', () => {
    const h = aDayOfReading();
    for (let i = 0; i < 6; i++) light(h, `node -e "console.log(${i})" | tail -1`);
    expect(h.classify('node scripts/never-seen.mjs')).toBe('light');
    for (let i = 0; i < 3; i++) heavy(h, `node scripts/shot${i}.mjs | tail -2`);
    expect(h.classify('node scripts/never-seen.mjs')).toBe('light');
    heavy(h, 'node scripts/shot3.mjs | tail -2');
    expect(letters(h.programs, 'node')).toBe('ccccccHHHH');
    expect(h.classify('node scripts/never-seen.mjs')).toBe('unknown');
    // And the filter beside it is still light.
    expect(h.classify('git show 3 | tail -5')).toBe('light');
  });

  it('a chain in between, or never measured, marks nothing', () => {
    const h = new CommandHistory();
    h.record('npx vitest run a | tail -5', { peakMb: 250, durationMs: 9_000 });
    h.record('npx vitest run a | tail -5', { peakMb: null, durationMs: 9_000 });
    expect(letters(h.keys, 'npx vitest')).toBe(null);
    expect(letters(h.keys, 'npx vitest && tail')).toBe('m?');
  });
});

describe('what was measured alone is kept apart from what was only seen in chains', () => {
  it('ten light chains do not push out the heavy run a command had on its own', () => {
    const h = new CommandHistory();
    heavy(h, 'npx vitest run');
    light(h, 'npx vitest run tests/a.test.mts | tail -5', 10);
    expect(letters(h.keys, 'npx vitest')).toBe('hcccccccccc');
    expect(h.classify('npx vitest run tests/z.test.mts | grep ok')).toBe('heavy');
  });

  it('keeps the last ten of each kind, oldest out first', () => {
    const h = new CommandHistory();
    light(h, 'jq . a.json', 12);
    light(h, 'jq . a.json | head -1', 12);
    heavy(h, 'jq . a.json | head -1', 2);
    expect(letters(h.keys, 'jq .')).toBe(`${'l'.repeat(10)}${'c'.repeat(8)}HH`);
  });

  it('five runs alone since the heavy one, all light, and it is light again', () => {
    const h = new CommandHistory();
    heavy(h, 'make docs');
    light(h, 'make docs', 4);
    expect(h._classifyKey('make docs')).toBe('heavy');
    light(h, 'make docs');
    expect(h._classifyKey('make docs')).toBe('light');
  });

  it('runs nobody measured do not push the heavy one out either', () => {
    // 1,885 of the week's commands were never measured: a loaded Mac is where readings go missing.
    const h = new CommandHistory();
    heavy(h, 'make docs');
    for (let i = 0; i < 5; i++) h.record('make docs', { peakMb: null, durationMs: 30_000 });
    expect(letters(h.keys, 'make docs')).toBe('h?????');
    expect(h._classifyKey('make docs')).toBe('heavy');
    light(h, 'make docs', 4);
    expect(h._classifyKey('make docs')).toBe('heavy');
    light(h, 'make docs');
    expect(h._classifyKey('make docs')).toBe('light');
  });

  it('survives being written out and read back, marks included', () => {
    const h = aDayOfReading();
    light(h, 'npx vitest run a | tail -5', 6);
    heavy(h, 'npx vitest run | tail -5', 4);
    const back = CommandHistory.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
    expect(letters(back.keys, 'npx vitest')).toBe('ccccccHHHH');
    expect(back.classify('npx vitest run b | head -5')).toBe('unknown');
  });

  it('reads a longer record than it keeps as the last ten of each kind', () => {
    const raw = { v: 1, keys: [['npx vitest', `${'l'.repeat(14)}${'c'.repeat(9)}HHH`.split('')]], programs: [] };
    expect(letters(CommandHistory.fromJSON(raw).keys, 'npx vitest')).toBe(`${'l'.repeat(10)}${'c'.repeat(7)}HHH`);
  });
});

describe('what it forgets first', () => {
  // 1,597 of the 2,000 commands it remembered had been run once: a search, or a chain never typed again.
  it('a command run once goes before one run again and again', () => {
    const h = new CommandHistory({ maxKeys: 4 });
    heavy(h, 'npm run build', 2);
    for (const word of ['one', 'two', 'three', 'four']) light(h, `grep ${word} a.txt`);
    expect(letters(h.keys, 'npm run')).toBe('hh');
    expect(letters(h.keys, 'grep one')).toBe(null);
    expect(letters(h.keys, 'grep two')).toBe('l');
    expect(h.classify('npm run build')).toBe('heavy');
  });

  it('while those are half of what it holds or fewer, the least recently seen of all goes', () => {
    const h = new CommandHistory({ maxKeys: 4 });
    for (const name of ['a', 'b', 'c']) light(h, `${name} x`, 2);
    light(h, 'd x');
    light(h, 'e x');
    expect(letters(h.keys, 'a x')).toBe(null);
    expect(letters(h.keys, 'b x')).toBe('ll');
    expect(letters(h.keys, 'd x')).toBe('l');
    expect(letters(h.keys, 'e x')).toBe('l');
  });
});

describe('a command inside $(...) is read like any other', () => {
  it('files the programs inside it, after which nothing is hidden', () => {
    expect(commandSegments('export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH" && node scripts/x.mjs'))
      .toEqual({ keys: ['ls ~/.nvm/versions/node', 'tail', 'node scripts/x.mjs'], opaque: false });
    expect(commandSegments('echo $(npm test)')).toEqual({ keys: ['npm test'], opaque: false });
    expect(commandSegments('cd "$(git rev-parse --show-toplevel)" && npm run build').keys).toEqual(['git rev-parse', 'npm run']);
  });

  it('keeps the word it sits in as it was written', () => {
    expect(commandSegments('ls "$(dirname /tmp/x)"').keys).toEqual(['dirname /tmp/x', 'ls $(dirname /tmp/x)']);
  });

  it('reads one inside another, and a here-document inside one', () => {
    expect(commandSegments('echo "$(basename "$(git rev-parse --show-toplevel)")"').keys).toEqual(['git rev-parse', 'basename $(git rev-parse --show-toplevel)']);
    // The way agents write a commit message: its apostrophe, brackets and `npm test` are text, not commands.
    const commit = 'git commit -m "$(cat <<\'EOF\'\nIt\'s fixed (at last); npm test passes\nEOF\n)" && git status';
    expect(commandSegments(commit)).toEqual({ keys: ['cat', 'git commit', 'git status'], opaque: false });
  });

  it('arithmetic starts nothing', () => {
    expect(commandSegments('echo $((2 + 3)) && sleep $((60 * 2))')).toEqual({ keys: ['sleep $((60 * 2))'], opaque: false });
  });

  it('one that never closes, and backticks, are still what it cannot see into', () => {
    expect(commandSegments('echo $(npm test').opaque).toBe(true);
    expect(commandSegments('echo `make`').opaque).toBe(true);
    expect(commandSegments(`echo '$(not run)'`)).toEqual({ keys: [], opaque: false });
    const h = new CommandHistory();
    light(h, 'echo', 5);
    expect(h.classify('echo `make`')).toBe('unknown');
  });

  it('after one that never closes it reads no more of them: each would read the rest of the line again', () => {
    // Read twice, `npm test` is filed twice, and thirty unclosed ones are a billion readings in the app's main process.
    expect(commandSegments('echo $(a ; echo $(npm test)')).toEqual({ keys: ['npm test'], opaque: true });
    expect(commandSegments(`echo ${'$(x '.repeat(40)}`)).toEqual({ keys: [], opaque: true });
    // And one inside another deeper than anyone types is not followed down.
    expect(commandSegments(`echo ${'$(echo '.repeat(40)}hi${')'.repeat(40)}`).opaque).toBe(true);
    expect(commandSegments(`echo ${'$(echo '.repeat(5)}$(date)${')'.repeat(5)}`)).toEqual({ keys: ['date'], opaque: false });
  });

  it('the command the agents here start with is light once its parts are', () => {
    const h = aDayOfReading();
    const path = 'export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"';
    expect(h.classify(`${path}; git show 4`)).toBe('unknown');
    light(h, `${path}; git show 1`, 2);
    expect(h.classify(`${path}; git show 4`)).toBe('light');
    // And what it starts is judged for what it is.
    expect(h.classify(`${path}; cargo build`)).toBe('unknown');
    heavy(h, 'cargo build');
    expect(h.classify(`${path}; cargo build`)).toBe('heavy');
  });
});
