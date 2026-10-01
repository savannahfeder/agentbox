// WHAT A TOOL CALL SAYS ON THE SCREEN.
//
// EVERY STRING IN THIS FILE IS REAL. Each one was taken off a real screen by
// the harness on 2026-08-20, which drives the built renderer
// over live sessions and reads the drawn line back with
// getBoundingClientRect. The six worst were showing 2% to 4% of themselves.
// Nothing here is a hypothetical shape.

import { describe, expect, it } from 'vitest';
import {
  RUN_MIN, groupWork, plainCommand, runFailures, runSummary, shortPath, workSubject, workVerb,
} from '../shared/agents.mjs';
import { fullSubject } from '../shared/work-lines.mjs';

const ZERO = '/Users/you/Desktop/dev/zero';

describe('what it did, in her words', () => {
  it('keeps the plain verbs it already had', () => {
    expect(workVerb('Bash')).toBe('ran');
    expect(workVerb('Read')).toBe('read');
    expect(workVerb('Write')).toBe('wrote');
    // `changed` since w-0bd0d8b2ef: a tester who is not a programmer reads
    // "edited" as a document being revised.
    expect(workVerb('Edit')).toBe('changed');
    expect(workVerb('Grep')).toBe('searched for');
    expect(workVerb('WebFetch')).toBe('fetched');
    expect(workVerb('')).toBe('did something');
    expect(workVerb(null)).toBe('did something');
  });

  // THE BUG THAT PUT THIS STRING ON SCREEN 31 TIMES IN ONE AFTERNOON. The
  // old strip was `^mcp__[^_]+__`, which needs the server name to hold no
  // underscore. `plugin_paper-desktop_paper` holds two.
  it('strips an MCP prefix whose server name has underscores in it', () => {
    expect(workVerb('mcp__plugin_paper-desktop_paper__write_html')).toBe('write html');
    expect(workVerb('mcp__plugin_paper-desktop_paper__get_screenshot')).toBe('get screenshot');
    expect(workVerb('mcp__agentbox__list_work_items')).toBe('list work items');
  });

  it('spells a bare tool name as a name and not as jargon', () => {
    // All four measured on screen 2026-08-20, printed with the underscores.
    expect(workVerb('cnvs_open_browser')).toBe('cnvs open browser');
    expect(workVerb('cnvs_browser_screenshot')).toBe('cnvs browser screenshot');
    expect(workVerb('tabs_context_mcp')).toBe('tabs context mcp');
    expect(workVerb('list_products')).toBe('list products');
    expect(workVerb('SomethingNew')).toBe('somethingnew');
  });

  it('has her words for the two that were showing raw', () => {
    expect(workVerb('Skill')).toBe('used a skill');
    expect(workVerb('AskUserQuestion')).toBe('asked a question');
  });
});

describe('a path, shown from the end', () => {
  it('is relative inside the folder the session runs in', () => {
    expect(shortPath(`${ZERO}/renderer/src/components/Tweaks.tsx`, ZERO))
      .toBe('…/src/components/Tweaks.tsx');
    expect(shortPath(`${ZERO}/shared/agents.mjs`, ZERO)).toBe('shared/agents.mjs');
    expect(shortPath(`${ZERO}/CLAUDE.md`, ZERO)).toBe('CLAUDE.md');
  });

  it('uses the tilde outside it, and never says /private', () => {
    // THE HOME IS PASSED IN, AND IT DID NOT USED TO BE. This argument
    // defaulted to `/Users/you`, so the tilde landed on exactly one Mac in
    // the world and every download got the raw path instead. The default is
    // gone; the caller says whose machine it is.
    expect(shortPath('/Users/you/.claude/settings.json', ZERO, '/Users/you'))
      .toBe('~/.claude/settings.json');
    expect(shortPath('/Users/leon/.claude/settings.json', '/Users/leon/dev/site', '/Users/leon'))
      .toBe('~/.claude/settings.json');
    // Measured on screen: `read /private/tmp/claude-501/-Users-you-…`
    // showed 71% of itself and the readable part was all prefix.
    expect(shortPath('/private/tmp/claude-501/-Users-you-Desktop-dev-harbour/35c5c838/scratch/x.md', ZERO))
      .toBe('…/35c5c838/scratch/x.md');
  });

  it('leaves anything that is not a path alone', () => {
    expect(shortPath('agentbox-a1')).toBe('agentbox-a1');
    expect(shortPath('')).toBe('');
  });
});

