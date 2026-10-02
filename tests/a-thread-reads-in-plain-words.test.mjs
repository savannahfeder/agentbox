// WHAT A THREAD SAYS TO SOMEONE WHO IS NOT A PROGRAMMER.
//
// Someone who is not a programmer reads the activity lines as noise or worse.
// Four lines of the kind a thread used to draw: "I'll claim the work item
// first.", "Looked up a tool, claim work item", "Running cat README.md; echo
// ---; cat package.json", "leave the row open, since you wrote it". Each one is
// either the app's own bookkeeping or a shell command drawn as it was typed.
//
// MEASURED over 3,344 session traces written between 2026-09-20 and
// 2026-10-01, 55,500 tool lines in all:
//
//   Bash                     31,878  57%
//   Edit / Read / Write      20,137  36%
//   the store's own records    2,462   4%   claim, update, release, list
//   ToolSearch                   498   1%
//
// So two separate defects. The 2,960 bookkeeping lines are not work at all and
// go; they are also the lines that open every single thread, which is why they
// cost more than 5% of a screen. And of the 32,349 Bash lines, 55% are
// compound (`a && b; c`) and 48% hold a pipe, so what is drawn is a shell
// one-liner rather than a sentence.
//
// THE RULE THIS FILE PINS. A command gets plain words only when every part of
// it is recognised; one unknown segment and the whole line stays as the command
// it was, because a wrong verb on her screen is worse than a raw one. The exact
// string is behind the line either way.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandWork, isBookkeeping, workVerb } from '../shared/work-lines.mjs';
import { runNodes } from '../renderer/src/item-thread';
import { activitySummary } from '../renderer/src/activity-summary';
import { claudeActivity, currentActivity } from '../main/agent-activity.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const trace = (lines) => ({ startedAt: Date.parse('2026-10-01T12:00:00Z'), text: lines.join('\n') });

describe('the store\'s own bookkeeping is not activity', () => {
  it('hides the four the testers named', () => {
    expect(isBookkeeping('mcp__agentbox__claim_work_item')).toBe(true);
    expect(isBookkeeping('mcp__agentbox__list_documents')).toBe(true);
    expect(isBookkeeping('mcp__agentbox__update_work_item')).toBe(true);
    expect(isBookkeeping('ToolSearch')).toBe(true);
  });

  // The server is named after the product, so the prefix is never one string.
  it('hides them whatever the store server is called', () => {
    expect(isBookkeeping('mcp__daydream__claim_work_item')).toBe(true);
    expect(isBookkeeping('mcp__daydream__release_work_item')).toBe(true);
    expect(isBookkeeping('mcp__agentbox__list_work_items')).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH. Reading a document, writing one and filing a
  // question are the work itself, and a thread that hid them would be hiding
  // the run.
  it('keeps everything that is not bookkeeping', () => {
    expect(isBookkeeping('mcp__agentbox__read_document')).toBe(false);
    expect(isBookkeeping('mcp__agentbox__write_document')).toBe(false);
    expect(isBookkeeping('mcp__agentbox__create_work_item')).toBe(false);
    expect(isBookkeeping('mcp__agentbox__look_at_page')).toBe(false);
    expect(isBookkeeping('mcp__claude_ai_Linear__list_teams')).toBe(false);
    expect(isBookkeeping('Bash')).toBe(false);
    expect(isBookkeeping('Read')).toBe(false);
    expect(isBookkeeping('')).toBe(false);
    expect(isBookkeeping(null)).toBe(false);
  });

  // The first six lines of this very thread's own trace, verbatim.
  it('drops them out of the conversation, keeping the work around them', () => {
    const nodes = runNodes(trace([
      '21:05:03  I\'ll start by claiming the item and reading the project state.',
      '21:05:04  [ToolSearch] ',
      '21:05:06  [Bash] ls',
      '21:05:10  [mcp__agentbox__claim_work_item] w-0bd0d8b2ef',
      '21:05:11  [Bash] cat STATE.md',
      '21:05:40  [mcp__agentbox__update_work_item] w-0bd0d8b2ef',
    ]));
    expect(nodes.filter((n) => n.kind === 'work').map((n) => `${n.verb} ${n.subject}`.trim()))
      .toEqual(['listed ./', 'read STATE.md']);
    // The sentence it typed is still there, and is still a message.
    expect(nodes.filter((n) => n.kind !== 'work')).toHaveLength(1);
  });

  it('never makes one the live word on the row', () => {
    const call = (id, name, input) => JSON.stringify({
      type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] },
    });
    const session = {};
    claudeActivity(session, call('a', 'mcp__agentbox__claim_work_item', { id: 'w-1' }));
    expect(currentActivity(session)).toEqual([]);
    claudeActivity(session, call('b', 'ToolSearch', { query: 'select:Read' }));
    expect(currentActivity(session)).toEqual([]);
    claudeActivity(session, call('c', 'Read', { file_path: '/tmp/x/README.md' }));
    // Nothing is guessed about whose Mac this is, so the path is whole.
    expect(currentActivity(session).map((a) => a.label)).toEqual(['Reading /tmp/x/README.md']);
  });
});

