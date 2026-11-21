// A LONG-NAMED PICTURE KEEPS ITS ENDING WHEN IT IS STAGED (w-f689c07680, 2026-11-21).
//
// A synthetic tester attached
// onboarding-review-with-a-very-long-descriptive-name-for-the-investor-update-final-v2.png
// to a chat and its tile drew a broken picture, and opening it large said the
// picture could not be opened. The copy staged for the box was named with the
// first 80 characters of the name, which cut off ".png", and the window draws
// only files whose ending is a picture's (main/img-scheme.mts `servable`).
// Measured on the tester's copy: the staged file ended "...update-fina", and
// its thumbnail's naturalWidth was 0.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stageAttachment, stageAttachmentPart, stagedName } from '../main/stage-attachment.mts';
import { servable } from '../main/img-scheme.mts';

const LONG = 'onboarding-review-with-a-very-long-descriptive-name-for-the-investor-update-final-v2.png';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2f8AAAAASUVORK5CYII=';
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'staged-'));

describe('a picture staged for a chat box', () => {
  it('keeps its ending when its name is long, so the window will draw it', async () => {
    const where = dir();
    const { path: staged } = await stageAttachment(where, { name: LONG, dataBase64: PNG }, { turn: () => null });
    expect(staged.endsWith('.png')).toBe(true);
    expect(servable(staged, [where], 'linux')).toBe(true);
  });

  it('keeps the start of a long name and stays under the length the folder allows', () => {
    const name = stagedName(LONG);
    expect(name.length).toBe(80);
    expect(name.startsWith('onboarding-review-with-a-very-long')).toBe(true);
    expect(name.endsWith('.png')).toBe(true);
  });

  it('leaves a short name as it was', () => {
    expect(stagedName('mockup-blue.png')).toBe('mockup-blue.png');
    expect(stagedName('Screenshot 2026-11-21 at 09.41.12.png')).toBe('Screenshot-2026-11-21-at-09.41.12.png');
  });

  it('cuts a long name with no ending at 80 characters, as before', () => {
    expect(stagedName('x'.repeat(120))).toBe('x'.repeat(80));
  });

  it('keeps the ending of a long-named file sent in pieces too', () => {
    const where = dir();
    const { path: file } = stageAttachmentPart(where, { id: 'abcdefgh1234', name: LONG, at: 0, dataBase64: PNG });
    expect(file.endsWith('.png')).toBe(true);
  });
});
