// A CLOUD THREAD ASKED TO MERGE HANDS THE MERGE TO THE COMPUTER (w-4465054f04, 2026-10-22).
//
// In the cloud power test five cloud threads answered "Merged ... on main"
// (`git fetch . branch:main`, `git push . HEAD:main`) and main on the computer
// never moved: the sandbox sends home only the task's own branch, and the
// agent was told the sandbox had "its git branch and main" with no word that
// main there is thrown away. The tester found out three replies later, when
// a run on the computer finally merged. A web-app rename was lost the same way.
//
// Codex cloud runs were told nothing about the cloud at all: the note rode only
// on Claude Code's command line, so a Codex run could not know to hand back.
import { describe, it, expect } from 'vitest';
import { CLOUD_NOTE, PLAIN_CLOUD_NOTE, codexLineForTheCloud } from '../main/cloud/run.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';

describe('what a cloud run is told about branches', () => {
  it('says only its own branch comes home, and a merge into main is handed back', () => {
    expect(CLOUD_NOTE).toMatch(/only this task's own branch comes back/i);
    expect(CLOUD_NOTE).toMatch(/main or any other branch[^.]*thrown away/i);
    expect(CLOUD_NOTE).toContain(`${HAND_BACK} merging into main`);
    // The hand-back paragraph stays last, where the plain note takes it from.
    const handback = CLOUD_NOTE.split('\n\n').at(-1);
    expect(handback).toMatch(/^For a missing installed skill or task file, first use the store tool request_cloud_resource/);
    expect(handback).toContain('Do not transfer the whole thread solely for a missing skill or file the request does not name.');
    expect(handback).toContain(`End your turn with one line and nothing else: ${HAND_BACK}`);
  });

  // w-6771163ced: a launch-video run could not fetch the intro film its request
  // named, was told to "finish independent work", and built a whole film
  // around a guessed style and its own music.
  it('hands back an input the request names that cannot be fetched, rather than building around a guess', () => {
    const handback = CLOUD_NOTE.split('\n\n').at(-1);
    expect(handback).toMatch(/a file, folder or skill the request names that request_cloud_resource cannot deliver, stop at once/);
    expect(handback).toMatch(/any path under the account's documents/);
    expect(PLAIN_CLOUD_NOTE.split('\n\n').at(-1)).toBe(handback);
  });

  // A cloud run asked about the project's branches listed two; the computer
  // had three, because only this branch and main go up.
  it('says the project\'s other branches are not there', () => {
    const hasNot = CLOUD_NOTE.split('\n\n').find((p) => p.startsWith('It does not have:'));
    expect(hasNot).toMatch(/other branches[^.;]*only this task's branch and main/i);
  });

  it('a project with no repository is told nothing about branches', () => {
    expect(PLAIN_CLOUD_NOTE).not.toMatch(/branch/i);
  });
});

describe('a Codex run in the cloud is told where it is', () => {
  const line = (method, params) => JSON.stringify({ id: 1, method, params }) + '\n';
  const sent = (l, note) => JSON.parse(codexLineForTheCloud(l, { keep: {}, findRollout: () => null, note }).line);

  it('after its own instructions, at the start of a thread', () => {
    const msg = sent(line('thread/start', { cwd: '/w', developerInstructions: 'HER RULES' }), CLOUD_NOTE);
    expect(msg.params.developerInstructions.startsWith('HER RULES\n\n')).toBe(true);
    expect(msg.params.developerInstructions).toContain(CLOUD_NOTE);
  });

  it('when a thread is picked back up', () => {
    expect(sent(line('thread/resume', { threadId: 't' }), CLOUD_NOTE).params.developerInstructions).toBe(CLOUD_NOTE);
  });

  it('and nowhere else', () => {
    expect(sent(line('turn/start', { threadId: 't', input: [] }), CLOUD_NOTE).params.developerInstructions).toBeUndefined();
  });

  it('with no note, a start passes as it came', () => {
    expect(sent(line('thread/start', { cwd: '/w', developerInstructions: 'HER RULES' })).params.developerInstructions).toBe('HER RULES');
  });
});
