// EVERY ROW IN THE PHONE INBOX IS ONE SHAPE (2026-11-22). "Every thread has a
// different length. It should really just be one length per thing." Measured
// from the row code: a thread was a title of one or two lines over a line of
// small words (73 or 95 high), a mention or a question a name, one or two lines
// of words and a line of small words (96 or 117), so one screen held four
// heights. A thread's summary, which the desktop draws under its title
// (rowSummary), was never drawn on the phone, and a thread no person wrote had
// no name where a mention has one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.UTC(2026, 10, 22, 12);
const DEV = 'a1b2c3d4e5f6';
const iso = (ms: number) => new Date(ms).toISOString();

function rows(items: Record<string, unknown>[]) {
  return phoneTabs(phoneView({
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: items.map((item) => ({
      device: DEV, project: 'alpha', item: item.id, updated_at: iso(NOW),
      snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], createdAt: NOW - 9e6, updatedAt: NOW - 1000, ...item }, history: [] },
    })),
    commands: [],
  }, NOW), NOW);
}
const done = (more: Record<string, unknown>) => ({ status: 'done', wrote: { status: { ts: NOW - 1000, source: 'agent' }, body: { ts: NOW - 9e6, source: 'founder' }, result: { ts: NOW - 1000, source: 'agent' } }, ...more });

describe('what a thread\'s row carries', () => {
  it('has the summary the desktop draws under the title', () => {
    const [row] = rows([done({ id: 'w-1', title: 'Check the rules', body: 'Read the rules for messaging apps.', result: 'Two rules apply: a way to report a message, and a way to block someone.' })]).inbox;
    expect(row.summary).toBe('Two rules apply: a way to report a message, and a way to block someone.');
  });
  it('has none when nothing is written but the title', () => {
    const [row] = rows([done({ id: 'w-1', title: 'Check the rules' })]).inbox;
    expect(row.summary).toBe('');
  });
  it('has none when the summary only says the title again', () => {
    const [row] = rows([done({ id: 'w-1', title: 'Check the rules', result: 'Check the rules.' })]).inbox;
    expect(row.summary).toBe('');
  });
  it('keeps a summary that says more than the title', () => {
    const [row] = rows([done({ id: 'w-1', title: 'Check the rules', result: 'The rules are checked and two apply.' })]).inbox;
    expect(row.summary).toBe('The rules are checked and two apply.');
  });
  // A title cut from the front of the message leaves the rest of the sentence as
  // the summary: "Draw three versions of the inbox" over "for the phone."
  const asked = (more: Record<string, unknown>) => ({ id: 'w-1', status: 'blocked', wrote: { body: { ts: NOW - 9e6, source: 'founder' }, status: { ts: NOW - 1000, source: 'agent' } }, ...more });
  it('has none when the words left over only finish the title\'s sentence', () => {
    for (const body of ['Draw three versions of the inbox for the phone.', 'Draw three versions of the inbox, on a slow connection.']) {
      const [row] = rows([asked({ title: 'Draw three versions of the inbox', body })]).inbox;
      expect(row.summary, body).toBe('');
    }
  });
  it('says what the agent last told you instead, when it told you something', () => {
    const [row] = rows([asked({ title: 'Draw three versions of the inbox', body: 'Draw three versions of the inbox for the phone.', note: 'Three versions are in the folder below. I would go with the quiet one.\n\n## Options\n1. Quiet' })]).inbox;
    expect(row.summary).toBe('Three versions are in the folder below. I would go with the quiet one.');
  });
  it('does not put that over a summary that stands as a sentence', () => {
    const [row] = rows([asked({ title: 'Stuck threads', body: 'Threads stuck on a limit should land in Needs you.', note: 'Two ways to fix it.' })]).inbox;
    expect(row.summary).toBe('Threads stuck on a limit should land in Needs you.');
  });
  it('keeps the words left over when they start a sentence of their own', () => {
    const [row] = rows([asked({ title: 'Draw three versions of the inbox.', body: 'Draw three versions of the inbox. Make one of them dense.' })]).inbox;
    expect(row.summary).toBe('Make one of them dense.');
  });
  it('keeps a summary that starts small when it was not cut from the title', () => {
    const [row] = rows([done({ id: 'w-1', title: 'Make fizz say FizzBuzz', body: 'Fix fizz.', result: 'fizz(15) now returns FizzBuzz.' })]).inbox;
    expect(row.summary).toBe('fizz(15) now returns FizzBuzz.');
  });
  it('says which agent ran it: Claude Code unless it is marked Codex', () => {
    const list = rows([done({ id: 'w-1', title: 'One', result: 'Done one.' }), done({ id: 'w-2', title: 'Two', result: 'Done two.', engine: 'codex' })]).inbox;
    expect(list.find((r) => r.id === 'w-1')!.harness).toBe('claude');
    expect(list.find((r) => r.id === 'w-2')!.harness).toBe('codex');
  });
});

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const fn = (name: string) => inbox.slice(inbox.indexOf(`function ${name}(`), inbox.indexOf('\n}\n', inbox.indexOf(`function ${name}(`)));
const KINDS = ['ThreadRow', 'MentionRow', 'QuestionRow', 'RepeatRows'];

