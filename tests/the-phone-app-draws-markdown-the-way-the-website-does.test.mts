// THE PHONE APP DRAWS MARKDOWN THE WAY THE WEBSITE DOES.
//
// The app's first reader knew six shapes, so Codex's audit of the app against
// the phone website (finding 16) counted tables, task lists, nested lists,
// quotes, emphasis, strikethrough and autolinks drawn as raw markdown, and a
// picture a worker named was its `![alt](path)` text. The website reads a
// message with remark-gfm plus its own path rule (artifact-paths.ts) and
// draws every link as a mention (Focus.tsx, mentions.ts). The app now parses
// with the same micromark GFM parser and the same path and mention rules
// (mobile/src/lib/markdown.ts); these pin what each shape becomes, measured
// against the website's own output for the same message.
import { describe, it, expect } from 'vitest';
import { inlineSpans, messageBlocks } from '../mobile/src/lib/markdown';

const DIR = '/home/phone-0a1b2c3d4e5f/docs/agentbox';

describe('the blocks of a message', () => {
  it('reads paragraphs, headings and code, and a soft line break as a space', () => {
    expect(messageBlocks('One line\nthe same paragraph.\n\n## A heading\n\n```sh\nnpm run ship\n```')).toEqual([
      { kind: 'p', spans: [{ text: 'One line the same paragraph.' }] },
      { kind: 'h', depth: 2, spans: [{ text: 'A heading' }] },
      { kind: 'code', text: 'npm run ship', lang: 'sh' },
    ]);
  });

  it('keeps a hard line break', () => {
    expect(messageBlocks('first  \nsecond')).toEqual([{ kind: 'p', spans: [{ text: 'first\nsecond' }] }]);
  });

  it('nests lists, numbers them from where they start, and marks a tight list', () => {
    expect(messageBlocks('- first\n- second\n  - nested one\n  - nested two\n\n3. three\n4. four')).toEqual([
      { kind: 'list', ordered: false, start: 1, tight: true, items: [
        { checked: null, blocks: [{ kind: 'p', spans: [{ text: 'first' }] }] },
        { checked: null, blocks: [
          { kind: 'p', spans: [{ text: 'second' }] },
          { kind: 'list', ordered: false, start: 1, tight: true, items: [
            { checked: null, blocks: [{ kind: 'p', spans: [{ text: 'nested one' }] }] },
            { checked: null, blocks: [{ kind: 'p', spans: [{ text: 'nested two' }] }] },
          ] },
        ] },
      ] },
      { kind: 'list', ordered: true, start: 3, tight: true, items: [
        { checked: null, blocks: [{ kind: 'p', spans: [{ text: 'three' }] }] },
        { checked: null, blocks: [{ kind: 'p', spans: [{ text: 'four' }] }] },
      ] },
    ]);
  });

  it('reads a task list as ticked and unticked items', () => {
    const [list] = messageBlocks('- [x] done task\n- [ ] open task');
    expect(list.items.map((i) => i.checked)).toEqual([true, false]);
    expect(list.items[0].blocks).toEqual([{ kind: 'p', spans: [{ text: 'done task' }] }]);
  });

  it('reads a quote as the blocks inside it', () => {
    expect(messageBlocks('> A quote that says **something**.')).toEqual([
      { kind: 'quote', blocks: [{ kind: 'p', spans: [{ text: 'A quote that says ' }, { text: 'something', bold: true }, { text: '.' }] }] },
    ]);
  });

  it('reads a table as its head, its rows and how each column aligns', () => {
    expect(messageBlocks('| Name | Count |\n| --- | ---: |\n| apples | 3 |\n| **pears** | 12 |')).toEqual([
      { kind: 'table', align: [null, 'right'],
        head: [[{ text: 'Name' }], [{ text: 'Count' }]],
        rows: [[[{ text: 'apples' }], [{ text: '3' }]], [[{ text: 'pears', bold: true }], [{ text: '12' }]]] },
    ]);
  });

  it('reads a rule', () => {
    expect(messageBlocks('above\n\n---\n\nbelow').map((b) => b.kind)).toEqual(['p', 'hr', 'p']);
  });

  it('shows raw HTML as the words it is, as the website does', () => {
    expect(messageBlocks('a <b>tag</b>')).toEqual([{ kind: 'p', spans: [{ text: 'a <b>tag</b>' }] }]);
  });

  it('an empty message is no blocks', () => {
    expect(messageBlocks('  \n\n')).toEqual([]);
  });
});

