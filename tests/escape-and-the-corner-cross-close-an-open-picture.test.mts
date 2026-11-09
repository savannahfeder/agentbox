// ESCAPE AND THE CORNER CROSS CLOSE AN OPEN PICTURE.
//
// Their words (2026-11-08): "I expect to be able to exit it using the top-right
// corner. When I do, it somehow condenses rather than exiting, so I expect an X
// there. Whenever I hit Escape, nothing happens. It should close immediately."
//
// Measured on the built screens, a picture opened big from a thread, 1440x900:
// - the top-right button was the side pane's toggle ("Exit Focus"), so pressing
//   it moved the picture beside the chat instead of closing it;
// - a click on the picture drops a note pin and puts the keyboard in the comment
//   box, and the Escape after it only took that empty pin away. The view stayed
//   open (after one Escape, still open: true). Escape with no click closed it.
// A typed comment and its pin are kept as a draft (keepCommentDraft), so
// closing at once loses nothing; an empty pin is dropped on the way out so it
// is not waiting the next time the picture opens.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
const header = src.slice(src.indexOf('<header className="av-top">'), src.indexOf('</header>', src.indexOf('<header className="av-top">')));
const escape = src.slice(src.indexOf('const escape = (e: KeyboardEvent)'), src.indexOf('const rest = (e: KeyboardEvent)'));
const leave = src.slice(src.indexOf('const leave = () =>'), src.indexOf('};', src.indexOf('const leave = () =>')));

describe('Escape on an open file', () => {
  it('closes the file even when a click has dropped a pin', () => {
    expect(escape).not.toMatch(/draftPlace/);
    expect(escape).toMatch(/else leave\(\);/);
  });

  it('still shuts what is drawn over the file first: a web page, the @ list, a reply box', () => {
    expect(escape).toMatch(/if \(link\) setLink\(null\);/);
    expect(escape).toMatch(/else if \(asking\) setAsking\(null\);/);
    expect(escape).toMatch(/else if \(replyingTo\) setReplyingTo\(null\);/);
  });

  it('drops a pin with no words on the way out, and keeps one with words', () => {
    expect(leave).toMatch(/dropAnEmptyPin\(\)/);
    const drop = src.slice(src.indexOf('const dropAnEmptyPin = () =>'), src.indexOf('};', src.indexOf('const dropAnEmptyPin = () =>')));
    expect(drop).toMatch(/wordsNow\.current\.trim\(\)/);
    expect(drop).toMatch(/keepCommentDraft\([^)]*\{ words: wordsNow\.current, place: null \}/);
  });
});

describe('the top-right corner', () => {
  const buttons = header.match(/<button[\s\S]*?<\/button>/g) ?? [];
  it('is a cross that closes the file', () => {
    const last = buttons.at(-1) ?? '';
    expect(header.lastIndexOf(last)).toBeGreaterThan(header.lastIndexOf('<FocusControl'));
    expect(last).toMatch(/onClick=\{leave\}/);
    expect(last).toMatch(/aria-label="Close"/);
    expect(last).toMatch(/title="Close \(esc\)"/);
    expect(last).toMatch(/kind="close"/);
  });

  it('keeps "beside the chat" as its own button, just left of the cross', () => {
    expect(header).toMatch(/onBeside && family && <FocusControl style="corners-bare" focused onClick=\{\(\) => onBeside\([^\n]*\)\} \/>/);
    expect(header.lastIndexOf('<FocusControl')).toBeLessThan(header.indexOf('aria-label="Close"'));
  });
});
