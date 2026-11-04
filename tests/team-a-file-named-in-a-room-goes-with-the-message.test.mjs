// A FILE NAMED IN A ROOM GOES WITH THE MESSAGE.
//
// A group's message that named reports/plan.md drew dead text for everyone else,
// and an attached deck or film drew a grey chip nothing happened on. Measured on
// the Lumen rooms: 0 of the files named in them, other than attached pictures,
// could be opened. Rooms have no ledger, so the name becomes a link as it goes out.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { carryIntoRoom } from '../main/team/carry-files.mjs';
import { filesNamedInWords, MAX_CARRIED_BYTES } from '../shared/carried-files.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-'));
const file = (name, bytes = 'x') => { const f = path.join(dir, name); fs.writeFileSync(f, bytes); return { file: f, size: Buffer.byteLength(bytes) }; };
function aRoom(files) {
  const sent = new Map();
  return { sent, put: async (name, data) => { sent.set(name, data); }, find: (ref) => files[ref] ?? null };
}

describe('a named file', () => {
  it('goes up and becomes a link, however it was written', async () => {
    const room = aRoom({ 'reports/plan.md': file('plan.md', 'plan'), 'a.pdf': file('a.pdf') });
    const out = await carryIntoRoom('Read reports/plan.md and `a.pdf`, thanks', room);
    expect(out).toMatch(/Read \[plan\.md\]\(attachments\/[0-9a-f]{12}-plan\.md\) and \[a\.pdf\]\(attachments\/[0-9a-f]{12}-a\.pdf\), thanks/);
    expect(room.sent.size).toBe(2);
    expect([...room.sent.values()]).toContain(Buffer.from('plan').toString('base64'));
    expect(filesNamedInWords(out).every((r) => r.startsWith('attachments/'))).toBe(true);
  });

  it('keeps a link\'s own words', async () => {
    const room = aRoom({ 'r/p.md': file('p.md') });
    expect(await carryIntoRoom('[the plan](r/p.md)', room)).toMatch(/^\[the plan\]\(attachments\/[0-9a-f]{12}-p\.md\)$/);
  });

  it('draws a picture as a picture', async () => {
    const room = aRoom({ 'd/a.png': file('a.png') });
    expect(await carryIntoRoom('see d/a.png', room)).toMatch(/^see !\[a\.png\]\(attachments\//);
  });

  it('leaves an attachment link alone, and does not send it twice', async () => {
    const room = aRoom({});
    const body = '[a.pdf](attachments/k-a.pdf)';
    expect(await carryIntoRoom(body, room)).toBe(body);
    expect(room.sent.size).toBe(0);
  });
});

describe('what stays', () => {
  it('leaves a name nothing was found for as it was, and sends nothing', async () => {
    const room = aRoom({});
    expect(await carryIntoRoom('see salaries.md', room)).toBe('see salaries.md');
    expect(room.sent.size).toBe(0);
  });

  it('sends nothing when there is no way to find files', async () => {
    expect(await carryIntoRoom('see a.md', { find: null, put: async () => { throw new Error('no'); } })).toBe('see a.md');
  });

  it('says a file is too big, in the words everyone reads', async () => {
    const big = { file: path.join(dir, 'huge.mp4'), size: MAX_CARRIED_BYTES + 1 };
    const room = aRoom({ 'huge.mp4': big });
    const out = await carryIntoRoom('huge.mp4', room);
    expect(out).toMatch(/over the 10 MB/);
    expect(room.sent.size).toBe(0);
  });

  it('still sends the message when the file will not go, and says so', async () => {
    const out = await carryIntoRoom('a.md', { find: () => file('a.md'), put: async () => { throw new Error('offline'); } });
    expect(out).toMatch(/a\.md did not send/);
  });
});
