// A FILE CARD OPENS THE FILE AND VERSION IT NAMES.
//
// Three of three: Sofia's "group-seat-picker-v4.png" card opened
// onboarding-b-team-look.png, Dev's "seat-picker-21-v2.png" opened
// seat-picker-under-2.png. Measured from the code: the agent's message named the
// picture twice, bare and as a link into its folder; threadFiles kept the first
// path and dropped the second, so the path the card carried matched no version
// and the big view fell back to the thread's last file. The card's path is now
// found through every path its version was named by, and a path that names no
// version is never answered with some other file.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { filesInLines, threadFiles, versionForPath } from '../shared/artifact-marks.mjs';

const said = (ts, result) => ({ ts, source: 'agent', patch: { result } });

describe('the version a card opens', () => {
  const lines = [
    said(1, 'The seat picker: group-seat-picker.png'),
    said(2, 'Next one: group-seat-picker-v4.png, saved as [group-seat-picker-v4.png](designs/w-f9685b42f1/group-seat-picker-v4.png)'),
    said(3, 'And the team look: [onboarding-b-team-look.png](designs/w-f9685b42f1/onboarding-b-team-look.png)'),
  ];
  const families = threadFiles(filesInLines(lines));

  it('a link into the folder opens the version it names, not the last file', () => {
    expect(versionForPath(families, 'designs/w-f9685b42f1/group-seat-picker-v4.png')?.name).toBe('group-seat-picker-v4.png');
  });
  it('the bare name opens the same version', () => {
    expect(versionForPath(families, 'group-seat-picker-v4.png')?.name).toBe('group-seat-picker-v4.png');
  });
  it('a full path on disk, or a file:// one, opens it too', () => {
    expect(versionForPath(families, '/Users/x/store/designs/w-f9685b42f1/group-seat-picker-v4.png')?.name).toBe('group-seat-picker-v4.png');
    expect(versionForPath(families, 'file:///Users/x/designs/w-f9685b42f1/group-seat-picker-v4.png')?.name).toBe('group-seat-picker-v4.png');
  });
  it('a card for v4 opens v4, never v1 of the same base', () => {
    const v = versionForPath(families, 'group-seat-picker-v4.png');
    expect(v?.n).toBe(2);
    expect(versionForPath(families, 'group-seat-picker.png')?.n).toBe(1);
  });
  it('two files in one folder never swap', () => {
    expect(versionForPath(families, 'designs/w-f9685b42f1/onboarding-b-team-look.png')?.name).toBe('onboarding-b-team-look.png');
    expect(versionForPath(families, 'designs/w-f9685b42f1/group-seat-picker-v4.png')?.name).not.toBe('onboarding-b-team-look.png');
  });
  it('a name the thread never said opens nothing rather than another file', () => {
    expect(versionForPath(families, 'seat-picker-21-v2.png')).toBeNull();
    expect(versionForPath(families, 'designs/w-f9685b42f1/picker-v4.png')).toBeNull();
    expect(versionForPath(families, 'other/group-seat-picker-v4.png.bak')).toBeNull();
  });
  it('a name that is only the end of another name is not that file', () => {
    expect(versionForPath(families, 'seat-picker-v4.png')).toBeNull();
  });
});

describe('the big view lands where the card points', () => {
  const view = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
  it('finds the press through the one landing rule, which reads versionForPath', () => {
    expect(view).toContain('whereAPressLands(families, { path: open.path');
    expect(fs.readFileSync(path.join(import.meta.dirname, '..', 'shared/artifact-marks.mjs'), 'utf8')).toContain('const v = versionForPath(families, path);');
  });
  it('does not fall back to the last file when a path was asked for', () => {
    expect(view).not.toMatch(/\?\? flat\[flat\.length - 1\];/);
  });
});

describe('a version another place made', () => {
  it("rides on the line as newer, so the view can tell it from the thread's own", () => {
    const lines = [
      said(1, '[plan.md](designs/plan.md)'),
      { ts: 2, source: 'agent', patch: { note: '[plan-v2.md](/store/designs/w-x/plan-v2.md)', newer: true } },
    ];
    const [family] = threadFiles(filesInLines(lines));
    expect(family.versions.map((v) => [v.name, !!v.newer])).toEqual([['plan.md', false], ['plan-v2.md', true]]);
  });
});
