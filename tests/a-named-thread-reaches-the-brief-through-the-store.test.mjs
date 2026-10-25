// A THREAD NAMED WITH # REACHES THE AGENT'S BRIEF, read off the real store
// (w-c110f2371d). shared/named-threads.mjs writes the section; this drives the
// Supervisor's briefs over a real ledger on disk, because a section that stops
// being added throws nothing: the agent just arrives holding a bare id again.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';

let root;
let store;
const products = {};

const project = (slug, name, extra = {}) => {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ slug, name, ...extra }));
  products[slug] = { slug, name, dir, repoPath: null, ...extra };
};

const supervisor = () => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = root;
  s.dataDir = root;
  s.config = { personalProducts: [] };
  s.store = store;
  s.statePageOn = () => true;
  s.writingRules = () => '';
  return s;
};

let login;
let diary;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'named-'));
  project('acme', 'Acme');
  project('notes', 'Notes', { seenBy: 'private' });
  store = await new Store({ accountRoot: root, products: [] }).init();
  login = store.composeItem('acme', { title: 'Fix the login loop on the phone' });
  store.recordSessionResult('acme', login.id, { result: 'Fixed: the phone keeps its sign-in across sleep.', status: 'done' });
  diary = store.composeItem('notes', { title: 'Private diary' });
  store.recordSessionResult('notes', diary.id, { result: 'Secret words.', status: 'done' });
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

describe('the brief a named thread reaches', () => {
  it('a new thread names one in its body', () => {
    const item = { id: 'w-1111111111', product: 'acme', title: 'Do the same for the desktop', body: `Do what [Fix the login loop on the phone](${login.id}) did.` };
    const brief = supervisor().buildBrief(item, products.acme, { continuation: false });
    expect(brief).toContain(`## Fix the login loop on the phone (${login.id})`);
    expect(brief).toContain('Fixed: the phone keeps its sign-in across sleep.');
  });
  it('a reply to a running session names one, in another project', () => {
    const item = { id: 'w-2222222222', product: 'notes', title: 'x', answer: `Like [Fix the login loop on the phone](${login.id})` };
    expect(supervisor().replyBrief(item, { product: products.notes })).toContain('Fixed: the phone keeps its sign-in across sleep.');
  });
  it('a resumed session is told of one named in the reply that woke it', () => {
    const item = { id: 'w-3333333333', product: 'acme', title: 'x', answer: `See ${login.id}` };
    expect(supervisor().resumeBrief(item, { continuation: true, product: products.acme })).toContain('Fixed: the phone keeps its sign-in across sleep.');
  });
  it('a thread only its owner sees is never summed up into one the team sees', () => {
    const item = { id: 'w-4444444444', product: 'acme', title: 'x', answer: `Use [Private diary](${diary.id})` };
    const brief = supervisor().replyBrief(item, { product: products.acme });
    expect(brief).toContain(`## ${diary.id}`);
    expect(brief).not.toContain('Secret words.');
  });
  it('a message naming no thread gets no section', () => {
    const item = { id: 'w-5555555555', product: 'acme', title: 'x', answer: 'Make it taller.' };
    expect(supervisor().replyBrief(item, { product: products.acme })).not.toContain('# The threads this message names');
  });
});
