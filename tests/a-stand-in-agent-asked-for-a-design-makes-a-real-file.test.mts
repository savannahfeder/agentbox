// A STAND-IN AGENT ASKED FOR A DESIGN MAKES A REAL FILE.
//
// Asked on w-1fc102959f (2026-11-06): "make sure artifact sharing works well,
// not just thread sharing", tested by power users. On stand-ins no thread ever
// made a file, so a team test had nothing to share but words. A stand-in now
// saves a small real file where a real agent saves one (the project's
// documents, designs/<task id>/) when the task asks for something to look at,
// names it by its full path, and makes name-v2 when a reply asks for a change.
// Pinned: each kind, two options when asked for two, the next version on a
// reply, and nothing at all for a task that asks for no file.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artifactsFor, makeArtifacts, madeBefore } from '../scripts/lib/stand-in-artifacts.mjs';

const task = (title) => `Title: ${title}`;

describe('what a stand-in makes', () => {
  it('makes the kind of file the task asks for', () => {
    expect(artifactsFor({ task: task('make a prototype page of the new checkout screen as an html file') })).toEqual([{ name: 'make-a-prototype-page-of.html', kind: 'html' }]);
    expect(artifactsFor({ task: task('find every endpoint that skips the auth check and put them in a table') })[0].kind).toBe('csv');
    expect(artifactsFor({ task: task('write a short runbook for rotating the stripe keys') })[0].kind).toBe('md');
    expect(artifactsFor({ task: task('draw the booking flow as a diagram') })[0].kind).toBe('png');
  });

  it('makes two when asked for two options', () => {
    expect(artifactsFor({ task: task('mock up an empty state for the bookings list, two options') }).map((a) => a.name))
      .toEqual(['mock-up-an-empty-state-option-1.png', 'mock-up-an-empty-state-option-2.png']);
  });

  it('makes nothing for a task that asks for no file', () => {
    expect(artifactsFor({ task: task('add an idempotency key to POST /payments') })).toEqual([]);
    expect(artifactsFor({ task: task('bump node to 22 and fix whatever breaks') })).toEqual([]);
  });

  it('makes the next version of what the thread made when a reply asks for a change', () => {
    expect(artifactsFor({ task: task('mock up a screen'), asked: 'make it darker', made: ['mock-up-a-screen.png'] })).toEqual([{ name: 'mock-up-a-screen-v2.png', kind: 'png' }]);
    expect(artifactsFor({ task: task('mock up a screen'), asked: 'again', made: ['mock-up-a-screen-v2.png'] })[0].name).toBe('mock-up-a-screen-v3.png');
  });

  it('saves the files under designs/<task id>/ in the documents and reads them back off the thread', () => {
    const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-in-docs-'));
    const files = makeArtifacts({ docsDir: docs, item: 'w-abc', task: task('mock up an empty state, two options') });
    expect(files).toEqual([path.join(docs, 'designs', 'w-abc', 'mock-up-an-empty-state-option-1.png'), path.join(docs, 'designs', 'w-abc', 'mock-up-an-empty-state-option-2.png')]);
    for (const f of files) expect(fs.readFileSync(f).subarray(1, 4).toString()).toBe('PNG');
    expect(madeBefore(`Earlier answer:\n${files.join('\n')}`, 'w-abc')).toEqual(['mock-up-an-empty-state-option-1.png', 'mock-up-an-empty-state-option-2.png']);
    expect(madeBefore(files.join('\n'), 'w-other')).toEqual([]);
  });

  // The second team run (2026-11-09) read v1, v2 and v3 of one table as the same bytes, which no real redraw is.
  it('makes each version a different file, pictures and tables alike', () => {
    const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-in-docs-'));
    for (const t of ['mock up a screen', 'put the endpoints in a table']) {
      const [v1] = makeArtifacts({ docsDir: docs, item: 'w-v', task: task(t) });
      const [v2] = makeArtifacts({ docsDir: docs, item: 'w-v', task: task(t), asked: 'again', promptText: v1 });
      const [v3] = makeArtifacts({ docsDir: docs, item: 'w-v', task: task(t), asked: 'again', promptText: v2 });
      const bytes = [v1, v2, v3].map((f) => fs.readFileSync(f).toString('base64'));
      expect(new Set(bytes).size, t).toBe(3);
    }
  });

  it('makes nothing without a documents folder or a task id', () => {
    expect(makeArtifacts({ docsDir: null, item: 'w-abc', task: task('mock up a screen') })).toEqual([]);
    expect(makeArtifacts({ docsDir: os.tmpdir(), item: null, task: task('mock up a screen') })).toEqual([]);
  });
});