describe('a command in plain words', () => {
  // The tester's own line, which is three segments and a banner.
  it('reads the line the tester was shown', () => {
    expect(commandWork('cat README.md; echo ---; cat package.json'))
      .toEqual({ verb: 'read', doing: 'Reading', subject: 'README.md and package.json' });
  });

  it('reads the shapes the traces actually hold', () => {
    const say = (c) => { const w = commandWork(c); return w ? `${w.verb} ${w.subject}`.trim() : null; };
    expect(say('sed -n 1,200p renderer/src/item-thread.ts')).toBe('read renderer/src/item-thread.ts');
    expect(say('grep -rn "workVerb" shared/agents.mjs')).toBe('searched for workVerb');
    expect(say('ls renderer/src')).toBe('listed renderer/src');
    expect(say('npx vitest run tests/one-door-one-list.test.mjs --maxWorkers=1'))
      .toBe('ran the tests one-door-one-list.test.mjs');
    expect(say('npm test')).toBe('ran the tests');
    expect(say('npx tsc -p renderer --noEmit')).toBe('checked the types');
    expect(say('git status')).toBe('checked what changed');
    expect(say('git -C /tmp/w log -5')).toBe('read the code history');
    expect(say('git add -A && git commit -m "a change"')).toBe('saved the changes a change');
    expect(say('sed -i "" s/a/b/ src/cart.js')).toBe('changed src/cart.js');
    expect(say('mkdir -p scripts/scratch')).toBe('made a folder scripts/scratch');
    expect(say('rm -rf /tmp/w/frames')).toBe('deleted /tmp/w/frames');
    expect(say('node scripts/scratch/measure.mjs')).toBe('ran a script measure.mjs');
    expect(say('python3 - <<\'PY\'\nimport re\nPY')).toBe('ran a script import re');
  });

  // THE WHOLE POINT OF THE CONSERVATIVE RULE. One segment nobody taught it and
  // the line goes back to being the command, which is true.
  it('says nothing rather than the wrong thing', () => {
    expect(commandWork('ffmpeg -y -i in.mov out.mp4')).toBe(null);
    expect(commandWork('docker ps --format "{{.Names}}"')).toBe(null);
    expect(commandWork('cat a.md && ffmpeg -i in.mov out.mp4')).toBe(null);
    // Two different things in one line is two different verbs, so neither.
    expect(commandWork('cat a.md && rm b.md')).toBe(null);
    expect(commandWork('')).toBe(null);
    expect(commandWork(null)).toBe(null);
  });

  // Three names is the budget; past it the count is the honest reading.
  it('names a few files and counts many', () => {
    expect(commandWork('cat a.md b.md').subject).toBe('a.md and b.md');
    expect(commandWork('cat a.md b.md c.md').subject).toBe('a.md, b.md and c.md');
    expect(commandWork('cat a.md b.md c.md d.md').subject).toBe('4 files');
  });

  // The prelude still comes off first, which is what `plainCommand` is for.
  it('reads through a cd into an absolute path', () => {
    expect(commandWork('cd /Users/you/Desktop/dev/zero && git status').verb).toBe('checked what changed');
  });
});

