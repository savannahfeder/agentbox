// A PICTURE IN A MESSAGE REACHES THE TEAMMATE IT WAS SENT TO.
//
// Reported 2026-10-13 (w-140ac855b1): a teammate's message ended in a grey
// "missing image: attachments/…-pasted-….png" where their screenshot should
// have been. MEASURED on the reader's Mac: no file of that name anywhere in the
// store. A picture pasted into a message is saved in the sender's own project
// folder and the message carries a link to it, `![…](attachments/…)`, but only
// the ledger line ever went to the team cloud. The words crossed; the picture
// never left the Mac it was pasted on. So every picture anyone sent a teammate
// was missing on arrival, and the sender, who saw it fine, had no way to know.
//
// Now the sender's Mac puts the file in the cloud before the line that names it,
// and the reader's Mac takes it down before that line lands, so the message
// never draws as missing even for a moment. A picture sent before this existed
// goes up on the sender's next pass after they update, and comes down on the
// reader's pass after that.
//
// ONLY IN A CONVERSATION. An ordinary shared project's words do not cross
// (shared/team-rules.mts), so neither does anything they link to.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { MAX_MESSAGE_FILE_BYTES, filesNamedIn } from '../main/team/sync.mts';

// One copy of the app. `storeRoot` again is the same Mac started afresh, which
// is what updating the app is; `writes` stands in for its disk.
async function aMac(cloud, personId, { storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'picture-')), writes = disk } = {}) {
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const stateFile = path.join(storeRoot, '.team-sync.json');
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk: writes, accountRoot, stateFile, intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on, accountRoot, storeRoot, stateFile };
}

const conversation = (mac) => mac.store.listProducts().find((p) => p.team?.direct) ?? null;
// What the reply box does on send (main/ipc.mts zero:save-attachments): the
// file goes in the project's attachments folder and the message links to it.
function paste(mac, name, bytes) {
  const dir = conversation(mac).dir;
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attachments', name), bytes);
  return `![${name}](attachments/${name})`;
}
const onDisk = (mac, name) => {
  const file = path.join(conversation(mac).dir, 'attachments', name);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
};
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

let cloud, maya, theo;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team.id);
  await maya.on(() => maya.service.message(theo.personId, 'Morning!'));
  await theo.service.syncNow();
});
afterEach(async () => { for (const m of [maya, theo]) await m.service.signOut(); });

it('brings the picture to the teammate\'s Mac with the message that shows it', async () => {
  const md = paste(maya, 'k2x9ab-q1w2e3-pasted-1042.png', PNG);
  await maya.on(() => maya.service.message(theo.personId, `Here is the inbox screen\n\n${md}`));
  await maya.service.syncNow();
  await theo.service.syncNow();
  expect(onDisk(theo, 'k2x9ab-q1w2e3-pasted-1042.png')).toEqual(PNG);
});

// THE MESSAGE NEVER DRAWS AS MISSING, not even between two passes: a picture
// that is drawn as missing once stays missing until the thread is reopened.
it('has the picture on disk before the line that names it lands', async () => {
  const md = paste(maya, 'a-before.png', PNG);
  await maya.on(() => maya.service.message(theo.personId, md));
  await maya.service.syncNow();
  // Theo's second copy, whose disk is watched as each pulled line lands.
  let presentWhenLanded = null;
  const writes = {
    ...disk,
    appendForeignLines: (dir, lines) => {
      if (lines.some((l) => JSON.stringify(l).includes('a-before.png'))) presentWhenLanded = fs.existsSync(path.join(dir, 'attachments', 'a-before.png'));
      return disk.appendForeignLines(dir, lines);
    },
  };
  const watched = await aMac(cloud, theo.personId, { writes });
  await watched.service.signIn();
  await watched.service.signOut();
  expect(presentWhenLanded).toBe(true);
});

it('brings a picture sent before this existed, once the sender has updated', async () => {
  // Theo's Mac is away while it is sent, or it would take the picture at once.
  await theo.service.signOut();
  const md = paste(maya, 'sent-last-week.png', PNG);
  await maya.on(() => maya.service.message(theo.personId, md));
  await maya.service.syncNow();
  // WHAT THE OLD APP LEFT: the line in the cloud, the file nowhere but the
  // sender's Mac, and no record there of ever having looked for files.
  await maya.service.signOut();
  cloud.files.clear();
  const kept = JSON.parse(fs.readFileSync(maya.stateFile, 'utf8'));
  for (const p of Object.values(kept.projects)) delete p.filesFrom;
  fs.writeFileSync(maya.stateFile, JSON.stringify(kept));
  await theo.service.signIn();
  expect(theo.store.listItems().find((i) => i.product === conversation(theo).slug).answer).toContain('sent-last-week.png');
  expect(onDisk(theo, 'sent-last-week.png')).toBeNull();
  // The sender updates, and their first pass sends what their old messages named...
  const updated = await aMac(cloud, maya.personId, { storeRoot: maya.storeRoot });
  await updated.service.signIn();
  await updated.service.signOut();
  // ...and the reader's next pass takes it down, with no new message to prompt it.
  await theo.service.syncNow();
  expect(onDisk(theo, 'sent-last-week.png')).toEqual(PNG);
});

