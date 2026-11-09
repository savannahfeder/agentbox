// A FILE SHARED WITH YOU COMES INTO YOUR AGENTBOX AS YOUR OWN COPY.
//
// Asked 2026-11-09 (w-17c726d3a4): "if someone shares a doc with me can I
// bring that into my Agentbox workspace easily, and edit it?" There was no way
// at all: the link page offered comments and a download. Now the page's "Open
// in Agentbox" hands the app agentbox://f/<token>, and the app saves the file
// into the project on screen, on a closed thread of its own that runs nothing
// until they write to it. Measured with Maya sharing on the memory cloud and
// Jun bringing it into a real store: the bytes, the thread, that the pane may
// edit the copy, a film, a stopped link, and which links count.
import { it, expect, beforeAll, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { LINK_PIECE_BYTES, linkCopyOf } from '../main/file-link.mts';
import { bringSharedFile, fileLinkToken, sharedFileTitle } from '../main/bring-shared-file.mts';
import { canWrite } from '../main/doc-file.mts';
import { TopBar } from '../renderer/src/shared-file/SharedFilePage.tsx';

const TOK = '0123456789abcdef0123456789abcdef01234567';

describe('which links bring a file in', () => {
  it('takes the web address and the app\'s own link, however it was pasted', () => {
    for (const s of [`https://app.agentbox.ac/f/${TOK}`, `https://app.agentbox.ac/f/${TOK}/`, ` https://agentbox-phone.pages.dev/f/${TOK}?x=1 `, `agentbox://f/${TOK}`]) {
      expect(fileLinkToken(s), s).toBe(TOK);
    }
  });
  it('turns down a room invite, another address, a short token and a bare token', () => {
    for (const s of [`agentbox://join/${TOK}`, `https://agentbox.ac/join/${TOK}`, `https://app.agentbox.ac/g/${TOK}`, 'https://app.agentbox.ac/f/short', TOK, '', null]) {
      expect(fileLinkToken(s), String(s)).toBeNull();
    }
  });
});

describe('bringing it in', () => {
  let cloud: ReturnType<typeof createMemoryCloud>;
  let maya: ReturnType<typeof createTeamService>;
  let jun: ReturnType<typeof createTeamService>;
  let store: Store;
  let slug: string;
  const mac = async (personId: string) => {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bring-in-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const s = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const team = createTeamService({
      session: memorySession(() => memoryBackend(cloud, personId)),
      store: s, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
      shareSite: 'https://app.agentbox.ac',
    });
    return { s, team };
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bring-in-files-'));
  const shareFrom = async (name: string, bytes: Buffer | string, source = `p/w-1/${name}`) => {
    fs.writeFileSync(path.join(dir, name), bytes);
    const copy = linkCopyOf(path.join(dir, name));
    if ('error' in copy && copy.error) throw new Error(copy.error);
    return (await maya.shareFile({ source, ...(copy as Exclude<typeof copy, { error: string }>) })).link.token as string;
  };
  const bring = (token: string) => bringSharedFile({
    token, product: slug, read: (t) => jun.readFileLink(t), productDir: store.productDir(slug),
    compose: (fields) => store.composeItem(slug, fields),
    close: (id) => { store.answerItem(slug, id, { status: 'done' }); },
  });

  beforeAll(async () => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud();
    maya = (await mac(signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }))).team;
    await maya.signIn();
    const j = await mac(signUpMemory(cloud, { email: 'jun@else.test', name: 'Jun' }));
    jun = j.team;
    store = j.s;
    slug = store.createProduct({ name: 'Launch' }).slug;
  });

  it('saves the document into the project, on a closed thread named by its heading that names the file and who sent it', async () => {
    const token = await shareFrom('pricing.md', '# Pricing plan\n\nThree tiers.\n');
    const out = await bring(token);
    const file = path.join(store.productDir(slug), out.src);
    expect(fs.readFileSync(file, 'utf8')).toBe('# Pricing plan\n\nThree tiers.\n');
    expect(out.src).toMatch(/^attachments\/.+-pricing\.md$/);
    const row = store.readItem(slug, out.id)!;
    expect(row.title).toBe('Pricing plan');
    expect(row.status).toBe('done');
    expect(row.body).toContain(`Maya Chen shared this with me at https://app.agentbox.ac/f/${token}`);
    expect(row.body).toContain(`[pricing.md](${out.src})`);
  });

  it('is a copy the pane may edit, and editing it leaves the link as it was', async () => {
    const token = await shareFrom('notes.md', '# Notes\n');
    const out = await bring(token);
    const file = path.join(store.productDir(slug), out.src);
    expect(canWrite({ file, product: { slug, dir: store.productDir(slug) } as never })).toEqual({ ok: true });
    fs.writeFileSync(file, '# Notes\n\nMine now.\n');
    expect((await jun.readFileLink(token)).bytes.toString('utf8')).toBe('# Notes\n');
  });

  it('brings a picture and a table in as they were', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const pic = await bring(await shareFrom('shot.png', png));
    expect(fs.readFileSync(path.join(store.productDir(slug), pic.src)).equals(png)).toBe(true);
    expect(store.readItem(slug, pic.id)!.body).toContain(`![shot.png](${pic.src})`);
    const csv = await bring(await shareFrom('leads.csv', 'Name,Fit\n# Ledger,9\n'));
    expect(store.readItem(slug, csv.id)!.title).toBe('leads.csv');
  });

  it('brings a film of several pieces in whole', async () => {
    const film = Buffer.alloc(LINK_PIECE_BYTES + 99, 9);
    const out = await bring(await shareFrom('cut-v2.mp4', film));
    expect(fs.readFileSync(path.join(store.productDir(slug), out.src)).equals(film)).toBe(true);
  });

  it('says so, and makes nothing, when the link was stopped or never was', async () => {
    const token = await shareFrom('gone.md', '# Gone\n');
    await maya.stopFileLink(token);
    const before = store.listItems().length;
    await expect(bring(token)).rejects.toThrow('This link was stopped. Ask whoever sent it for a new one.');
    await expect(bring('f'.repeat(40))).rejects.toThrow('This link does not work. Check it with whoever sent it.');
    expect(store.listItems().length).toBe(before);
  });
});

describe('the link page', () => {
  it('offers Open in Agentbox with the app\'s own link, and not to the file\'s owner', () => {
    const shown = renderToStaticMarkup(h(TopBar, { count: 0, open: false, onComments: () => {}, openIn: `agentbox://f/${TOK}` }));
    expect(shown).toContain(`href="agentbox://f/${TOK}"`);
    expect(shown).toContain('Open in Agentbox');
    expect(renderToStaticMarkup(h(TopBar, { count: 0, open: false, onComments: () => {}, openIn: null }))).not.toContain('Open in');
  });
  it('titles a brought-in page by its own title', () => {
    expect(sharedFileTitle({ name: 'deck.html', kind: 'page', type: 'text/html', body: '<title>Q4  deck</title>' })).toBe('Q4 deck');
  });
});
