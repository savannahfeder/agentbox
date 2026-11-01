// An agent could not add a version to a picture: asked for "v2 of the same
// file if you can", it said "I can't create a real version of the old file",
// sent "-v2" as a separate file, and the reviewers' comments split between the
// two (Dev and Sofia). Measured: versions are worked out
// from names (shared/artifact-marks.mjs threadFiles), and nothing told an agent
// the rule; team_tell and team_task sent a file under whatever name it had,
// "onboarding-b-v2-built-pins-fixed.png" among them.
//
// Now team_tell and team_task take `versionOf`, the file on the thread this one
// replaces, and carry the file under the name that makes it the next version.
// The message rules tell an agent the same rule for its own thread.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTell, teamTask } from '../mcp/core/reach.mjs';
import { REACH_LABEL } from '../shared/teammate-reach.mjs';
import { isTaskRow } from '../shared/team-rules.mjs';
import { threadFiles } from '../shared/artifact-marks.mjs';

let t; let run;
const askRows = () => t.rows(t.maya).filter((i) => (i.labels ?? []).includes(REACH_LABEL));
const tap = (row, words) => t.maya.on(() => t.maya.store.answerItem(row.product, row.id, { answer: words }));
const convo = (copy) => t.conversationsOf(copy).filter((i) => !isTaskRow(i));
const put = (rel, bytes = 'png') => {
  const file = path.join(t.product.dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
};
const link = (text) => /\]\((attachments\/[^)]+)\)/.exec(String(text))?.[1];
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

beforeEach(async () => {
  t = await aTeamWithAgents();
  run = t.maya.store.composeItem(t.product.id, { title: 'Onboarding B', body: 'Build onboarding B and send Sofia a picture.' });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
  teamTell({ text: 'Dev, hello.', to: ['Dev'] });
  await t.tick();
  await tap(askRows()[0], '1. Send it, and let it write to Dev Patel from now on');
  await t.tick();
});
afterEach(() => t.stop());

describe('a new version through team_tell', () => {
  it('goes under the next version name and lands as v2 of the same file', async () => {
    put(`designs/${run.id}/onboarding-b.png`, 'v1');
    teamTell({ text: 'Dev, the page.', to: ['Dev'], files: [`designs/${run.id}/onboarding-b.png`] });
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    const first = link(convo(t.dev)[0].answer);

    put(`designs/${run.id}/onboarding-b-pins-fixed.png`, 'v2');
    const out = teamTell({ text: 'Dev, both pins fixed.', to: ['Dev'], files: [`designs/${run.id}/onboarding-b-pins-fixed.png`], versionOf: 'onboarding-b.png' });
    expect(out.files).toEqual(['onboarding-b-v2.png']);
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    const second = link(convo(t.dev)[0].answer);
    expect(second).toMatch(/onboarding-b-v2\.png$/);

    const families = threadFiles([{ path: first }, { path: second }]);
    expect(families).toHaveLength(1);
    expect(families[0].versions.map((v) => v.n)).toEqual([1, 2]);
  });

  it('a version of v2 is v3', () => {
    put(`designs/${run.id}/fixed.png`);
    expect(teamTell({ to: ['Dev'], files: [`designs/${run.id}/fixed.png`], versionOf: 'attachments/mh2xk3a1-ab12cd-onboarding-b-v2.png' }).files).toEqual(['onboarding-b-v3.png']);
  });

  it('a task carries a version the same way', () => {
    put(`designs/${run.id}/spec-new.md`, '# Spec');
    expect(teamTask({ to: 'Dev', title: 'Read the spec', files: [`designs/${run.id}/spec-new.md`], versionOf: 'group-bookings-spec.md' }).files).toEqual(['group-bookings-spec-v2.md']);
  });
});

describe('what is refused', () => {
  it('a version of a different kind of file', () => {
    put(`designs/${run.id}/page.pdf`, 'pdf');
    expect(() => teamTell({ to: ['Dev'], files: [`designs/${run.id}/page.pdf`], versionOf: 'onboarding-b.png' })).toThrow(/png.*pdf|pdf.*png/);
  });

  it('a version with more than one file', () => {
    put(`designs/${run.id}/a.png`); put(`designs/${run.id}/b.png`);
    expect(() => teamTell({ to: ['Dev'], files: [`designs/${run.id}/a.png`, `designs/${run.id}/b.png`], versionOf: 'onboarding-b.png' })).toThrow(/one file/);
  });

  it('without versionOf a file keeps its own name', () => {
    put(`designs/${run.id}/onboarding-b-pins-fixed.png`);
    expect(teamTell({ to: ['Dev'], files: [`designs/${run.id}/onboarding-b-pins-fixed.png`] }).files).toEqual(['onboarding-b-pins-fixed.png']);
  });
});

describe('what an agent is told', () => {
  it('the tools say how to send a new version', () => {
    const tools = read('mcp/tools.mjs');
    expect(tools.match(/versionOf: z\.string\(\)\.optional\(\)/g)).toHaveLength(3);
  });

  it('the message rules say how to save one on its own thread', () => {
    expect(read('briefs/message-rules.md')).toMatch(/IS ITS NEXT VERSION[^\n]*\n[^\n]*-v2/);
  });
});