// MOST OF THE EARLY USERS ARE DEVELOPERS (2026-10-01). Plain words must not
// cost them the detail they read these lines FOR: which branch, which message,
// which test, which script. MEASURED over the same traces, the words named
// nothing on 4,791 lines before this group existed and on 849 after, and the
// 849 are the commands that named nothing either (`git status`, `npx tsc`,
// `npm install`).
describe('a developer keeps the detail they read the line for', () => {
  const say = (c) => { const w = commandWork(c); return w ? `${w.verb} ${w.subject}`.trim() : null; };

  it('names the branch, the message, the test and the script', () => {
    expect(say('git push origin agentbox/w-1 2>&1 | tail -5')).toBe('pushed the branch agentbox/w-1');
    expect(say('git merge --no-edit agentbox/w-1')).toBe('merged the branch agentbox/w-1');
    expect(say('git commit -m "Say what a command did"')).toBe('saved the changes Say what a command did');
    expect(say('git add renderer/src/App.tsx')).toBe('saved the changes renderer/src/App.tsx');
    expect(say('git diff renderer/src/styles.css')).toBe('checked what changed renderer/src/styles.css');
    // The trace cuts a line at 200 characters, so the suffix is often gone.
    expect(say('npx vitest run tests/team-one-page-s')).toBe('ran the tests team-one-page-s');
    expect(say('node -e "console.log(1)"')).toBe('ran a script console.log(1)');
  });

  // A command that named nothing is still allowed to say nothing: inventing a
  // subject for `git status` would be worse than the verb alone.
  it('says only the verb when the command named nothing', () => {
    expect(say('git status --short')).toBe('checked what changed');
    expect(say('npx tsc -p renderer --noEmit')).toBe('checked the types');
  });
});

describe('a file that changed says changed', () => {
  it('is the word on the tool and on the command alike', () => {
    expect(workVerb('Edit')).toBe('changed');
    expect(workVerb('MultiEdit')).toBe('changed');
    expect(workVerb('NotebookEdit')).toBe('changed');
    expect(commandWork('sed -i "" s/a/b/ src/cart.js').verb).toBe('changed');
    // Writing a file that was not there is still writing it.
    expect(workVerb('Write')).toBe('wrote');
  });

  it('folds a run of them into words and not tool names', () => {
    expect(activitySummary([{ verb: 'changed', subject: 'src/cart.js' }])).toBe('Changed src/cart.js');
    expect(activitySummary([{ verb: 'changed', subject: 'a' }, { verb: 'read', subject: 'b' }]))
      .toBe('Changed files, read files');
  });
});

describe('the exact command is still one press away', () => {
  it('travels on the line whenever the words replaced it', () => {
    const [line] = runNodes(trace(['21:05:06  [Bash] cat README.md; echo ---; cat package.json']));
    expect(line.verb).toBe('read');
    expect(line.subject).toBe('README.md and package.json');
    expect(line.full).toBe('cat README.md; echo ---; cat package.json');
  });
});

describe('the brief tells a worker to write the same way', () => {
  const template = () => fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');
  const RULE = 'THEIR WORDS AND NOT OURS';

  it('names the four words it must not use', () => {
    const t = template();
    expect(t).toContain(RULE);
    const rule = t.slice(t.indexOf(RULE));
    const section = rule.slice(0, rule.indexOf('\n- '));
    for (const word of ['work item', 'row', 'claim', 'the founder']) {
      expect(section).toContain(`"${word}"`);
    }
  });

  it('is in both halves, so a toolless session gets it too', () => {
    const t = template();
    for (const fence of ['store-tools', 'no-store-tools']) {
      const start = t.indexOf(`<!-- ${fence}:start -->`, t.indexOf('## Doing the work'));
      const end = t.indexOf(`<!-- ${fence}:end -->`, start);
      expect(t.slice(start, end)).toContain(RULE);
    }
  });

  it('ships in the defaults, which are the same file', () => {
    const defaults = JSON.parse(fs.readFileSync(path.join(REPO, 'shared', 'instruction-defaults.json'), 'utf8'));
    expect(defaults.system).toBe(template());
  });
});