it('sends each picture once, however often the Macs sync', async () => {
  let sends = 0;
  const count = (n) => { sends += n; };
  cloud.events.on('files', count);
  const md = paste(maya, 'once.png', PNG);
  await maya.on(() => maya.service.message(theo.personId, md));
  for (let i = 0; i < 3; i += 1) { await maya.service.syncNow(); await theo.service.syncNow(); }
  cloud.events.off('files', count);
  expect(sends).toBe(1);
  expect(cloud.files.size).toBe(1);
});

it('brings a picture in the other direction too', async () => {
  const md = paste(theo, 'from-theo.png', PNG);
  await theo.on(() => theo.service.message(maya.personId, md));
  await theo.service.syncNow();
  await maya.service.syncNow();
  expect(onDisk(maya, 'from-theo.png')).toEqual(PNG);
});

// ANY FILE, NOT ONLY A PICTURE (asked 2026-10-13: "make sure that files and
// other things now travel"). A file that is not a picture is linked without
// the !, `[brief.pdf](attachments/…)`, and goes the same way.
it('brings a file that is not a picture, like a PDF or a spreadsheet', async () => {
  const pdf = Buffer.from('%PDF-1.4 brief');
  const csv = Buffer.from('name,email\nA,a@x.test\n');
  paste(maya, 'k2x9ab-q1w2e3-brief.pdf', pdf);
  paste(maya, 'k2x9ab-r4t5y6-leads.csv', csv);
  await maya.on(() => maya.service.message(theo.personId, 'Both files:\n\n[brief.pdf](attachments/k2x9ab-q1w2e3-brief.pdf)\n[leads.csv](attachments/k2x9ab-r4t5y6-leads.csv)'));
  await maya.service.syncNow();
  await theo.service.syncNow();
  expect(onDisk(theo, 'k2x9ab-q1w2e3-brief.pdf')).toEqual(pdf);
  expect(onDisk(theo, 'k2x9ab-r4t5y6-leads.csv')).toEqual(csv);
});

// THE NEW MESSAGE CARD. Its files used to "stay here: a message to a person
// carries words only", because the conversation they would be saved in may not
// exist until the message makes it. They are handed to the send now, saved
// into the conversation it lands in, and linked under the words.
it('carries the files of the very first message to somebody', async () => {
  const priya = await aMac(cloud, signUpMemory(cloud, { email: 'priya@nw.test', name: 'Priya Shah' }));
  await maya.service.invite('priya@nw.test');
  await priya.service.signIn();
  await priya.service.acceptInvite(maya.service.state().team.id);
  await maya.service.syncNow();
  await maya.on(() => maya.service.message(priya.personId, 'The brief', undefined, [
    { name: 'brief.pdf', dataBase64: Buffer.from('%PDF brief').toString('base64') },
    { name: 'pasted-1.png', dataBase64: PNG.toString('base64') },
  ]));
  await priya.service.syncNow();
  const there = priya.store.listProducts().find((p) => p.team?.direct);
  const row = priya.store.listItems().find((i) => i.product === there.slug);
  expect(row.body).toMatch(/^The brief\n\n\[brief\.pdf\]\(attachments\/[\w.-]+-brief\.pdf\)\n!\[pasted-1\.png\]\(attachments\/[\w.-]+-pasted-1\.png\)$/);
  const [pdfName, pngName] = [...row.body.matchAll(/\(attachments\/([^)]+)\)/g)].map((m) => m[1]);
  expect(fs.readFileSync(path.join(there.dir, 'attachments', pdfName)).toString()).toBe('%PDF brief');
  expect(fs.readFileSync(path.join(there.dir, 'attachments', pngName))).toEqual(PNG);
  await priya.service.signOut();
});

// THE BOUNDARY: a file alone is a message; nothing at all is still not one.
it('sends files with no words, and still refuses a message with neither', async () => {
  await maya.on(() => maya.service.message(theo.personId, '', undefined, [{ name: 'only.png', dataBase64: PNG.toString('base64') }]));
  await theo.service.syncNow();
  const row = theo.store.listItems().find((i) => i.product === conversation(theo).slug);
  expect(row.answer).toMatch(/^!\[only\.png\]\(attachments\/[\w.-]+-only\.png\)$/);
  await expect(maya.on(() => maya.service.message(theo.personId, '  ', undefined, []))).rejects.toThrow(/needs some words/);
});

