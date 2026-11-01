// WHAT BROKE: a growth-teardown thread answered about a sign-in and drew the
// whole YC application draft under its answer. The answer never named that
// file. The agent's check-in note did, in passing: "conductor.build (named
// first in yc/application-draft.md as a competitor)". The card list read the
// note along with the answer, so a citation became a file the agent "returned".
//
// Measured on the store's 336 threads: notes named a markdown file 4 times and
// every one was a citation like that; answers named them 12 times, mostly the
// file the agent had just written or changed. So the note no longer adds a
// card. The answer, the person's ask and their reply still do.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { messageDocuments } from '../renderer/src/message-artifacts.ts';

const DIR = '/docs/agentbox-team';

describe('a markdown file named only in the check-in note', () => {
  it('gets no card under an answer that never names it (the reported thread)', () => {
    expect(messageDocuments({
      body: 'I want you to reverse-engineer the growth of companies that might be useful as references for us.',
      note: 'Targets picked for the first run: conductor.build (named first in yc/application-draft.md as a competitor) and lovable.dev.',
      result: '**treg is installed but the sign-in needs you — which way do you want it?**\n\nFor the first two I picked conductor.build and lovable.dev.',
    }, DIR)).toEqual([]);
  });

  it('gets none on its own line either, nor written out in full', () => {
    expect(messageDocuments({ note: 'Still drafting.\n\nmarketing/plan.md', result: 'Done.' }, DIR)).toEqual([]);
    expect(messageDocuments({ note: `See ${DIR}/yc/application-draft.md` }, DIR)).toEqual([]);
  });
});

describe('a markdown file the answer or the person names', () => {
  it('still gets its card when the answer names it, in a sentence or on its own line', () => {
    expect(messageDocuments({ result: "I've put the whole thing into `marketing/relaunch-names.md`." }, DIR))
      .toEqual(['marketing/relaunch-names.md']);
    expect(messageDocuments({ result: `**Done.**\n\n${DIR}/yc/application-draft.md` }, DIR))
      .toEqual(['yc/application-draft.md']);
  });

  it('gets one card when the note and the answer both name it', () => {
    expect(messageDocuments({
      note: 'Written into marketing/daily-clips.md.',
      result: 'Your correction is in marketing/daily-clips.md.',
    }, DIR)).toEqual(['marketing/daily-clips.md']);
  });

  it('still gets its card from the ask and from a reply', () => {
    expect(messageDocuments({ body: 'Read docs/cloud/PLAN.md and tell me what is left.' }, DIR)).toEqual(['docs/cloud/PLAN.md']);
    expect(messageDocuments({ answer: 'Use [the brief](marketing/brief.md) instead.' }, DIR)).toEqual(['marketing/brief.md']);
  });
});

describe('what the list never held and still does not', () => {
  it('leaves out our own bookkeeping and a change', () => {
    expect(messageDocuments({ result: 'Updated STATE.md and decisions.md; the code is in runs/w-1/the-change.change.' }, DIR)).toEqual([]);
  });

  it('still frames a design wherever the message names it, the note included', () => {
    expect(messageDocuments({ note: 'Drew it at designs/w-1/the-page.html', result: 'Done.' }, DIR))
      .toEqual(['designs/w-1/the-page.html']);
  });
});

it('is the list the thread draws its cards from', () => {
  const focus = readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const list = focus.slice(focus.indexOf('const previewPaths ='), focus.indexOf('const showOptions'));
  expect(list).toContain('messageDocuments(item, productDir)');
  expect(list).not.toContain('item.note');
});
