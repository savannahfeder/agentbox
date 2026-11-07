// A FILE THE THREAD SHOWS IS NOT OFFERED AS CODE TO SHIP (2026-11-01).
//
// On the team version, an agent's launch-plan.md and a seat-picker picture,
// both drawn in their threads, sat over "This change was never committed.
// 1 Commit it and ship (recommended) 2 Discard the change", because the project
// folder is a git repository and the files were loose in it. For a document the
// thread already shows, commit-and-ship reads as code talk. Measured by
// building the offer from a saved change's files and the files the thread names.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMIT_FIRST_OFFER, NAME_YOURSELF_OFFER, NOT_COMMITTED_ASK, SHIP_OFFER,
  changedFiles, onlyNamedFiles, shipOfferFor,
} from '../renderer/src/ship-offer.ts';
import { discardsTheChange, leavesItOnTheBranch, needsYourWords } from '../renderer/src/format.ts';

const loose = { committed: false, uncommitted: true, knowsYou: true };
const DIR = '/work/lumen';
const change = (...files) => ({ files: files.map((f) => (typeof f === 'string' ? { path: f } : f)), plus: 10, minus: 0 });

describe('which changed files the thread already shows', () => {
  it('a document the thread names is all that changed', () => {
    expect(onlyNamedFiles(changedFiles(change('launch-plan.md')), ['launch-plan.md'], DIR)).toEqual(['launch-plan.md']);
  });
  // A thread works in its own folder beside the project, so the file read off
  // the disk is not under the project folder; its path in that folder still names it.
  it('a document in the thread\'s own working folder, named as the thread names it', () => {
    const own = { path: 'pricing-table.md', abs: '/work/lumen/.claude/worktrees/w-1/pricing-table.md' };
    expect(onlyNamedFiles(changedFiles(change(own)), ['pricing-table.md'], DIR)).toEqual(['pricing-table.md']);
    expect(onlyNamedFiles(changedFiles(change(own, { path: 'src/app.ts', abs: '/work/lumen/.claude/worktrees/w-1/src/app.ts' })), ['pricing-table.md'], DIR)).toBeNull();
  });
  it('matches a file by its whole path, or by where it sits under the folder', () => {
    expect(onlyNamedFiles(changedFiles(change({ path: 'x/seat-picker.png', abs: `${DIR}/designs/seat-picker.png` })), ['designs/seat-picker.png'], DIR)).toEqual(['seat-picker.png']);
    expect(onlyNamedFiles(changedFiles(change('app/designs/seat-picker.html', 'app/designs/seat-picker.png')), ['designs/seat-picker.html', 'designs/seat-picker.png'], DIR)).toEqual(['seat-picker.html', 'seat-picker.png']);
  });
  it('any file the thread does not name is code, and the answer is no', () => {
    expect(onlyNamedFiles(changedFiles(change('launch-plan.md', 'src/booking.ts')), ['launch-plan.md'], DIR)).toBeNull();
    expect(onlyNamedFiles(changedFiles(change('src/plan.md')), ['plan.md.bak'], DIR)).toBeNull();
    expect(onlyNamedFiles(changedFiles(change('other/launch-plan.md')), ['launch-plan.md'], DIR)).toBeNull();
  });
  it('nothing changed, or nothing named, is never only files', () => {
    expect(onlyNamedFiles([], ['launch-plan.md'], DIR)).toBeNull();
    expect(onlyNamedFiles(changedFiles(change('launch-plan.md')), [], DIR)).toBeNull();
    expect(changedFiles(null)).toEqual([]);
  });
});

describe('the offer over loose files', () => {
  it('asks plainly about one file, by its name', () => {
    const offer = shipOfferFor(loose, ['launch-plan.md']);
    expect(offer.ask).toBe('Add launch-plan.md to the project?');
    expect(offer.options.map((o) => o.text)).toEqual(['Add it to the project', 'Throw it away']);
    expect(offer.options[0].recommended).toBe(true);
    expect(offer.headed).toBe(true);
  });
  it('and about several, by how many', () => {
    const offer = shipOfferFor(loose, ['seat-picker.html', 'seat-picker.png']);
    expect(offer.ask).toBe('Add these 2 files to the project?');
    expect(offer.options.map((o) => o.text)).toEqual(['Add them to the project', 'Throw them away']);
  });
  it('throwing a file away still asks first, and adding it neither opens the box nor parks it', () => {
    for (const n of [['a.md'], ['a.md', 'b.png']]) {
      const [add, bin] = shipOfferFor(loose, n).options;
      expect(discardsTheChange(bin.text)).toBe(true);
      expect(needsYourWords(add.text) || leavesItOnTheBranch(add.text) || discardsTheChange(add.text)).toBe(false);
    }
  });
});

describe('code is offered exactly as before', () => {
  it('loose code still asks to commit it and ship', () => {
    expect(shipOfferFor(loose)).toEqual({ ask: NOT_COMMITTED_ASK, options: COMMIT_FIRST_OFFER, headed: true });
    expect(shipOfferFor(loose, null)).toEqual({ ask: NOT_COMMITTED_ASK, options: COMMIT_FIRST_OFFER, headed: true });
    expect(shipOfferFor(loose, [])).toEqual({ ask: NOT_COMMITTED_ASK, options: COMMIT_FIRST_OFFER, headed: true });
  });
  it('git that cannot name you still asks for a name, files or not', () => {
    expect(shipOfferFor({ ...loose, knowsYou: false }, ['launch-plan.md']).options).toBe(NAME_YOURSELF_OFFER);
  });
  it('committed work is still offered to ship, and thrown-away work asks nothing', () => {
    expect(shipOfferFor({ committed: true, uncommitted: false, knowsYou: true }, ['launch-plan.md']).options).toBe(SHIP_OFFER);
    expect(shipOfferFor({ committed: false, uncommitted: false, knowsYou: true }, ['launch-plan.md'])).toBeNull();
  });
  it('the thread hands the offer the files its words name', () => {
    const focus = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/Focus.tsx'), 'utf8');
    expect(focus).toMatch(/shipOfferFor\(standing, onlyNamedFiles\(changed, referencedFiles\(item\.result, item\.note, item\.body, item\.answer, \{ dir: productDir \}\), productDir\)\)/);
  });
});
