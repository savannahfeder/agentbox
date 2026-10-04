// A PICTURE A WORKER NAMES BESIDE ITS FOLDER IS DRAWN, AND THE FOLDER SHOWS
// WHAT IS IN IT.
//
// Her words, 2026-10-04: "Lately, most of our previews that are supposed to
// show up in artifacts and that I can easily open in the chat haven't been
// showing up." Her screenshot was a result reading "missing image: today.png"
// with the design folder printed under it as plain grey text.
//
// Counted over the Agentbox Team threads touched 2026-10-04, the six whose
// result named a picture or a design folder:
//
//   names `quiet-1.png` bare, folder on its own line   3 pictures, all "missing image"
//   names only the folder ("the files starting r3-")    nothing drawn, folder is text
//   names /tmp/…/on-dark.png                            refused, outside her folders
//   names a page or a picture by its full path         drawn, three threads
//
// The bare name is right there on disk, in designs/<the thread's id>/, which is
// where the brief tells a worker to put what it draws. The window only ever
// looked in five fixed folders, and that one is never among them. So the
// pictures a message names are now looked for first in the folders the same
// message names, and in the thread's own designs folder.
import { describe, it, expect } from 'vitest';
import { pictureRoots, namedFolders } from '../renderer/src/message-folders.ts';
import { linkArtifactPaths } from '../renderer/src/remark-artifact-paths.ts';

const DIR = '/Users/you/Zero/accounts/acct/agentbox-team';
const REPO = '/Users/you/dev/agentbox';

// The result on her screenshot, cut to the lines that matter.
const HERS = [
  '- **Version 1, `quiet-1.png`:** one grey line for each action.',
  '- **Version 2, `quiet-2.png`:** the quietest.',
  '',
  `${DIR}/designs/w-49b4e45403/`,
].join('\n');

describe('the folders a message names', () => {
  it('finds the design folder written out in full on its own line', () => {
    expect(namedFolders([HERS], DIR)).toEqual(['designs/w-49b4e45403']);
  });

  it('finds it without the trailing slash, and written from the home folder', () => {
    expect(namedFolders([`${DIR}/designs/w-1`], DIR)).toEqual(['designs/w-1']);
    expect(namedFolders(['~/Zero/accounts/acct/agentbox-team/designs/w-2/'], DIR)).toEqual(['designs/w-2']);
  });

  it('finds a short folder path ending in a slash', () => {
    expect(namedFolders(['the shots are in designs/w-3/ now'], DIR)).toEqual(['designs/w-3']);
  });

  it('takes the folder each named file sits in, so a bare name beside it resolves', () => {
    expect(namedFolders([`${DIR}/designs/w-a18/r2/round3.html`], DIR)).toEqual(['designs/w-a18/r2']);
  });

  it('does NOT take a folder outside her project, which the window may not read', () => {
    expect(namedFolders(['/tmp/w-e5f-shots/', '/tmp/w-e5f-shots/on-dark.png'], DIR)).toEqual([]);
  });

  it('does NOT read a file written out in full as a folder', () => {
    expect(namedFolders([`${DIR}/designs/w-9.html`], DIR)).toEqual(['designs']);
  });

  it('names nothing when there is no project folder to be inside', () => {
    expect(namedFolders([HERS], null)).toEqual([]);
  });
});

describe('where a picture is looked for', () => {
  const roots = pictureRoots({ dir: DIR, repo: REPO, id: 'w-49b4e45403', texts: [HERS] });

  it('looks in the folder the message named first, so quiet-1.png is found', () => {
    expect(roots[0]).toBe(`${DIR}/designs/w-49b4e45403`);
  });

  it("looks in the thread's own designs folder even when the message named none", () => {
    const bare = pictureRoots({ dir: DIR, repo: REPO, id: 'w-77', texts: ['`quiet-1.png`'] });
    expect(bare).toContain(`${DIR}/designs/w-77`);
  });

  it('still looks everywhere it always did, in the same order, after those', () => {
    const plain = pictureRoots({ dir: DIR, repo: REPO, id: 'w-77', texts: [] });
    expect(plain.slice(-5)).toEqual([
      DIR, `${DIR}/designs`, `${DIR}/attachments`, REPO, `${REPO}/designs`,
    ]);
  });

  it('lists each folder once', () => {
    const twice = pictureRoots({ dir: DIR, repo: REPO, id: 'w-49b4e45403', texts: [HERS, HERS] });
    expect(new Set(twice).size).toBe(twice.length);
  });

  it('has nothing to add without a project folder, and does not invent one', () => {
    expect(pictureRoots({ dir: null, repo: REPO, id: 'w-1', texts: [HERS] })).toEqual([REPO, `${REPO}/designs`]);
  });
});

describe('a folder on its own line becomes a door', () => {
  const para = (value) => ({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] });
  const nodes = (tree) => tree.children[0].children;

  it('her folder line becomes a link to the folder, marked by its slash', () => {
    const tree = para(`${DIR}/designs/w-49b4e45403/`);
    linkArtifactPaths(tree, { dir: DIR });
    expect(nodes(tree)).toHaveLength(1);
    expect(nodes(tree)[0].type).toBe('link');
    expect(nodes(tree)[0].url).toBe('designs/w-49b4e45403/');
  });

  it('so does the line under "in:", which markdown keeps in the same paragraph', () => {
    const tree = para(`are the files starting with r3- in:\n${DIR}/designs/w-a3482b8c2c/`);
    linkArtifactPaths(tree, { dir: DIR });
    const link = nodes(tree).find((n) => n.type === 'link');
    expect(link?.url).toBe('designs/w-a3482b8c2c/');
    expect(nodes(tree)[0].value).toBe('are the files starting with r3- in:\n');
  });

  it('a folder with no slash on its own line counts too', () => {
    const tree = para(`${DIR}/designs/w-1`);
    linkArtifactPaths(tree, { dir: DIR });
    expect(nodes(tree)[0].url).toBe('designs/w-1/');
  });

  it('does NOT make a link of a folder outside her project', () => {
    const tree = para('/tmp/w-e5f31083ff-shots/');
    linkArtifactPaths(tree, { dir: DIR });
    expect(nodes(tree)).toEqual([{ type: 'text', value: '/tmp/w-e5f31083ff-shots/' }]);
  });

  it('does NOT take a folder mentioned inside a sentence, only one standing alone', () => {
    const tree = para(`I saved them under ${DIR}/designs/w-1/ earlier`);
    linkArtifactPaths(tree, { dir: DIR });
    expect(nodes(tree).some((n) => n.type === 'link')).toBe(false);
  });

  it('does NOT turn the project folder itself into a door', () => {
    const tree = para(`${DIR}/`);
    linkArtifactPaths(tree, { dir: DIR });
    expect(nodes(tree).some((n) => n.type === 'link')).toBe(false);
  });

  it('still makes a page on its own line a link to the page, not a folder', () => {
    const tree = para(`${DIR}/designs/w-a18/r2/round3.html`);
    linkArtifactPaths(tree, { dir: DIR });
    expect(nodes(tree)[0].url).toBe('designs/w-a18/r2/round3.html');
  });
});