describe('the one shape', () => {
  const shape = fn('Shape');
  it('is who and when on one line, then room for two lines of words and no more', () => {
    expect(shape).toMatch(/\{mark\}\s*<T numberOfLines=\{1\}[^>]*>\{who\}<\/T>/);
    expect(shape).toMatch(/\{when\}<\/T>/);
    expect(shape).toMatch(/<View style=\{\{ minHeight: LINE \* 2, marginTop: \d \}\}>\{children\}<\/View>/);
    expect(inbox).toMatch(/const LINE = 2[01];/);
  });
  it.each(KINDS)('is what %s draws', (kind) => {
    expect(fn(kind)).toMatch(/<Shape /);
  });
  it.each(KINDS)('has no third line of small words under %s', (kind) => {
    expect(fn(kind)).not.toMatch(/marginTop: 5/);
    expect(fn(kind)).not.toMatch(/numberOfLines=\{[3-9]\}/);
  });
  it('sets every line of words on the same line height, so two lines are two lines whatever they say', () => {
    expect(inbox).toMatch(/const rowHead = \{[^}]*lineHeight: LINE[^}]*\}/);
    expect(inbox).toMatch(/const rowWords = \(\) => \(\{[^}]*lineHeight: LINE[^}]*\}\)/);
    for (const kind of KINDS) for (const style of fn(kind).match(/lineHeight: [\w.]+/g) ?? []) expect(style, kind).toBe('lineHeight: LINE');
  });
  it('does not let the row itself set a height: the shape is the height', () => {
    expect(inbox.match(/const rowBox = [^\n]*/)![0]).not.toMatch(/minHeight/);
  });
});

describe('a thread\'s row', () => {
  const row = fn('ThreadRow');
  it('gives its title one line over a summary or a status, and two when it has neither', () => {
    expect(row).toMatch(/<T numberOfLines=\{detail \? 1 : 2\} style=\{\{ \.\.\.rowHead/);
    expect(row).toMatch(/const detail = !!aside \|\| row\.queued \|\| row\.away \|\| !!row\.summary;/);
    expect(row).toMatch(/\{!!row\.summary && <T numberOfLines=\{1\}/);
  });
  it('is named for the teammate that sent it, and for Claude Code or Codex with its mark when nobody did', () => {
    expect(row).toMatch(/mark=\{mate \? <TeammateMark t=\{mate\} size=\{FACE\} \/> : <AgentMark harness=\{row\.harness\} size=\{FACE\} \/>\}/);
    expect(row).toMatch(/who=\{mate \? mate\.name : row\.harness === 'codex' \? 'Codex' : 'Claude Code'\}/);
  });
  it('says what waits on you in the orange, and what does not in grey', () => {
    expect(row).toMatch(/\{!!aside && <Chip mine=\{!row\.held\}>\{aside\}<\/Chip>\}/);
    expect(row).toMatch(/\{row\.queued && <Chip>Queued<\/Chip>\}/);
    expect(row).toMatch(/\{row\.away && <Chip>Computer offline<\/Chip>\}/);
  });
  it('still marks a pin, a level and a run, at the end of the first line', () => {
    expect(row).toMatch(/ends=\{/);
    expect(row).toMatch(/<Pin \/>/);
    expect(row).toMatch(/<PriorityBars /);
    expect(row).toMatch(/<RunningMark /);
  });
});

describe.each(['MentionRow', 'QuestionRow'])('a message in %s', (kind) => {
  it('is the same mark, name and two lines of what was said', () => {
    expect(fn(kind)).toMatch(/mark=\{<(Face|TeammateMark) [^>]*size=\{FACE\} \/>\}/);
    expect(fn(kind)).toMatch(/<T numberOfLines=\{2\} style=\{\{ \.\.\.rowWords\(\)/);
  });
});

describe('an agent\'s mark', () => {
  const icons = fs.readFileSync('mobile/src/ui/icons.tsx', 'utf8');
  it('is drawn from the same shapes the desktop draws', () => {
    expect(icons).toMatch(/import \{ CLAUDE_MARK, OPENAI_MARK \} from '..\/..\/..\/renderer\/src\/engine-marks';/);
    expect(fs.readFileSync('renderer/src/components/EngineLogos.tsx', 'utf8')).toMatch(/from '..\/engine-marks'/);
  });
  it('is a round tile the size of a face', () => {
    const mark = icons.slice(icons.indexOf('export function AgentMark('));
    expect(mark).toMatch(/width: s, height: s, borderRadius: s \/ 2/);
  });
});
