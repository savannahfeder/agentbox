// A card shows the file its run made, even when the agent never said so.
//
// The card she attached was. Its trace, on disk the whole time, holds the line
//
// 02:19:45 [mcp__agentbox__write_document] designs//first-run-flows.html
//
// The first test below is exactly that run. The rest pin the two ways this
// could go wrong in the other direction: burying her file under the hundreds of
// source and scratch files a run also writes, and handing back her own pasted
// screenshot as something we made.
import { describe, it, expect } from 'vitest';
import { filesFromRuns } from '../renderer/src/run-files.ts';

const DOCS = '/store/accounts/acct/agentbox';
const REPO = '/Users/you/Desktop/dev/zero';
const ROOTS = [DOCS, `${DOCS}/designs`, `${DOCS}/attachments`, REPO, `${REPO}/designs`];

const run = (startedAt, lines) => ({ startedAt, text: lines.join('\n') });

describe('the file a run made is on the card', () => {
  it('finds the drawing the onboarding run wrote and never mentioned', () => {
    // Her real card, trimmed to its shape: narration, the write, more narration.
    const session = run(1787193585000, [
      '# Onboarding: three first run flows',
      '02:14:02  Now the three first run flows, drawn in the lake skin.',
      '02:19:45  [mcp__agentbox__write_document] designs/w-78c45faed4/first-run-flows.html',
      '02:20:01  They are in your documents.',
    ]);
    expect(filesFromRuns([session], ROOTS)).toEqual(['designs/w-78c45faed4/first-run-flows.html']);
  });

  it('keeps the folder on a file written by absolute path', () => {
    const session = run(1, [
      `00:01:00  [Write] ${DOCS}/designs/2026-08-13-off-centre-five-ways.html`,
    ]);
    // "designs/…", not a bare file name: that is the shape the opener resolves
    // and the shape a worker would have typed, so the two dedupe against
    // each other instead of drawing the same file twice.
    expect(filesFromRuns([session], ROOTS)).toEqual(['designs/2026-08-13-off-centre-five-ways.html']);
  });

  it('leaves out everything that is not hers to open', () => {
    const session = run(1, [
      `00:01:00  [Write] /tmp/shot.sh`,
      `00:01:01  [Write] /tmp/zw-panelb/tests/the-panel-is-the-wall.test.mjs`,
      `00:01:02  [Edit] ${REPO}/renderer/src/components/Focus.tsx`,
      `00:01:03  [Edit] ${DOCS}/STATE.md`,
      `00:01:04  [Edit] ${DOCS}/decisions.md`,
      `00:01:05  [Write] /store/accounts/acct/harbour/designs/theirs.html`,
      `00:01:06  [Bash] git status`,
      `00:01:07  [Read] ${DOCS}/designs/read-only.html`,
    ]);
    // Source, tests, scratch, the store's own bookkeeping, another product's
    // file, a command, and a file only READ. None of them is a thing she asked
    // for, and fifty of them would bury the one she did.
    expect(filesFromRuns([session], ROOTS)).toEqual([]);
  });

  it('does not hand her own pasted screenshot back as our output', () => {
    const session = run(1, [`00:01:00  [Write] ${DOCS}/attachments/mt0x2o5h-pasted-16700.png`]);
    expect(filesFromRuns([session], ROOTS)).toEqual([]);
  });

  it('shows a file once however many times the run rewrote it', () => {
    const session = run(1, [
      `00:01:00  [Write] ${DOCS}/designs/round-3.html`,
      `00:01:01  [Edit] ${DOCS}/designs/round-3.html`,
      `00:01:02  [Edit] ${DOCS}/designs/round-3.html`,
      `00:01:03  [mcp__agentbox__write_document] designs/round-3.html`,
    ]);
    expect(filesFromRuns([session], ROOTS)).toEqual(['designs/round-3.html']);
  });

  it('reads every run on the item, oldest first', () => {
    const first = run(10, [`00:01:00  [Write] ${DOCS}/designs/one.html`]);
    const second = run(20, [`00:02:00  [Write] ${DOCS}/designs/two.png`]);
    // Handed to it out of order, because the reader sorts and the caller does
    // not have to know that.
    expect(filesFromRuns([second, first], ROOTS)).toEqual(['designs/one.html', 'designs/two.png']);
  });

  it('says nothing when a run made nothing, and never throws on an empty trace', () => {
    expect(filesFromRuns([], ROOTS)).toEqual([]);
    expect(filesFromRuns([run(1, [])], ROOTS)).toEqual([]);
    expect(filesFromRuns([run(1, ['00:01:00  Thinking about it.'])], ROOTS)).toEqual([]);
  });
});
