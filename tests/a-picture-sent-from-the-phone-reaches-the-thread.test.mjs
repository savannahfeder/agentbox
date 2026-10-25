// A PICTURE SENT FROM THE PHONE REACHES THE THREAD.
//
// What she reported: on the hosted phone, sending a reply with a picture got
// stuck. Read from the code: the reply box saves a picture through
// saveAttachments, which the hosted phone answered with "Your computer does
// this", thrown inside a send that caught nothing, so the button did nothing
// and said nothing. A phone command carried words only.
//
// Now the phone puts the picture in her own storage, in the folder of the
// computer the thread is on, named by what is in it, and the reply links to it
// there (`phone-files/<name>`). The computer takes it down before it does the
// reply, checks it is the file the name says, saves it as an attachment the
// way the reply box does, and the reply links to that. Measured with the
// in-memory cloud, which keeps the database's rules.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox, phoneFilesIn } from '../main/phone-inbox.mjs';

const NOW = Date.parse('2026-10-18T09:00:00Z');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const item = (id) => ({ id, title: `Thread ${id}`, status: 'open', updatedAt: NOW - 1000, createdAt: NOW - 5000 });

function setup() {
  const cloud = createMemoryCloud();
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-picture-'));
  const applied = [];
  const inbox = createPhoneInbox({
    backend: mac,
    projects: () => [{ slug: 'alpha', name: 'Alpha', dir }],
    listItems: () => [item('w-1')],
    historyOf: (slug, id) => [{ id, ts: NOW, source: 'founder', patch: { body: 'brief' } }],
    apply: async (cmd) => { applied.push(cmd); },
    stateFile: path.join(dir, 'phone-inbox.json'),
    home: '/Users/someone',
    now: () => NOW,
  });
  // What the phone does: the picture into the computer's folder, then the reply.
  const upload = async (data, ext = 'jpg') => {
    const name = `${sha(data)}.${ext}`;
    await phone.putPhoneFile({ device: inbox.device, name, data: Buffer.from(data) });
    return name;
  };
  const send = (c) => phone.addPhoneCommand({ device: inbox.device, project: 'alpha', ...c });
  const outcomes = async () => (await phone.phoneCommands()).map((c) => c.outcome);
  return { cloud, phone, inbox, upload, send, applied, dir, outcomes };
}

