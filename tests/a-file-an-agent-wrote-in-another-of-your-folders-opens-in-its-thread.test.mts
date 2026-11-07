// A FILE AN AGENT WROTE IN ANOTHER OF YOUR FOLDERS OPENS IN ITS THREAD.
//
// Sofia's copywriter saved launch-film-shot-list.md "in the Direct
// space you share with Maya and Dev" and named it in her thread. Pressing the
// name said "launch-film-shot-list.md could not be found." for 25 minutes; the
// same file opened only once a message carried it. launch-storyboard.md, the
// same. Measured here: the finder looks only inside the thread's own project,
// and the agent had written into another project (the conversation's folder),
// so the name found nothing.
//
// The finder still never guesses into another project: only a file an agent of
// this project really wrote there opens, and only while it is there.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mjs';
import { noteAgentWrites, noteWrittenElsewhere, writtenElsewhere, writtenFileNamed, writesInClaudeLine } from '../main/store/written-elsewhere.mjs';

let root, own, direct, products;
const put = (dir, rel, text = 'x') => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const open = (src) => resolveArtifact({ src, product: 'company', products, accountRoot: path.join(root, 'accounts', 'a') });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'written-elsewhere-'));
  own = path.join(root, 'accounts', 'a', 'company');
  direct = path.join(root, 'accounts', 'a', 'direct-6d14f469');
  fs.mkdirSync(own, { recursive: true });
  fs.mkdirSync(direct, { recursive: true });
  products = [
    { slug: 'company', name: 'Company', dir: own },
    { slug: 'direct-6d14f469', name: 'Maya and Dev', dir: direct, team: { direct: true, projectId: 'p1' } },
  ];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a name an agent says in its thread', () => {
  it('opens the file the agent wrote in the conversation folder', async () => {
    const file = put(direct, 'launch-film-shot-list.md', '# Shot list\n');
    noteWrittenElsewhere(own, { run: 'w-aaaaaaaa', file });
    expect((await open('launch-film-shot-list.md')).path).toBe(file);
  });

  it('opens it by its folder and name too', async () => {
    const file = put(direct, 'film/launch-storyboard.md');
    noteWrittenElsewhere(own, { run: 'w-aaaaaaaa', file });
    expect((await open('film/launch-storyboard.md')).path).toBe(file);
    expect((await open('launch-storyboard.md')).path).toBe(file);
  });

  it('opens the newest of two the agent wrote under one name', async () => {
    const old = put(direct, 'a/notes.md', 'old');
    const later = put(path.join(root, 'elsewhere'), 'notes.md', 'new');
    noteWrittenElsewhere(own, { run: 'w-aaaaaaaa', file: old }, { now: 1 });
    noteWrittenElsewhere(own, { run: 'w-bbbbbbbb', file: later }, { now: 2 });
    expect((await open('notes.md')).path).toBe(later);
  });

  it('opens this project\'s own file of that name first', async () => {
    const mine = put(own, 'reports/shot-list.md', 'mine');
    noteWrittenElsewhere(own, { run: 'w-aaaaaaaa', file: put(direct, 'shot-list.md', 'theirs') });
    expect((await open('shot-list.md')).path).toBe(mine);
  });
});

describe('what must not open', () => {
  it('a file of that name no agent of this project wrote', async () => {
    put(direct, 'launch-film-shot-list.md');
    const r = await open('launch-film-shot-list.md');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/is not in Company/);
  });

  it('a file the agent wrote that has since gone', async () => {
    const file = put(direct, 'gone.md');
    noteWrittenElsewhere(own, { run: 'w-aaaaaaaa', file });
    fs.rmSync(file);
    expect((await open('gone.md')).ok).toBe(false);
  });

  it('a name that only ends the same way', async () => {
    noteWrittenElsewhere(own, { run: 'w-aaaaaaaa', file: put(direct, 'my-shot-list.md') });
    expect((await open('shot-list.md')).ok).toBe(false);
  });

  it('a name that climbs out', async () => {
    noteWrittenElsewhere(own, { run: 'w-aaaaaaaa', file: put(direct, 'x.md') });
    expect(writtenFileNamed(own, '../direct-6d14f469/x.md')).toBeNull();
    expect(writtenFileNamed(own, path.join(direct, 'x.md'))).toBeNull();
  });

  it('another project\'s list', async () => {
    const file = put(own, 'only-here.md');
    noteWrittenElsewhere(direct, { run: 'w-aaaaaaaa', file: put(root, 'other/elsewhere.md') });
    expect((await open('elsewhere.md')).ok).toBe(false);
    expect((await open('only-here.md')).path).toBe(file);
  });
});

