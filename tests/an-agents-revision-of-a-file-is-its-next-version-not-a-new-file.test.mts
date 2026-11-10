// AN AGENT'S REVISION OF A FILE IS ITS NEXT VERSION, NOT A NEW FILE.
//
// Maya's agent fixed her investor
// update and Files listed two files, october-investor-update.md "v3 · You" and
// october-investor-update-v4.md "v2 · Your agent", and Dev asked "which one is
// real?". The agent's thread was in Lumen app and her file in Company, and a
// file was one per project. Dev's restyled page came back as
// seat-picker-demo-v2.html beside seat-picker-demo.html, because a page or a
// script was keyed by its whole name. Sofia's picture read
// "group-seat-picker-v2.png" over "v5 of 5": a file was called by its newest
// version's name. Connection copies an agent read showed again in its own
// project, "Not on this computer yet".
//
// What must NOT fold: a name with no known base (v2-final-notes.md), two files
// that share a prefix, two projects' own files of the same name, and two
// scripts with the same stem and another extension.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesOf } from '../main/files-place.mts';
import { familyName, familyOfName, threadFiles } from '../shared/artifact-marks.mts';

const say = (ts, note, source = 'agent') => ({ ts, source, patch: { note } });
const edit = (ts, file, p) => ({ ts, by: 'maya', source: 'founder', patch: { artifact: { do: 'edit', file, path: p } } });
const thread = (id, project, lines, dir = null) => ({ ref: { kind: 'thread', product: project.toLowerCase().replace(/\s+/g, '-'), id }, title: id, project, lines, ...(dir ? { dirs: [dir] } : {}) });

describe('an agent on another project\'s thread revising a file', () => {
  const maya = thread('w-maya', 'Company', [
    say(1, 'Here: [october-investor-update.md](designs/october-investor-update.md)'),
    edit(2, 'october-investor-update.md', 'designs/w-maya/october-investor-update-v2.md'),
    edit(3, 'october-investor-update-v2.md', 'designs/w-maya/october-investor-update-v3.md'),
  ]);

  it('joins that file\'s chain as its next version, under the base name, in its project', () => {
    const agent = thread('w-agent', 'Lumen app', [
      say(10, 'Read october-investor-update.md. Saved [the fix](designs/w-agent/october-investor-update-v4.md) as its next version.'),
    ]);
    const files = filesOf([maya, agent]);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ project: 'Company', name: 'october-investor-update.md', versions: 4 });
    expect(files[0].chain.at(-1).copies[0].path).toBe('designs/w-agent/october-investor-update-v4.md');
  });

  it('stays its own file when its thread never names the original', () => {
    const agent = thread('w-agent', 'Lumen app', [say(10, 'Saved [the fix](designs/w-agent/october-investor-update-v4.md).')]);
    expect(filesOf([maya, agent]).map((f) => f.project).sort()).toEqual(['Company', 'Lumen app']);
  });

  it('a project\'s own file of the same name is not another project\'s, though its thread names both', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-readme-'));
    fs.writeFileSync(path.join(dir, 'README.md'), '# Ours');
    const a = thread('w-a', 'Company', [say(1, '[README.md](README.md)')]);
    const b = thread('w-b', 'Lumen app', [say(5, 'Updated [README.md](README.md) and saved [README-v2.md](README-v2.md)')], dir);
    expect(filesOf([a, b]).map((f) => f.project).sort()).toEqual(['Company', 'Lumen app']);
  });
});

describe('names that are not versions of anything', () => {
  it('v2-final-notes.md with no known base stays its own file', () => {
    const t = thread('w-1', 'Company', [say(1, '[notes.md](notes.md) and [v2-final-notes.md](v2-final-notes.md)')]);
    expect(filesOf([t]).map((f) => f.name).sort()).toEqual(['notes.md', 'v2-final-notes.md']);
  });

  it('two files that share a prefix stay two', () => {
    const t = thread('w-1', 'Company', [say(1, '[launch-plan.md](launch-plan.md) [launch-plan-two-weeks.md](launch-plan-two-weeks.md)')]);
    expect(filesOf([t])).toHaveLength(2);
  });
});

describe('a page or a script', () => {
  it('seat-picker-demo-v2.html is version 2 of seat-picker-demo.html', () => {
    const t = thread('w-1', 'Lumen app', [say(1, '[seat-picker-demo.html](seat-picker-demo.html)'), say(2, 'Restyled: [seat-picker-demo-v2.html](seat-picker-demo-v2.html)')]);
    const files = filesOf([t]);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: 'seat-picker-demo.html', kind: 'page', versions: 2 });
  });

  it('keeps a name it was filed under before', () => {
    // The key a page or script had before, `${stem}\0${name}`, for any name with no version tail.
    for (const name of ['seat-picker-demo.html', 'Group_Booking.PY', 'README', 'clinics.csv']) {
      const dot = name.lastIndexOf('.');
      expect(familyOfName(name)).toBe(`${(dot > 0 ? name.slice(0, dot) : name).toLowerCase()}\0${name}`);
    }
    expect(familyOfName('seat-picker-demo-v2.html')).toBe(familyOfName('seat-picker-demo.html'));
  });

  it('two stems, or one stem in two kinds of file, stay apart', () => {
    expect(familyOfName('group_booking.py')).not.toBe(familyOfName('group_bookings.py'));
    expect(familyOfName('config.json')).not.toBe(familyOfName('config.yaml'));
  });
});

describe('the name a file is called by', () => {
  it('is its base name whatever version is newest, so the name and the count agree', () => {
    const [fam] = threadFiles(['group-seat-picker.png', 'group-seat-picker-v2.png', 'group-seat-picker-v3.png', 'group-seat-picker-v4.png', 'group-seat-picker-v5.png'].map((p, i) => ({ path: p, at: i })));
    expect(familyName(fam, fam.versions[4])).toBe('group-seat-picker.png');
    expect(familyName(fam, fam.versions[1])).toBe('group-seat-picker.png');
  });

  it('a file with one version keeps the name it was given', () => {
    const [fam] = threadFiles([{ path: 'launch-teaser-v7.mp4' }]);
    expect(familyName(fam, fam.versions[0])).toBe('launch-teaser-v7.mp4');
  });
});

describe('a copy kept from a connection', () => {
  const copies = thread('w-copies', 'Company', [say(1, '[lum-41-group-bookings.md](sources/linear/lum-41-group-bookings.md)\n[launch-plan-for-group-bookings-1f2a9c3e.md](sources/notion/launch-plan-for-group-bookings-1f2a9c3e.md)', 'system')]);

  it('is listed once when an agent in another project reads it', () => {
    const agent = thread('w-agent', 'Lumen app', [say(5, 'From [LUM-41](sources/linear/lum-41-group-bookings.md): a block of six.')]);
    const files = filesOf([copies, agent]);
    expect(files.map((f) => `${f.project}/${f.name}`).sort()).toEqual(['Company/launch-plan-for-group-bookings.md', 'Company/lum-41-group-bookings.md']);
  });

  it('is called by its title, not the id the copy carries to keep rows apart', () => {
    expect(filesOf([copies]).map((f) => f.name)).toContain('launch-plan-for-group-bookings.md');
  });

  it('a file of yours that only ends like an id keeps its name', () => {
    const t = thread('w-1', 'Company', [say(1, '[build-1f2a9c3e.md](notes/build-1f2a9c3e.md)')]);
    expect(filesOf([t])[0].name).toBe('build-1f2a9c3e.md');
  });
});