describe('a picture in a reply from the phone', () => {
  it('is saved in the project\'s attachments and the reply links to it there', async () => {
    const t = setup();
    const name = await t.upload('the bytes of a photo');
    await t.send({ item: 'w-1', kind: 'reply', payload: { text: `This is broken\n\n![IMG 0042.jpg](phone-files/${name})` } });
    await t.inbox.syncOnce();
    expect(await t.outcomes()).toEqual(['done']);
    expect(t.applied).toHaveLength(1);
    const text = t.applied[0].payload.text;
    expect(text).toMatch(/^This is broken\n\n!\[IMG-0042\.jpg\]\(attachments\/[\w-]+-IMG-0042\.jpg\)$/);
    const rel = text.match(/\((attachments\/[^)]+)\)/)[1];
    expect(fs.readFileSync(path.join(t.dir, rel), 'utf8')).toBe('the bytes of a photo');
  });

  it('carries several, and a file that is not a picture as a plain link', async () => {
    const t = setup();
    const a = await t.upload('one');
    const b = await t.upload('two', 'png');
    const c = await t.upload('a film', 'mov');
    await t.send({ item: 'w-1', kind: 'reply', payload: { text: `![a.jpg](phone-files/${a})\n![b.png](phone-files/${b})\n[clip.mov](phone-files/${c})` } });
    await t.inbox.syncOnce();
    const text = t.applied[0].payload.text;
    expect(text.match(/attachments\//g)).toHaveLength(3);
    expect(text).toMatch(/^!\[a\.jpg\]/);
    expect(text).toMatch(/\n\[clip\.mov\]\(attachments\/[\w-]+-clip\.mov\)$/);
  });

  it('goes with a new thread started on the phone too', async () => {
    const t = setup();
    const name = await t.upload('screenshot', 'png');
    await t.send({ item: null, kind: 'new', payload: { title: '', body: `Look at this\n\n![s.png](phone-files/${name})` } });
    await t.inbox.syncOnce();
    expect(t.applied[0].payload.body).toMatch(/^Look at this\n\n!\[s\.png\]\(attachments\/[\w-]+-s\.png\)$/);
  });

  it('is not done, and says why, when the picture never reached the cloud', async () => {
    const t = setup();
    await t.send({ item: 'w-1', kind: 'reply', payload: { text: `see ![x.jpg](phone-files/${sha('never sent')}.jpg)` } });
    await t.inbox.syncOnce();
    expect(t.applied).toEqual([]);
    expect(await t.outcomes()).toEqual(['refused: a file from your phone did not reach this computer']);
  });

  it('is not taken when what is there is not the file its name says', async () => {
    const t = setup();
    const name = `${sha('what the phone meant')}.jpg`;
    await t.phone.putPhoneFile({ device: t.inbox.device, name, data: Buffer.from('something else') });
    await t.send({ item: 'w-1', kind: 'reply', payload: { text: `![x.jpg](phone-files/${name})` } });
    await t.inbox.syncOnce();
    expect(t.applied).toEqual([]);
    expect((await t.outcomes())[0]).toMatch(/^refused: /);
  });

  it('a reply with no picture link goes as it was written', async () => {
    const t = setup();
    await t.send({ item: 'w-1', kind: 'reply', payload: { text: 'see attachments/old.png and [a site](https://example.com/phone-files/x.png)' } });
    await t.inbox.syncOnce();
    expect(t.applied[0].payload.text).toBe('see attachments/old.png and [a site](https://example.com/phone-files/x.png)');
  });
});

describe('which links are pictures from the phone', () => {
  const n = `${'a'.repeat(64)}.jpg`;
  it('only a link to phone-files/ and a name that is a whole sha256 with its kind', () => {
    expect(phoneFilesIn(`![a.jpg](phone-files/${n}) [b](phone-files/${n})`).map((f) => f.name)).toEqual([n, n]);
    expect(phoneFilesIn(`![a](phone-files/${'a'.repeat(63)}.jpg)`)).toEqual([]);
    expect(phoneFilesIn(`![a](phone-files/../${n})`)).toEqual([]);
    expect(phoneFilesIn(`![a](other/${n})`)).toEqual([]);
    expect(phoneFilesIn(`![a](phone-files/${'a'.repeat(64)}.JPG)`)).toEqual([]);
    expect(phoneFilesIn('')).toEqual([]);
  });
});

describe('the phone sending it', () => {
  const D = 'a1b2c3d4e5f6';
  const b64 = (s) => Buffer.from(s).toString('base64');
  const putter = () => { const got = []; return { got, put: async (object, bytes, type) => { got.push({ object, bytes: Buffer.from(bytes).toString(), type }); } }; };

  it('puts each file in the computer\'s folder by what is in it, and links it the way that computer reads', async () => {
    const { sendFiles } = await import('../renderer/src/phone-sends-files.ts');
    const p = putter();
    const saved = await sendFiles({ put: p.put, owner: 'u-1', device: D, files: [{ name: 'IMG 0042.JPG', dataBase64: b64('photo') }, { name: 'clip.mov', dataBase64: b64('film') }], maxBytes: 1000 });
    expect(p.got).toEqual([
      { object: `u-1/${D}/${sha('photo')}.jpg`, bytes: 'photo', type: 'image/jpeg' },
      { object: `u-1/${D}/${sha('film')}.mov`, bytes: 'film', type: 'video/quicktime' },
    ]);
    expect(saved).toEqual([
      { rel: `phone-files/${sha('photo')}.jpg`, name: 'IMG-0042.JPG', image: true },
      { rel: `phone-files/${sha('film')}.mov`, name: 'clip.mov', image: false },
    ]);
    const words = saved.map((s) => (s.image ? `![${s.name}](${s.rel})` : `[${s.name}](${s.rel})`)).join('\n');
    expect(phoneFilesIn(words).map((f) => [f.picture, f.name])).toEqual([[true, `${sha('photo')}.jpg`], [false, `${sha('film')}.mov`]]);
  });

  it('refuses a file over the bound before sending anything of it, and says plainly when there is nowhere to put it', async () => {
    const { sendFiles } = await import('../renderer/src/phone-sends-files.ts');
    const p = putter();
    await expect(sendFiles({ put: p.put, owner: 'u', device: D, files: [{ name: 'big.png', dataBase64: b64('x'.repeat(11)) }], maxBytes: 10 })).rejects.toThrow(/too big/);
    expect(p.got).toEqual([]);
    const missing = async () => { throw new Error('Bucket not found'); };
    await expect(sendFiles({ put: missing, owner: 'u', device: D, files: [{ name: 'a.png', dataBase64: b64('x') }], maxBytes: 10 })).rejects.toThrow(/storage for them is not set up/);
    await expect(sendFiles({ put: p.put, owner: 'u', device: D, files: [{ name: 'a.png' }], maxBytes: 10 })).rejects.toThrow(/could not be read/);
  });

  it('draws a sent file from its link while the computer has not yet taken it', async () => {
    const { sentFileName, sentNamesIn } = await import('../renderer/src/phone-sends-files.ts');
    const n = `${'b'.repeat(64)}.png`;
    expect(sentFileName(`/home/phone-${D}/Zero/accounts/a/proj/phone-files/${n}`)).toBe(n);
    expect(sentFileName(`/home/phone-${D}/proj/phone-files/${n}/x`)).toBe(null);
    expect(sentFileName(`/home/phone-${D}/proj/my-phone-files/${n}`)).toBe(null);
    // As a link in the words gives it, before it is put under the project.
    expect(sentFileName(`phone-files/${n}`)).toBe(n);
    expect(sentNamesIn(`hi ![a](phone-files/${n}) [b](phone-files/${n}) ![c](attachments/${n})`)).toEqual([n, n]);
  });
});

describe('a file sent from the phone, in her own message', () => {
  it('draws as a file while her computer has not taken it, and words that only look like one stay words', async () => {
    const { typedParts } = await import('../renderer/src/typed-message.ts');
    const n = `${'c'.repeat(64)}.pdf`;
    expect(typedParts(`see this\n\n[invoice.pdf](phone-files/${n})`)).toEqual([{ text: 'see this' }, { embed: `[invoice.pdf](phone-files/${n})` }]);
    expect(typedParts('[a](phone-files/notes.pdf)')).toEqual([{ text: '[a](phone-files/notes.pdf)' }]);
  });
});