// A CLOUD WITHOUT THE FILES TABLE (one the migration has not reached yet), or a
// file that will not come, never stops a message.
it('still sends and receives the words when the cloud refuses every file call', async () => {
  const broken = (personId) => ({
    ...memoryBackend(cloud, personId),
    hasFiles: async () => { throw new Error('relation "message_files" does not exist'); },
    getFile: async () => { throw new Error('relation "message_files" does not exist'); },
    putFile: async () => { throw new Error('relation "message_files" does not exist'); },
  });
  for (const m of [maya, theo]) await m.service.signOut();
  const a = createTeamService({ session: memorySession(() => broken(maya.personId)), store: maya.store, disk, accountRoot: maya.accountRoot, stateFile: maya.stateFile, intervalMs: 3_600_000 });
  const b = createTeamService({ session: memorySession(() => broken(theo.personId)), store: theo.store, disk, accountRoot: theo.accountRoot, stateFile: theo.stateFile, intervalMs: 3_600_000 });
  await a.signIn();
  await b.signIn();
  const md = paste(maya, 'never.png', PNG);
  await maya.on(() => a.message(theo.personId, `words survive\n\n${md}`));
  await a.syncNow();
  await b.syncNow();
  expect(theo.store.listItems().find((i) => i.product === conversation(theo).slug).answer).toContain('words survive');
  expect(onDisk(theo, 'never.png')).toBeNull();
  await a.signOut();
  await b.signOut();
});

// THE CASES THAT MUST NOT MATCH.

it('never replaces a file the reader already has under that name', async () => {
  const md = paste(maya, 'clash.png', PNG);
  fs.mkdirSync(path.join(conversation(theo).dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(conversation(theo).dir, 'attachments', 'clash.png'), 'theirs');
  await maya.on(() => maya.service.message(theo.personId, md));
  await maya.service.syncNow();
  await theo.service.syncNow();
  expect(onDisk(theo, 'clash.png').toString()).toBe('theirs');
});

// A picture over one call's 10 MB used to stay on the sender's Mac. It now goes
// in parts (tests/team-a-file-over-10-mb-goes-in-parts-and-opens-whole), so no
// single cloud call is over the limit, and the words go either way.
it('sends a picture over 10 MB in parts of no more than 10 MB, and still sends the words', async () => {
  const md = paste(maya, 'huge.png', Buffer.alloc(MAX_MESSAGE_FILE_BYTES + 1));
  await maya.on(() => maya.service.message(theo.personId, `big one\n\n${md}`));
  await maya.service.syncNow();
  await theo.service.syncNow();
  const sizes = [...cloud.pieces.values()].map((f) => f.bytes.length);
  expect(sizes.length).toBeGreaterThan(1);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_MESSAGE_FILE_BYTES);
  const row = theo.store.listItems().find((i) => i.product === conversation(theo).slug);
  expect(row.answer).toContain('big one');
});

it('sends nothing out of an ordinary shared project, whose words stay on the Mac', async () => {
  const { slug } = maya.store.createProduct({ name: 'Website' });
  await maya.service.share(slug, { visibility: 'team' });
  const dir = maya.store.productDir(slug);
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attachments', 'private.png'), PNG);
  await maya.on(() => disk.createWorkItem(dir, { title: 'Look', body: '![p](attachments/private.png)' }, { source: 'founder' }));
  await maya.service.syncNow();
  expect([...cloud.files.values()].map((f) => f.name)).not.toContain('private.png');
});

it('reads only plain names out of a message, never a path that leaves the folder', () => {
  expect(filesNamedIn({ patch: { answer: 'a ![x](attachments/mv6-a.png) and [doc](attachments/notes.pdf)' } }))
    .toEqual(['mv6-a.png', 'notes.pdf']);
  expect(filesNamedIn({ patch: { answer: '![x](attachments/../../.ssh/id_rsa)' } })).toEqual([]);
  expect(filesNamedIn({ patch: { answer: '![x](attachments/sub/dir.png)' } })).toEqual([]);
  expect(filesNamedIn({ patch: { answer: '![x](/Users/someone/attachments/a.png) attachments/b.png' } })).toEqual([]);
  expect(filesNamedIn({ patch: { answer: '![x](attachments/.hidden)' } })).toEqual([]);
  expect(filesNamedIn(null)).toEqual([]);
});
