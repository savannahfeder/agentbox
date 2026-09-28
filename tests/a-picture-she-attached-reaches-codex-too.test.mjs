// A PICTURE SHE ATTACHED REACHES CODEX AS A PICTURE, NOT AS A FILE PATH.
//
// MP-09 of the provider parity project (w-5ebf7bf7bb). The measurement that
// started this whole area, 2026-08-21: of 320 sessions handed a task carrying a
// picture, 155 never opened one, so half of her instruction was delivered. The
// answer then was the block in the brief that names each picture by absolute
// path and says to open it FIRST. That block is written for Claude Code: it
// names the Read tool, which is Claude Code's, and it is the only thing a
// picture gets.
//
// On a Codex row that block is worse than nothing. Codex has no tool called
// Read, so the instruction names something that does not exist, and the picture
// arrives as a path in prose rather than as an image the model can see. Codex's
// own protocol has carried images the whole time: `UserInput` is an internally
// tagged enum and one of its variants is
// `{"type":"localImage","path":"/abs/path.png"}` (required: type, path), read
// out of the schema Codex itself generates rather than guessed.
//
// So a Codex turn now carries the pictures beside the words, and the brief says
// the true thing on each engine: Claude Code is told to open them with Read,
// Codex is told they are attached to the message it is reading.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

/** A product whose docs dir really holds the picture the row names. */
function build({ engine = 'claude' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zero-pics-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'attachments'), { recursive: true });
  writeFileSync(join(dir, 'attachments', 'pasted-1.png'), 'not really a png');
  writeFileSync(join(dir, 'notes.md'), '# not a picture\n');
  const product = { slug: 'astral', name: 'Astral', dir, repoPath: null };
  const item = {
    id: 'w-picture', product: 'astral', status: 'open', title: 'The header is wrong',
    body: 'Look at this.\n\n![pasted](attachments/pasted-1.png)\n\nAnd notes.md as well.',
    labels: ['founder'],
  };
  const sup = new Supervisor(
    {
      home: join(dir, 'home'), storeRoot: dir, claudeBin: '/nonexistent/claude',
      codexBin: engine === 'codex' ? '/nonexistent/codex' : null,
      maxConcurrentSessions: 3, authProfiles: ['default'], codexHome: join(dir, 'codex-home'),
    },
    {
      listItems: () => [item], listProducts: () => [product], readItem: () => item,
      isDue: () => true, settleAnswer() {}, recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  return { sup, product, item, dir };
}

describe('a picture she attached', () => {
  it('is found by absolute path, and only inside the product', () => {
    const { sup, product, item, dir } = build();
    expect(sup.attachedPictures(item, product)).toEqual([join(dir, 'attachments', 'pasted-1.png')]);
    // The other file she named is not a picture and does not ride the image path.
    expect(sup.attachedPictures({ ...item, body: 'just notes.md' }, product)).toEqual([]);
    // And nothing outside the product, however the path is spelled.
    expect(sup.attachedPictures({ ...item, body: '![x](../../../etc/passwd.png)' }, product)).toEqual([]);
  });

  it('rides a Codex turn as an image beside the words', () => {
    const { sup, product, item, dir } = build({ engine: 'codex' });
    const params = sup.codexTurnParamsFor({ prompt: 'the brief', pictures: sup.attachedPictures(item, product) });
    expect(params.input[0]).toEqual({ type: 'text', text: 'the brief' });
    // The shape is Codex's own: LocalImageUserInput, required type and path.
    expect(params.input[1]).toEqual({ type: 'localImage', path: join(dir, 'attachments', 'pasted-1.png') });
  });

  it('leaves a turn with no picture exactly as it was', () => {
    const { sup } = build({ engine: 'codex' });
    expect(sup.codexTurnParamsFor({ prompt: 'nothing attached' }).input).toEqual([{ type: 'text', text: 'nothing attached' }]);
    expect(sup.codexTurnParamsFor({ prompt: 'nothing attached', pictures: [] }).input).toHaveLength(1);
  });

  it('is named in the brief the way the engine that reads it can act on', () => {
    const { sup, product, item } = build();
    const claude = sup.attachmentBlock(item, product, [], 'claude');
    expect(claude).toContain('Open each one with the Read tool');

    const codex = sup.attachmentBlock(item, product, [], 'codex');
    // Codex has no tool by that name, and it does not need one: the picture is
    // attached to the message it is already reading.
    expect(codex).not.toContain('Read tool');
    expect(codex).toContain('attached to this message');
    // Both still name the file, because a path is how anything gets opened again.
    expect(codex).toContain('attachments/pasted-1.png');
  });
});
