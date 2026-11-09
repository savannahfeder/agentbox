// A picture opened from a thread steps through the pictures of its own part of
// the conversation, not every picture the thread ever drew.
//
// What broke: on a long design thread a click on one picture opened it over a
// row of 28 thumbnails, most of them from rounds long past, and the open one was
// lost among them. The ask: only the pictures from the same conversation,
// including the one clicked. Measured in a built window on a four-round thread
// (scripts/scratch harness, 16 pictures): a click on a round-4 picture gave a
// strip of all 16, from the first screenshot to the last. picturesOnScreen read
// every picture in the pane.
//
// And a picture in a folder grid was listed under its bare file name while its
// click passed the full path, so it never found itself and opened alone.
//
// A part is a turn. "A turn is when, let's say, I send a message. That's one
// turn. The agent returns with a bunch of messages. Those messages are
// considered one turn." So the agent's 3 pictures in one reply and its 5 in the
// next are two sets, not one of 8, and a picture you sent is in a set of its own.
// Picking an option is your turn as much as typing is.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadParts } from '../renderer/src/her-turns.ts';
import { picturesBeside } from '../renderer/src/picture-view.ts';
import { Thread, answerTurn } from '../renderer/src/components/Thread.tsx';
import { ArtifactImg } from '../renderer/src/components/Focus.tsx';

const you = { who: 'you' };
const agent = { who: 'it' };
const work = { kind: 'work' };
const run = { kind: 'run' };
const picked = { kind: 'work', yours: true };

describe('which turn each message is in', () => {
  it('your message is one turn and the reply under it is the next', () => {
    expect(threadParts([you, agent, you, agent])).toEqual([0, 1, 2, 3]);
  });

  it('keeps every message of a long reply, and the work between them, in one turn', () => {
    expect(threadParts([you, work, agent, run, agent, agent, you, agent])).toEqual([0, 1, 1, 1, 1, 1, 2, 3]);
  });

  it('keeps two of your messages in a row in one turn', () => {
    expect(threadParts([you, you, agent, you, agent])).toEqual([0, 0, 1, 2, 3]);
  });

  it('splits two replies when you answered between them by picking an option', () => {
    expect(threadParts([agent, agent, picked, agent])).toEqual([0, 0, 1, 2]);
  });

  it('keeps a reply in one turn when nothing of yours came between its messages', () => {
    expect(threadParts([you, agent, work, agent, agent])).toEqual([0, 1, 1, 1, 1]);
  });

  it('starts a new turn across the cut middle, whatever opens the far side', () => {
    expect(threadParts([you, agent, agent, agent], 1)).toEqual([0, 1, 2, 2]);
    expect(threadParts([you, agent, you, agent], 1)).toEqual([0, 1, 2, 3]);
  });
});

describe('the thread says which part each block is in', () => {
  const md = (text) => text;
  const html = renderToStaticMarkup(createElement(Thread, {
    events: [
      { at: 1, who: 'you', text: 'first ask' },
      { at: 2, who: 'it', text: 'first reply' },
      { at: 3, who: 'you', text: 'second ask' },
      { at: 4, who: 'it', text: 'second reply' },
    ],
    name: 'Claude', md, onWhole: () => {}, landOn: 'x',
  }));
  const partOf = (text) => {
    const at = html.indexOf(text);
    const open = html.lastIndexOf('class="thread-block', at);
    return /data-exchange="(\d+)"/.exec(html.slice(open, html.indexOf('>', open)))?.[1];
  };

  it('marks your ask and each reply as turns of their own', () => {
    expect(partOf('first ask')).toBe('0');
    expect(partOf('first reply')).toBe('1');
    expect(partOf('second ask')).toBe('2');
    expect(partOf('second reply')).toBe('3');
  });

  // The agent's newest answer is drawn under the thread, outside its blocks
  // (ItemThread). Measured in a built window: a reply of 2 pictures in one
  // message and 3 in the answer opened as a set of 3, because the answer had no
  // turn of its own.
  it('gives the answer under the thread the turn of the agent messages above it', () => {
    expect(answerTurn([{ at: 1, who: 'you', text: 'ask' }, { at: 2, who: 'it', text: 'first two' }], 0, false)).toBe(1);
    expect(answerTurn([{ at: 1, who: 'you', text: 'ask' }, { at: 2, who: 'it', text: 'two' }, { at: 3, kind: 'work', verb: 'ran', subject: 'x' }], 0, false)).toBe(1);
  });

  it('starts a turn for the answer when your message is right above it', () => {
    expect(answerTurn([{ at: 1, who: 'it', text: 'three' }, { at: 2, who: 'you', text: 'ask' }], 0, false)).toBe(2);
  });

  it('puts that turn on the answer itself', () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
    const answer = view.slice(view.indexOf('const answer = outcome'), view.indexOf('return (', view.indexOf('const answer = outcome')));
    expect(answer.match(/data-exchange=\{answerAt\}/g)).toHaveLength(2);
    expect(view).toMatch(/const answerAt = answerTurn\(events, omitted, chat\)/);
  });

  it('gives each message in a chat a part of its own, since a chat has no turns', () => {
    const chat = renderToStaticMarkup(createElement(Thread, {
      events: [{ at: 1, who: 'you', text: 'one' }, { at: 2, who: 'you', by: 'p-2', text: 'two' }],
      name: 'Claude', md, onWhole: () => {}, landOn: 'x', chat: true,
    }));
    const parts = [...chat.matchAll(/class="thread-block[^"]*"[^>]*data-exchange="(\d+)"/g)].map((m) => m[1]);
    expect(parts).toHaveLength(2);
    expect(new Set(parts).size).toBe(2);
  });
});