describe('a command, with the scaffolding off the front', () => {
  // THE SIX WORST LINES ON SCREEN, verbatim, with what could be read of
  // each one. Every one of them is a real command behind a prelude.
  it('drops a cd into an absolute path', () => {
    expect(plainCommand(`cd ${ZERO}/renderer/src && python3 - <<'PY'\np='components/Tweaks.tsx'\nPY`))
      .toBe("python3 - … p='components/Tweaks.tsx'");
    expect(plainCommand(`cd ${ZERO} && git add renderer/src/components/List.tsx tests/day-groups.test.mjs`))
      .toBe('git add renderer/src/components/List.tsx tests/day-groups.test.mjs');
  });

  it('drops an export PATH prelude, which appeared 29 times in one thread', () => {
    expect(plainCommand('export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"; npx electron .'))
      .toBe('npx electron .');
    expect(plainCommand('export PATH="/Users/you/.nvm/versions/node/v22.14.0/bin:$PATH"; cd /x/y && npx vitest run'))
      .toBe('npx vitest run');
  });

  it('drops a bare assignment', () => {
    expect(plainCommand('SP=/private/tmp/claude-501/-Users-you-Desktop-dev-harbour/bafe26b9; cat $SP/notes'))
      .toBe('cat $SP/notes');
  });

  it('cuts a heredoc at its marker rather than printing the script', () => {
    expect(plainCommand("cat <<'EOF'\n  a\n  b\nEOF")).toBe('cat … a');
    expect(plainCommand('node -e "x" <<PY\nstuff\nPY')).toBe('node -e "x" … stuff');
  });

  // IT NEVER INVENTS. An agent that really only changed folder did that, and a
  // line that came back empty would be this function lying about it.
  it('keeps the original when stripping would leave nothing', () => {
    expect(plainCommand(`cd ${ZERO}`)).toBe(`cd ${ZERO}`);
    expect(plainCommand('')).toBe('');
  });
});

describe('the subject, and the whole of it', () => {
  it('shortens the command and the path, and leaves the rest', () => {
    expect(workSubject({ command: `cd ${ZERO} && npm test` }, ZERO)).toBe('npm test');
    expect(workSubject({ file_path: `${ZERO}/shared/agents.mjs` }, ZERO)).toBe('shared/agents.mjs');
    expect(workSubject({ to: 'agentbox-a1' }, ZERO)).toBe('agentbox-a1');
    expect(workSubject({}, ZERO)).toBe('');
    expect(workSubject(null, ZERO)).toBe('');
  });

  it('can still hand back every character it shortened', () => {
    const command = `cd ${ZERO} && npm test`;
    expect(fullSubject({ command })).toBe(command);
    expect(fullSubject({ file_path: `${ZERO}/shared/agents.mjs` })).toBe(`${ZERO}/shared/agents.mjs`);
  });
});