describe('what is listed', () => {
  it('keeps each file once, newest first', () => {
    noteWrittenElsewhere(own, { file: '/a/one.md' }, { now: 1 });
    noteWrittenElsewhere(own, { file: '/a/two.md' }, { now: 2 });
    noteWrittenElsewhere(own, { file: '/a/one.md' }, { now: 3 });
    expect(writtenElsewhere(own)).toEqual(['/a/one.md', '/a/two.md']);
  });

  it('lists nothing for a relative path', () => {
    noteWrittenElsewhere(own, { file: 'one.md' });
    expect(writtenElsewhere(own)).toEqual([]);
  });

  it('reads the files a Claude Code line writes, and nothing it only reads', () => {
    const line = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name, input }] } });
    expect(writesInClaudeLine(line('Write', { file_path: '/x/a.md', content: '' }))).toEqual(['/x/a.md']);
    expect(writesInClaudeLine(line('Edit', { file_path: '/x/b.md' }))).toEqual(['/x/b.md']);
    expect(writesInClaudeLine(line('NotebookEdit', { notebook_path: '/x/c.ipynb' }))).toEqual(['/x/c.ipynb']);
    expect(writesInClaudeLine(line('Read', { file_path: '/x/a.md' }))).toEqual([]);
    expect(writesInClaudeLine(line('Write', { file_path: 'relative.md' }))).toEqual([]);
    expect(writesInClaudeLine('not json')).toEqual([]);
  });

  it('notes a run\'s writes outside the folders the finder walks, and only those', () => {
    const repo = path.join(root, 'repo');
    const line = (file) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Write', input: { file_path: file, content: '' } }] } });
    const product = { dir: own, repoPath: repo };
    for (const file of [path.join(own, 'reports/a.md'), path.join(repo, 'docs/b.md'), path.join(repo, '.claude/worktrees/w-1/plan.md'), '/tmp/cut3/launch-cut-v3.mp4']) {
      noteAgentWrites(product, 'w-1', line(file));
    }
    expect(writtenElsewhere(own).sort()).toEqual(['/tmp/cut3/launch-cut-v3.mp4', path.join(repo, '.claude/worktrees/w-1/plan.md')].sort());
  });
});

describe('a document the agent writes with the store tool', () => {
  let tools, mine, theirs;
  const store = (p) => ({ slug: p.slug ?? p.id, name: p.name, dir: p.dir });
  beforeEach(async () => {
    const { appHome } = await import('../main/store/home.mjs');
    process.env.STORE_ACCOUNT_ID = 'acct-written';
    fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-written'), { recursive: true });
    const { resolveAccount, resolveProduct } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    mine = resolveProduct(createProduct(`Company ${Math.random().toString(36).slice(2, 7)}`).id);
    theirs = resolveProduct(createProduct(`Direct ${Math.random().toString(36).slice(2, 7)}`).id);
    ({ tools } = (await import('../mcp/tools.mjs')).buildTools({ holder: 'test' }));
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });
  const write = (product) => tools.find((t) => t.name === 'write_document').run({ product, path: 'launch-film-shot-list.md', title: 'Shot list', content: '# Shots\n' });
  const openIn = (p, src) => resolveArtifact({ src, product: store(p).slug, products: [store(mine), store(theirs)] });

  it('opens in the thread that wrote it, from the other project', async () => {
    process.env.ZERO_PRODUCT = mine.id;
    process.env.ZERO_ITEM = 'w-1234abcd';
    await write(theirs.id);
    const r = await openIn(mine, 'launch-film-shot-list.md');
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(r.path, 'utf8')).toBe('# Shots\n');
  });

  it('lists nothing when the agent wrote into its own project, or outside any thread', async () => {
    process.env.ZERO_PRODUCT = mine.id;
    await write(mine.id);
    delete process.env.ZERO_PRODUCT;
    await write(theirs.id);
    expect(writtenElsewhere(mine.dir)).toEqual([]);
  });
});
