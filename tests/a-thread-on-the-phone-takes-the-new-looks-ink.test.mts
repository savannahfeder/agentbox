// A THREAD ON THE PHONE TAKES THE NEW LOOK'S INK (2026-11-22). On the iPhone
// simulator, after Appearance went Dark and back to Light, a thread's
// paragraphs stayed Dark's #ececec on the Light page #f8f8fa (measured on a
// screenshot), while its title and links changed. The paragraphs are drawn by
// `Selectable` as a read-only TextInput on iOS, styled from module-level
// objects whose colour was a getter; iOS reuses a TextInput's view, and one
// holding the same words kept the old colour. Colours are now read while
// drawing, and the TextInput is a new one for each ink.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
const selectable = fs.readFileSync('mobile/src/ui/Selectable.tsx', 'utf8');
const markdown = fs.readFileSync('mobile/src/ui/Markdown.tsx', 'utf8');

describe('words drawn in the look\'s colours', () => {
  it('never keep a colour in a getter on an object made once', () => {
    expect(files('mobile/src').filter((f) => /get color\(\)/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });
  it('give a selectable paragraph the ink of the look it is drawn in', () => {
    expect(selectable).toMatch(/const ink = color\.text;\n  const look = StyleSheet\.flatten\(\[\{ \.\.\.BASE, color: ink \}, style\]\)/);
  });
  it('draw a selectable paragraph in a new TextInput when its ink changes, so iOS cannot keep the old one', () => {
    expect(selectable).toMatch(/<TextInput key=\{ink\}/);
  });
  it('give a thread\'s and a document\'s body the look\'s ink when the message is drawn', () => {
    expect(markdown).toMatch(/body: \{ \.\.\.\(doc \? DOC_BODY : BODY\), color: color\.text \}/);
  });
});