describe('a run, aggregated', () => {
  const work = (verb, n) => Array.from({ length: n }, (_, k) => ({ kind: 'work', at: k, verb, failed: false }));
  const said = (at) => ({ who: 'it', at, text: 'hello' });

  it('folds three or more and leaves one and two standing', () => {
    expect(RUN_MIN).toBe(3);
    const out = groupWork([said(0), ...work('ran', 2), said(1), ...work('ran', 3), said(2)]);
    // two stay as themselves; three become one node
    expect(out.map((e) => e.kind ?? 'said')).toEqual([
      'said', 'work', 'work', 'said', 'run', 'said',
    ]);
    expect(out[4].items).toHaveLength(3);
  });

  it('folds a run that ends the thread, and one that starts it', () => {
    expect(groupWork([...work('ran', 4), said(1)]).map((e) => e.kind ?? 'said'))
      .toEqual(['run', 'said']);
    expect(groupWork([said(0), ...work('ran', 4)]).map((e) => e.kind ?? 'said'))
      .toEqual(['said', 'run']);
  });

  it('leaves a thread with no work in it exactly as it was', () => {
    const events = [said(0), said(1)];
    expect(groupWork(events)).toEqual(events);
    expect(groupWork([])).toEqual([]);
  });

  // THE NUMBER IS ALWAYS SAID. The standing objection to every cap in this
  // codebase is one that rounds off without saying so.
  it('says how many and what kind', () => {
    expect(runSummary(work('ran', 20))).toBe('20 things it ran');
    expect(runSummary(work('read', 4))).toBe('4 things it read');
    expect(runSummary([...work('ran', 18), ...work('read', 4), ...work('edited', 2)]))
      .toBe('24 things it did · ran 18 · read 4 · edited 2');
  });

  it('names a tool it has no plain word for rather than calling it a thing it ran', () => {
    expect(runSummary(work('write html', 31))).toBe('31 things it did · write html 31');
  });

  it('never lets the tally run past three verbs', () => {
    const many = [...work('ran', 9), ...work('read', 5), ...work('edited', 3), ...work('wrote', 2), ...work('fetched', 1)];
    expect(runSummary(many)).toBe('20 things it did · ran 9 · read 5 · edited 3 · 3 more');
  });

  // A COUNT OF ONE IS NOT PRINTED: `asked a question 1` reads as part of the
  // name, and a bare verb already says once. Caught on a real thread.
  it('does not print a count of one', () => {
    expect(runSummary([...work('ran', 5), ...work('read', 2), ...work('asked a question', 1)]))
      .toBe('8 things it did · ran 5 · read 2 · asked a question');
  });

  // A FOLD YOU HAVE TO OPEN TO FIND BAD NEWS IN IS WORSE THAN THE WALL.
  it('says on the closed line that something in it failed', () => {
    const items = [...work('ran', 5)];
    items[2] = { ...items[2], failed: true };
    expect(runFailures(items)).toBe('1 failed');
    expect(runFailures(work('ran', 5))).toBe('');
  });
});

// A SHORT ABSOLUTE PATH KEEPS ITS SLASH. Caught by the existing suite the first
// time this ran: `/x/store.mjs` came back as `x/store.mjs`, which is a
// different file.
describe('a path that is already short', () => {
  it('keeps its leading slash', () => {
    expect(shortPath('/x/store.mjs')).toBe('/x/store.mjs');
    expect(shortPath('/etc/hosts')).toBe('/etc/hosts');
    expect(workSubject({ file_path: '/x/store.mjs' })).toBe('/x/store.mjs');
  });
});

// A BANNER IS THE AGENT TALKING TO ITSELF. Four of the 31 worst lines left on
// screen after the preludes came off began with one of these.
describe('a banner echo', () => {
  it('comes off the front when a real command follows it', () => {
    expect(plainCommand('echo "=== main-process files modified ===" && git status --short main/'))
      .toBe('git status --short main/');
    expect(plainCommand('echo "=== running electron ==="; ps -o pid= -p 123'))
      .toBe('ps -o pid= -p 123');
  });

  it('leaves a plain echo alone, because that may be the whole of what ran', () => {
    expect(plainCommand('echo "launched pid $!"')).toBe('echo "launched pid $!"');
    expect(plainCommand('echo hello && ls')).toBe('echo hello && ls');
  });
});

// THREE `python3 - …` IN A ROW DISTINGUISH NOTHING, and that is what the first
// cut drew inside one fold of a real thread. When the command in front of the
// marker is short, the script's first line comes with it, because in every
// real case that is where the file being worked on is named.
describe('a heredoc whose program is the whole of the command', () => {
  it('brings the first line of the script with it', () => {
    expect(plainCommand("cd /x && python3 - <<'PY'\np='styles.css'; s=open(p).read()\nPY"))
      .toBe("python3 - … p='styles.css'; s=open(p).read()");
  });

  it('skips a comment, and skips the closing marker but not a one-word line', () => {
    expect(plainCommand("python3 - <<'PY'\n# what this does\nimport re\nPY"))
      .toBe('python3 - … import re');
    expect(plainCommand('node -e "x" <<PY\nstuff\nPY')).toBe('node -e "x" … stuff');
  });

  it('leaves a long command in front of the marker alone', () => {
    expect(plainCommand("npx some-long-tool --with --flags <<'PY'\np='x'\nPY"))
      .toBe('npx some-long-tool --with --flags …');
  });
});