describe('the words inside a block', () => {
  it('reads bold, emphasis, strikethrough and code', () => {
    expect(messageBlocks('**bold**, *emphasis*, ~~struck~~ and `npm run ship`')[0].spans).toEqual([
      { text: 'bold', bold: true },
      { text: ', ' },
      { text: 'emphasis', italic: true },
      { text: ', ' },
      { text: 'struck', strike: true },
      { text: ' and ' },
      { text: 'npm run ship', code: true },
    ]);
  });

  it('draws a link as a mention with its own words, and an address it wrote out as its short name', () => {
    expect(messageBlocks('read [the plan](https://example.com/a/page) or https://example.com/raw')[0].spans).toEqual([
      { text: 'read ' },
      { text: 'the plan', mention: { kind: 'link', src: 'https://example.com/a/page' } },
      { text: ' or ' },
      { text: 'example.com/raw', mention: { kind: 'link', src: 'https://example.com/raw' } },
    ]);
  });

  it('leaves a lone asterisk and an underscore in a name alone', () => {
    expect(messageBlocks('5 * 3 in my_file_name and 4 * 2')[0].spans).toEqual([{ text: '5 * 3 in my_file_name and 4 * 2' }]);
  });
});

describe('files and pictures a message names', () => {
  it('draws a markdown picture as a picture of its own, between the words around it', () => {
    expect(messageBlocks('Here it is:\n![The inbox](designs/w-1a2b3c4d5e/inbox.png)\nand more.')).toEqual([
      { kind: 'p', spans: [{ text: 'Here it is:' }] },
      { kind: 'picture', src: 'designs/w-1a2b3c4d5e/inbox.png', alt: 'The inbox' },
      { kind: 'p', spans: [{ text: 'and more.' }] },
    ]);
  });

  it('draws a picture named in a sentence, in backticks, or as a link', () => {
    expect(messageBlocks('See designs/a.png', { dir: DIR })).toEqual([
      { kind: 'p', spans: [{ text: 'See' }] },
      { kind: 'picture', src: 'designs/a.png', alt: 'designs/a.png' },
    ]);
    expect(messageBlocks('`designs/b.jpg`', { dir: DIR })).toEqual([{ kind: 'picture', src: 'designs/b.jpg', alt: 'designs/b.jpg' }]);
    expect(messageBlocks('[the shot](designs/c.webp)', { dir: DIR })).toEqual([{ kind: 'picture', src: 'designs/c.webp', alt: 'the shot' }]);
  });

  it('a picture written from the home folder, inside the project, goes by its short path', () => {
    expect(messageBlocks('~/docs/agentbox/designs/d.png', { dir: DIR })).toEqual([{ kind: 'picture', src: 'designs/d.png', alt: '~/docs/agentbox/designs/d.png' }]);
  });

  it('a full path outside the project stays words', () => {
    expect(messageBlocks('wrote /tmp/scratch/e.png', { dir: DIR })).toEqual([{ kind: 'p', spans: [{ text: 'wrote /tmp/scratch/e.png' }] }]);
  });

  it('a picture from the web is drawn as it is', () => {
    expect(messageBlocks('![logo](https://example.com/logo.png)')).toEqual([{ kind: 'picture', src: 'https://example.com/logo.png', alt: 'logo' }]);
  });

  it('draws a page, a document, a film and a source file as mentions by name', () => {
    expect(messageBlocks('See designs/w-1a2b3c4d5e/page.html and docs/mobile/PLAN.md, `films/cut.mp4` and `main/main.mjs`', { dir: DIR })[0].spans).toEqual([
      { text: 'See ' },
      { text: 'page.html', mention: { kind: 'page', src: 'designs/w-1a2b3c4d5e/page.html' } },
      { text: ' and ' },
      { text: 'PLAN.md', mention: { kind: 'doc', src: 'docs/mobile/PLAN.md' } },
      { text: ', ' },
      { text: 'cut.mp4', mention: { kind: 'media', src: 'films/cut.mp4' } },
      { text: ' and ' },
      { text: 'main.mjs', mention: { kind: 'code', src: 'main/main.mjs' } },
    ]);
  });

  it('a folder on a line of its own is drawn as the folder, with its pictures (FolderPreview)', () => {
    expect(messageBlocks('The shots:\n\n~/docs/agentbox/designs/w-1a2b3c4d5e/', { dir: DIR })[1]).toEqual({ kind: 'folder', src: 'designs/w-1a2b3c4d5e/' });
  });

  it('a sentence with a full stop and no file in it is not a mention', () => {
    expect(messageBlocks('Shipped it. Version 1.2 is out, e.g. today.', { dir: DIR })).toEqual([
      { kind: 'p', spans: [{ text: 'Shipped it. Version 1.2 is out, e.g. today.' }] },
    ]);
  });

  it('code that is not a path stays code', () => {
    expect(messageBlocks('run `npm run ship`', { dir: DIR })[0].spans).toEqual([{ text: 'run ' }, { text: 'npm run ship', code: true }]);
  });
});

describe('an option\'s words', () => {
  it('read their inline markdown on one line, with a picture as a mention', () => {
    expect(inlineSpans('Ship **now** with `npm run ship` and designs/a.png')).toEqual([
      { text: 'Ship ' },
      { text: 'now', bold: true },
      { text: ' with ' },
      { text: 'npm run ship', code: true },
      { text: ' and ' },
      { text: 'a.png', mention: { kind: 'image', src: 'designs/a.png' } },
    ]);
  });

  it('a plain option is its words', () => {
    expect(inlineSpans('Start building the first version (recommended)')).toEqual([{ text: 'Start building the first version (recommended)' }]);
  });
});
