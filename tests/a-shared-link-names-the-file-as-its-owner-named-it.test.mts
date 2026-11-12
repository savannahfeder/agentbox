// A file sent with a message is kept as attachments/<time>-<random>-<name>, and
// its shared link carried that kept name: the link page was headed
// "mwbkf2rj-hnyuw8-launch-teaser.mp4", and so was the row a comment on it put
// in the owner's inbox (2026-11-11). A link now carries the name as it was given.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkCopyOf } from '../main/file-link.mts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-name-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const at = (rel: string, body = '# Plan\n') => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return f; };

describe('the name a link carries', () => {
  it('is the name it was sent with, for a file kept with a message', () => {
    expect(linkCopyOf(at('launch/attachments/mwbkf2rj-hnyuw8-launch-plan.md')).name).toBe('launch-plan.md');
  });
  it('is the file\'s own name anywhere else, a hyphenated one included', () => {
    expect(linkCopyOf(at('launch/docs/q1-road-map-v2.md')).name).toBe('q1-road-map-v2.md');
  });
});
