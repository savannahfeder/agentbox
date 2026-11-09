// AN ASK WITH A COMMAND IN IT STILL DRAWS ITS CARD.
//
// What broke (2026-11-08): a cloud run asked for a treg token with
//   AGENTBOX-NEEDS: key TREG_TOKEN | the treg agent token from `treg org agent-new x-replies`, so ...
// and the thread showed that line as plain text, with no card to paste into.
// The ask line allowed backticks only around the whole line, so inline code
// in what the key is for matched nothing. Measured with needsIn on that line,
// which returned [].
import { describe, it, expect } from 'vitest';
import { needsIn } from '../shared/cloud-needs.mts';
import { keyWords } from '../shared/cloud-keys.mts';
import { needsAsBlocks, NEED_BLOCK } from '../renderer/src/key-asks';

const WHAT = 'the treg agent token from `treg org agent-new x-replies`, so cloud runs can search X (about $0.13 a day)';
const TREG = `AGENTBOX-NEEDS: key TREG_TOKEN | ${WHAT}`;

describe('an ask whose reason holds inline code', () => {
  it('reads the line from the thread, code and all', () => {
    expect(needsIn(TREG)).toEqual([{ kind: 'key', name: 'TREG_TOKEN', what: WHAT }]);
  });

  it('reads one whose reason ends on the code', () => {
    expect(needsIn('AGENTBOX-NEEDS: key TREG_TOKEN | from `treg org agent-new x-replies`')[0].what).toBe('from `treg org agent-new x-replies`');
  });

  it('reads a sign-in and a file the same way', () => {
    expect(needsIn('AGENTBOX-NEEDS: sign-in vercel | to run `vercel deploy`')[0]).toMatchObject({ kind: 'sign-in', why: 'to run `vercel deploy`' });
    expect(needsIn('AGENTBOX-NEEDS: file ~/Movies/a.mov | for `ffmpeg`')[0]).toMatchObject({ kind: 'file', path: '~/Movies/a.mov', why: 'for `ffmpeg`' });
  });

  it('still takes off backticks around the whole line', () => {
    expect(needsIn('`AGENTBOX-NEEDS: key TREG_TOKEN | the treg agent token`')).toEqual([{ kind: 'key', name: 'TREG_TOKEN', what: 'the treg agent token' }]);
    expect(needsIn('`AGENTBOX-NEEDS: key TREG_TOKEN`')).toEqual([{ kind: 'key', name: 'TREG_TOKEN', what: '' }]);
  });

  it('draws the line as a card in the thread', () => {
    const drawn = needsAsBlocks(`**Next I need a treg token.**\n\n${TREG}\n\n## Options\n1. Token's in`);
    expect(drawn).toContain('```' + NEED_BLOCK);
    expect(drawn).not.toContain('AGENTBOX-NEEDS');
  });

  it('names the key without the command in the card title', () => {
    expect(keyWords(WHAT)).toBe('treg agent token');
  });

  it('leaves prose that only mentions the marker alone', () => {
    expect(needsIn('A run ends with `AGENTBOX-NEEDS:` lines, one per thing.')).toEqual([]);
    expect(needsIn('Then AGENTBOX-NEEDS: key lowercase_name | `x`')).toEqual([]);
  });
});
