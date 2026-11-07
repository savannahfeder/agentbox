// Two pictures with one name in two folders each open themselves.
//
// A long thread showed designs/w-e5f506ccb3/two-tabs-and-team/1-needs-you.png
// in its newest message, and clicking it opened an older 1-needs-you.png the
// same thread had shown from another folder, under the same title. Measured in
// shared/artifact-marks.mjs: threadFiles folded any path with an already-seen
// name into that first version's `also`, so the press landed on the first path
// said. A second path is now the same file only when one path ends with the
// other, as a bare name or a relative path does inside a whole one.
import { describe, it, expect } from 'vitest';
import { filesInLines, threadFiles, versionForPath, whereAPressLands } from '../shared/artifact-marks.mjs';

const said = (ts, note) => ({ ts, source: 'agent', patch: { note } });
const opened = (families, path) => {
  const at = whereAPressLands(families, { path });
  return at ? families[at.fi].versions[at.vi].path : null;
};

const OLD = 'designs/w-e5f506ccb3/inbox-tabs/1-needs-you.png';
const NEW = 'designs/w-e5f506ccb3/two-tabs-and-team/1-needs-you.png';

describe('one name, two folders', () => {
  const families = threadFiles(filesInLines([
    said(1, `Needs you: ![1-needs-you.png](${OLD})`),
    said(2, `Needs you, polished: ![1-needs-you.png](${NEW})`),
  ]));

  it('the newer picture opens the newer picture', () => {
    expect(opened(families, NEW)).toBe(NEW);
  });

  it('the older picture still opens the older one', () => {
    expect(opened(families, OLD)).toBe(OLD);
  });

  it('they are two versions of one file, oldest first', () => {
    expect(families).toHaveLength(1);
    expect(families[0].versions.map((v) => v.path)).toEqual([OLD, NEW]);
  });

  it('the bare name alone is not enough to pick one', () => {
    expect(versionForPath(families, '1-needs-you.png')).toBeNull();
  });
});

describe('one file written two ways stays one file', () => {
  const whole = `/Users/someone/Zero/accounts/a/agentbox-team/${NEW}`;

  it('a relative path and the whole path to it', () => {
    const families = threadFiles(filesInLines([said(1, `![a](${NEW})`), said(2, `![a](${whole})`)]));
    expect(families[0].versions).toHaveLength(1);
    expect(opened(families, whole)).toBe(NEW);
  });

  it('a path and the bare name an agent shortened it to', () => {
    const families = threadFiles(filesInLines([said(1, `![a](${NEW})`), said(2, 'Here it is again: `1-needs-you.png`')]));
    expect(families[0].versions).toHaveLength(1);
  });

  it('a folder that only shares its end with another is not the same folder', () => {
    const families = threadFiles(filesInLines([
      said(1, '![a](designs/round-1/team/1-needs-you.png)'),
      said(2, '![a](designs/round-2/team/1-needs-you.png)'),
    ]));
    expect(families[0].versions).toHaveLength(2);
  });
});
