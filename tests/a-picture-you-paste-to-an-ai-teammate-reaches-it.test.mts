// "I literally just tried pasting a picture, the most basic fundamental thing,
// and it didn't work. I bet if I tried to attach things, it wouldn't work
// either." (2026-11-09, a new teammate's chat.) Read from the code: the AI
// teammate chat's box (TeammatesPage.tsx `Composer`) handed RichReply no
// `onFiles`, drew no AttachRow, and gave FormatBar no `onAttach`, so a pasted
// screenshot, a dropped file and the clip button all did nothing, while the
// room chat and a thread's reply box took all three. Here: files go into the
// project the teammate's run works in, the message remembers which, the run
// finds the picture on disk, and the chat draws it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { saveAttachments, attachmentMarkdown } from '../main/save-attachments.mts';
import { referencedFiles } from '../shared/referenced-files.mts';
import { teammateIdOf } from '../shared/teammates.mts';
import { whereFilesGo, filesProductOf, attachedPath, withFiles } from '../renderer/src/teammates/chat-files.ts';
import { firstSentence } from '../renderer/src/teammates/chat-lines.ts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('where a teammate chat\'s files go and how they are drawn', () => {
  const places = [{ slug: 'chunk', name: 'Chunk' }, { slug: 'truncate', name: 'Truncate' }];
  const t = { id: 't-aaaaaaaaaa', product: 'chunk' };

  it('saves into the project the teammate works in', () => {
    expect(whereFilesGo('What is wrong on this screen?', t, places)).toBe('chunk');
  });

  it('saves into the project your words name, which is where its run will be', () => {
    expect(whereFilesGo('Fix this in the truncate project', t, places)).toBe('truncate');
  });

  it('puts the links under the words, or alone when there are no words', () => {
    expect(withFiles('Look', '![a.png](attachments/a.png)')).toBe('Look\n\n![a.png](attachments/a.png)');
    expect(withFiles('  ', '![a.png](attachments/a.png)')).toBe('![a.png](attachments/a.png)');
    expect(withFiles('Look', '')).toBe('Look');
  });

  it('finds a message\'s files in the project they were saved in', () => {
    const team = [{ id: 't-aaaaaaaaaa', product: 'chunk' }];
    expect(filesProductOf({ from: 'you', to: [t.id], filesIn: 'truncate' }, team)).toBe('truncate');
    expect(filesProductOf({ from: 'you', to: [t.id] }, team)).toBe('chunk');
    expect(filesProductOf({ from: 't-aaaaaaaaaa', to: [] }, team)).toBe('chunk');
    expect(filesProductOf({ from: 'you', to: ['t-gone'] }, team)).toBeNull();
  });

  it('says the words, not the link, on the one line under your message', () => {
    expect(firstSentence('What is wrong here?\n\n![pasted-1.png](attachments/x-pasted-1.png)')).toBe('What is wrong here?');
    expect(firstSentence('Look at this\n\n![pasted-1.png](attachments/x-pasted-1.png)')).toBe('Look at this');
    expect(firstSentence('![pasted-1.png](attachments/x-pasted-1.png)\n[notes.pdf](attachments/y-notes.pdf)')).toBe('pasted-1.png, notes.pdf');
    expect(firstSentence('See [the guide](https://example.com/guide). Then go.')).toBe('See [the guide](https://example.com/guide).');
  });

  it('draws a picture from the project\'s attachments, and nothing outside it', () => {
    expect(attachedPath('attachments/a.png', '/acct/chunk')).toBe('/acct/chunk/attachments/a.png');
    expect(attachedPath('./attachments/a.png', '/acct/chunk')).toBe('/acct/chunk/attachments/a.png');
    expect(attachedPath('attachments/../../other/a.png', '/acct/chunk')).toBeNull();
    expect(attachedPath('https://example.com/a.png', '/acct/chunk')).toBeNull();
    expect(attachedPath('attachments/a.png', null)).toBeNull();
  });
});

describe('a picture sent to a teammate reaches its run', () => {
  let home; let chunk; let team; let work; let store;
  const dirOf = (slug) => path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, slug);

  beforeEach(async () => {
    home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    chunk = createProduct(`Chunk ${Math.random().toString(36).slice(2, 6)}`);
    const mods = await loadStore();
    work = mods.workItemsDisk;
    const products = [{ slug: chunk.id, dir: dirOf(chunk.id), name: chunk.name }];
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => products,
      productDir: (slug) => dirOf(slug),
      listItems: (now) => products.flatMap((p) => work.readWorkItems(p.dir, now).map((i) => ({ ...i, product: p.slug }))),
    };
    team = new Teammates(store);
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('keeps which project the files are in, and the run opens on a picture it can read', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    const saved = saveAttachments(dirOf(chunk.id), [{ name: 'pasted-1.png', dataBase64: Buffer.from('png').toString('base64') }]);
    const m = team.post({ text: withFiles('What is wrong here?', attachmentMarkdown(saved)), to: [chief.id], filesIn: chunk.id });
    expect(m.filesIn).toBe(chunk.id);
    await team.tick({ items: store.listItems(), deliver: async () => {} });
    const [run] = store.listItems().filter((i) => teammateIdOf(i) === chief.id);
    expect(run.product).toBe(chunk.id);
    const [rel] = referencedFiles(run.body, { dir: dirOf(run.product) });
    expect(rel).toBe(saved[0].rel);
    expect(fs.existsSync(path.join(dirOf(run.product), rel))).toBe(true);
  });

  it('a picture alone, with no words, is still sent', () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    const m = team.post({ text: withFiles('', '![a.png](attachments/a.png)'), to: [chief.id], filesIn: chunk.id });
    expect(m.text).toBe('![a.png](attachments/a.png)');
  });

  it('does not keep a project that is not one of yours', () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    const m = team.post({ text: 'Hello', to: [chief.id], filesIn: 'not-a-project' });
    expect(m.filesIn).toBeUndefined();
  });
});

describe('the teammate chat box takes files the way every other box does', () => {
  const page = read('renderer/src/teammates/TeammatesPage.tsx');
  const box = page.slice(page.indexOf('function Composer('), page.indexOf('/* ------------------------------------------------------------------- log */'));

  it('takes a pasted or dropped file', () => {
    expect(box).toMatch(/onPaste=\{async \(e\) => \{ const got = await fromPaste\(e\);/);
    expect(box).toMatch(/onDrop=\{async \(e\) => \{ e\.preventDefault\(\); add\(await collect\(e\.dataTransfer\.files\)\); \}\}/);
  });

  it('shows what is attached before it goes, and offers the clip', () => {
    expect(box).toMatch(/<AttachRow /);
    expect(box).toMatch(/className="tc-icon dock-clip"[^>]*onClick=\{\(\) => picker\.current\?\.click\(\)\}/);
    expect(box).toMatch(/<input [^>]*type="file"/);
  });

  it('saves the files into the project before it sends', () => {
    expect(box).toMatch(/persistAttachments\(/);
  });

  it('is given a project in the chat and in a new teammate\'s first answer', () => {
    expect(page).toMatch(/<Composer placeholder=\{placeholder\} filesIn=/);
    expect(page).toMatch(/<Composer placeholder="Answer your new teammate" filesIn=/);
  });

  it('tells the store which project the files went into', () => {
    expect(read('main/ipc.mts')).toMatch(/mates\.post\(\{[^}]*filesIn: a\.filesIn/);
  });
});