describe('the pictures a click steps through', () => {
  const shot = (path, section, url = `img://${path}`) => ({ path, url, section });
  // Your ask with a screenshot, a reply with 3, your answer, a reply with 5.
  const thread = [
    shot('attachments/pasted-1.png', '0'),
    ...['a', 'b', 'c'].map((l) => shot(`designs/r1/${l}.png`, '1')),
    ...['a', 'b', 'c', 'd', 'e'].map((l) => shot(`designs/r2/${l}.png`, '3')),
  ];

  it('are the 5 of the newest reply, not the 8 of both, with the clicked one open', () => {
    const { pictures, start } = picturesBeside(thread, 6);
    expect(pictures.map((p) => p.path)).toEqual(['a', 'b', 'c', 'd', 'e'].map((l) => `designs/r2/${l}.png`));
    expect(start).toBe(2);
  });

  it('are the 3 of the earlier reply when one of those is clicked', () => {
    const { pictures, start } = picturesBeside(thread, 2);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r1/a.png', 'designs/r1/b.png', 'designs/r1/c.png']);
    expect(start).toBe(1);
  });

  it('keep a picture you sent out of the reply under it', () => {
    expect(picturesBeside(thread, 0).pictures.map((p) => p.path)).toEqual(['attachments/pasted-1.png']);
    expect(picturesBeside(thread, 1).pictures.map((p) => p.path)).not.toContain('attachments/pasted-1.png');
  });

  it('is the one picture alone when its part has no other', () => {
    const { pictures, start } = picturesBeside([shot('a.png', '0'), shot('b.png', '1')], 1);
    expect(pictures.map((p) => p.path)).toEqual(['b.png']);
    expect(start).toBe(0);
  });

  it('shows a file once, however many times its part draws it', () => {
    const twice = [shot('designs/r2/a.png', '1', 'img://demo/designs/r2/a.png'), shot('/demo/designs/r2/a.png', '1', 'img://demo/designs/r2/a.png?look=2'), shot('designs/r2/b.png', '1')];
    const { pictures, start } = picturesBeside(twice, 1);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r2/a.png', 'designs/r2/b.png']);
    expect(start).toBe(0);
  });

  it('keeps the same file in another part out of this one', () => {
    const reused = [shot('designs/shot.png', '0'), shot('designs/other.png', '1'), shot('designs/shot.png', '1')];
    const { pictures, start } = picturesBeside(reused, 2);
    expect(pictures.map((p) => p.path)).toEqual(['designs/other.png', 'designs/shot.png']);
    expect(start).toBe(1);
  });

  it('has nothing to show for a click that matched no picture', () => {
    expect(picturesBeside(thread, -1)).toEqual({ pictures: [], start: 0 });
  });
});

describe('every picture tells the viewer what it opens and where it was clicked', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

  it('a picture in a message names the path its click opens', () => {
    const html = renderToStaticMarkup(createElement(ArtifactImg, { src: 'designs/r1/a.png', roots: ['/demo'], onOpen: () => {} }));
    expect(html).toContain('data-picture="designs/r1/a.png"');
  });

  it('a picture in a folder grid names its whole path, not its bare name', () => {
    const shotButton = focus.slice(focus.indexOf('className="folder-preview-shot"'), focus.indexOf('</button>', focus.indexOf('className="folder-preview-shot"')));
    expect(shotButton).toMatch(/data-picture=\{file\}/);
    expect(shotButton).toMatch(/onOpen\(file, e\.currentTarget\)/);
  });

  it('the click hands over the picture that was pressed, all the way to the viewer', () => {
    expect(focus).toMatch(/onClick=\{\(e\) => onOpen\(path, e\.currentTarget\)\}/);
    expect(focus).toMatch(/if \(goes === 'picture'\) \{ openPicture\(href, from\); return; \}/);
  });
});
