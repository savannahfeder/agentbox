// A TABLE A THREAD MADE IS IN ITS FILES MENU.
//
// The Files button over a thread listed three pictures on a thread whose agent
// kept a launch table (plans/cloud-launch.csv), linked in its note and named by
// its whole path in its answer. The list read only the kinds the big viewer
// reviews, so a .csv never reached it. Measured with filesMadeHere on those two
// lines: [] before, the table after.
import { describe, it, expect } from 'vitest';
import { filesMadeHere } from '../renderer/src/threads/thread-files.ts';

const agent = (ts, patch) => ({ ts, source: 'agent', patch });
const person = (ts, patch) => ({ ts, source: 'founder', patch });

describe('the tables a thread made', () => {
  it('lists a table the agent linked', () => {
    const files = filesMadeHere([agent(1, { note: 'Saved [Cloud launch tracker](plans/cloud-launch.csv)' })], []);
    expect(files.map((f) => f.name)).toEqual(['cloud-launch.csv']);
  });

  it('lists a table named by its whole path on its own line, once with its link', () => {
    const lines = [
      agent(1, { note: 'Saved [Cloud launch tracker](plans/cloud-launch.csv)' }),
      agent(2, { result: "Here's the table:\n\n/Users/someone/docs/agentbox/plans/cloud-launch.csv\n\nWhat changed." }),
    ];
    expect(filesMadeHere(lines, []).map((f) => f.name)).toEqual(['cloud-launch.csv']);
  });

  it('lists a .tsv, and a table beside a picture, newest first', () => {
    const lines = [
      agent(1, { result: 'The cover: [cover.png](cover.png)' }),
      agent(2, { result: 'All numbers: [ceiling](designs/w-1/ceiling.tsv)' }),
    ];
    expect(filesMadeHere(lines, []).map((f) => f.name)).toEqual(['ceiling.tsv', 'cover.png']);
  });

  it('does not list a script or a page named in passing', () => {
    const lines = [agent(1, { result: 'Changed `main/files-place.mjs` and `renderer/index.html`.' })];
    expect(filesMadeHere(lines, [])).toEqual([]);
  });

  it('does not list a table a person only mentioned', () => {
    const lines = [person(1, { body: 'Please update plans/cloud-launch.csv with the new row.' })];
    expect(filesMadeHere(lines, [])).toEqual([]);
  });
});
