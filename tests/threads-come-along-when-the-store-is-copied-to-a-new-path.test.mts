// THREADS COME ALONG WHEN THE STORE IS COPIED TO A NEW PATH.
//
// A tester copied a whole home folder to a new path and started the app on it.
// Every project was there and every thread was gone: the inbox said "Inbox 0".
// The threads live under `<app home>/projects/<the project's path, encoded>`,
// so at the new path each project looked up a name nothing was filed under,
// while the copied records sat beside it under the old path's name.
//
// This writes threads at one path, copies the folder to another, and checks
// the threads read back there; that a project which already has threads at
// the new path keeps them, after the old ones; that running it twice adds
// nothing; and that records for a project the store does not have are left.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { carryMovedStoreMachinery } from '../main/store/home.mts';
import { createWorkItem, readWorkItems } from '../main/store/work-items.mts';
import { setAppHome } from './app-home.mts';

const ACCOUNT = 'acct-moved';
let dir: string, oldRoot: string, newRoot: string;

function makeProduct(root: string, slug: string) {
  const at = path.join(root, 'accounts', ACCOUNT, slug);
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug }));
  return at;
}

const titles = (productDir: string) => readWorkItems(productDir).map((i) => i.title).sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-moved-store-'));
  oldRoot = path.join(dir, 'old', '.local', 'share', 'agentbox');
  newRoot = path.join(dir, 'new', '.local', 'share', 'agentbox');
  setAppHome(oldRoot);
  createWorkItem(makeProduct(oldRoot, 'vowels'), { title: 'Vowel count and test' });
  createWorkItem(path.join(oldRoot, 'accounts', ACCOUNT, 'vowels'), { title: 'DashCase conversion and test' });
  createWorkItem(makeProduct(oldRoot, 'parity'), { title: 'Even and odd functions' });
  fs.cpSync(path.join(dir, 'old'), path.join(dir, 'new'), { recursive: true });
  setAppHome(newRoot);
});

afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('a store copied to a new path', () => {
  it('reads its threads back at the new path', () => {
    const vowels = path.join(newRoot, 'accounts', ACCOUNT, 'vowels');
    expect(titles(vowels)).toEqual([]);
    expect(carryMovedStoreMachinery(newRoot).sort()).toEqual([vowels, path.join(newRoot, 'accounts', ACCOUNT, 'parity')].sort());
    expect(titles(vowels)).toEqual(['DashCase conversion and test', 'Vowel count and test']);
    expect(titles(path.join(newRoot, 'accounts', ACCOUNT, 'parity'))).toEqual(['Even and odd functions']);
  });

  it('keeps threads already made at the new path, after the old ones', () => {
    const vowels = path.join(newRoot, 'accounts', ACCOUNT, 'vowels');
    createWorkItem(vowels, { title: 'Made after the move' });
    carryMovedStoreMachinery(newRoot);
    expect(titles(vowels)).toEqual(['DashCase conversion and test', 'Made after the move', 'Vowel count and test']);
    const ledger = fs.readFileSync(path.join(newRoot, 'projects', vowels.replace(/[^A-Za-z0-9]/g, '-'), 'work-items.jsonl'), 'utf8');
    expect(ledger.indexOf('Vowel count')).toBeLessThan(ledger.indexOf('Made after the move'));
  });

  it('carries nothing the second time', () => {
    carryMovedStoreMachinery(newRoot);
    expect(carryMovedStoreMachinery(newRoot)).toEqual([]);
    expect(titles(path.join(newRoot, 'accounts', ACCOUNT, 'vowels'))).toHaveLength(2);
  });

  it('leaves records for a project this store does not have', () => {
    fs.rmSync(path.join(newRoot, 'accounts', ACCOUNT, 'parity'), { recursive: true });
    expect(carryMovedStoreMachinery(newRoot)).toEqual([path.join(newRoot, 'accounts', ACCOUNT, 'vowels')]);
    const left = fs.readdirSync(path.join(newRoot, 'projects')).filter((n) => n.includes('old') && n.endsWith('parity'));
    expect(left).toHaveLength(1);
    expect(fs.existsSync(path.join(newRoot, 'projects', left[0], 'work-items.jsonl'))).toBe(true);
  });

  it('leaves a store that never moved alone', () => {
    setAppHome(oldRoot);
    expect(carryMovedStoreMachinery(oldRoot)).toEqual([]);
    expect(titles(path.join(oldRoot, 'accounts', ACCOUNT, 'vowels'))).toHaveLength(2);
  });
});

describe('both doors carry a moved store before the store opens', () => {
  it.each(['main/main.mts', 'main/serve.mts'])('%s', (file) => {
    const text = fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');
    const carry = text.indexOf('carryMovedStoreMachinery(');
    expect(carry).toBeGreaterThan(-1);
    expect(carry).toBeLessThan(text.indexOf('new Store('));
  });
});
