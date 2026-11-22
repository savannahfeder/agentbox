// A FILE SENT FROM THE PHONE OPENS UNDER ITS OWN NAME.
//
// A product-loop tester (2026-11-16) attached notes.txt to a Codex reply. The
// message showed notes.txt, but tapping it opened a viewer titled
// bd33b0e0fcf0eb0146f0fa70a5e470733d45922b694f435a0a35c25a66fc8cf9.txt. The
// phone writes a sent file as `[notes.txt](phone-files/<sha256>.txt)` and the
// computer rewrites it as `[notes.txt](attachments/<16 hex>-notes.txt)`; the
// viewer took its title from the last part of the address and never saw the
// link's words. Measured on the phone preview: reply with Files > notes.txt,
// tap notes.txt, read the viewer's top bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { messageBlocks } from '../mobile/src/lib/markdown';
import { fileTitleOf } from '../mobile/src/lib/files';

const SHA = 'bd33b0e0fcf0eb0146f0fa70a5e470733d45922b694f435a0a35c25a66fc8cf9';
const spanOf = (text: string) => {
  const blocks = messageBlocks(text, { local: () => true } as never) as { spans?: { text: string; mention?: { src: string } }[] }[];
  return blocks.flatMap((b) => b.spans ?? []).find((s) => s.mention);
};

describe('a file sent from the phone opens under its own name', () => {
  it('the message names the file by its link words, and the address is the hash', () => {
    const s = spanOf(`here are my notes [notes.txt](phone-files/${SHA}.txt)`);
    expect(s?.text).toBe('notes.txt');
    expect(s?.mention?.src).toBe(`phone-files/${SHA}.txt`);
  });

  it('the viewer is titled with the name the message showed, before and after the computer takes it', () => {
    expect(fileTitleOf(`phone-files/${SHA}.txt`, 'notes.txt')).toBe('notes.txt');
    expect(fileTitleOf(`attachments/${SHA.slice(0, 16)}-notes.txt`, 'notes.txt')).toBe('notes.txt');
  });

  it('with no name, or a name that is itself a path, it falls back to the last part of the address', () => {
    expect(fileTitleOf('designs/w-1/compare.html')).toBe('compare.html');
    expect(fileTitleOf('designs/w-1/compare.html', '')).toBe('compare.html');
    expect(fileTitleOf('designs/w-1/compare.html', '  ')).toBe('compare.html');
    expect(fileTitleOf('designs/w-1/compare.html', 'designs/w-1/compare.html')).toBe('compare.html');
  });

  it('the name travels from the tap to the viewer', () => {
    const md = fs.readFileSync(new URL('../mobile/src/ui/Markdown.tsx', import.meta.url), 'utf8');
    expect(md).toMatch(/open\(src, files, undefined, s\.text\)/);
    const files = fs.readFileSync(new URL('../mobile/src/ui/Files.tsx', import.meta.url), 'utf8');
    expect(files).toMatch(/default: showFile\(product, src, undefined, name\)/);
    const viewer = fs.readFileSync(new URL('../mobile/src/app/file.tsx', import.meta.url), 'utf8');
    expect(viewer).toMatch(/fileTitleOf\(src, name\)/);
  });
});
