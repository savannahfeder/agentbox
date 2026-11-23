// A FILE IN THE THREAD'S OWN FOLDER, NAMED IN FULL, WAS DEAD TEXT.
//
// A synthetic tester asked for "a prototype page of the new checkout screen as a
// single html file". The answer named it as
// /tmp/…/repos/web-app/.claude/worktrees/w-9e0f3b13cc/checkout-prototype.html,
// which drew as a long grey path with nothing to press (2026-11-20, run 3).
// A full path became a link only inside the project's documents folder, and a
// run writes its files in its own code folder, `<repo>/.claude/worktrees/<id>`.
// The app already opens a short name from that folder first, so the full path
// now reads as that short name.
import { describe, it, expect } from 'vitest';
import { linkArtifactPaths, shortPath } from '../renderer/src/remark-artifact-paths.ts';
import { taskFolder } from '../renderer/src/message-folders.ts';

const para = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const text = (value) => ({ type: 'text', value });
const run = (value, opts) => { const tree = para(text(value)); linkArtifactPaths(tree, opts); return tree.children[0].children; };
const links = (nodes) => nodes.filter((n) => n.type === 'link').map((n) => [n.url, n.children.map((c) => c.value).join('')]);

const DIR = '/home/you/Zero/accounts/acct/web-app';
const REPO = '/tmp/agentbox-verify/instances/a1/repos/web-app';
const FOLDER = taskFolder(REPO, 'w-9e0f3b13cc');
const opts = { dir: DIR, folder: FOLDER };

describe("a full path into the thread's own folder", () => {
  it('is the folder the run worked in', () => {
    expect(FOLDER).toBe(`${REPO}/.claude/worktrees/w-9e0f3b13cc`);
    expect(taskFolder(null, 'w-9e0f3b13cc')).toBeNull();
  });

  it('in a sentence, opens the file and reads as its name', () => {
    expect(links(run(`The page is ${FOLDER}/checkout-prototype.html, committed on this task's branch.`, opts)))
      .toEqual([['checkout-prototype.html', 'checkout-prototype.html']]);
  });

  it('on a line of its own, in a subfolder', () => {
    expect(links(run(`${FOLDER}/designs/checkout-a.html`, opts))).toEqual([['designs/checkout-a.html', 'checkout-a.html']]);
  });

  it('in quotes', () => {
    expect(links(run(`Saved as "${FOLDER}/checkout-prototype.html".`, opts))).toEqual([['checkout-prototype.html', 'checkout-prototype.html']]);
  });

  it('in backticks, reads as the short path the code span opens', () => {
    expect(shortPath(`${FOLDER}/checkout-prototype.html`, DIR, FOLDER)).toBe('checkout-prototype.html');
    expect(shortPath(`${DIR}/designs/a.html`, DIR, FOLDER)).toBe('designs/a.html');
  });

  it("does not reach into another thread's folder", () => {
    const other = `${REPO}/.claude/worktrees/w-0000aaaa11/checkout-prototype.html`;
    expect(links(run(`See ${other}.`, opts))).toEqual([]);
    expect(shortPath(other, DIR, FOLDER)).toBeNull();
  });

  it('leaves the rest of the repository and /tmp as text', () => {
    expect(links(run(`Built from ${REPO}/src/index.html and /tmp/scratch/out.html.`, opts))).toEqual([]);
  });

  it('a folder that only starts the same way is not the thread\'s', () => {
    expect(links(run(`${FOLDER}-old/checkout-prototype.html`, opts))).toEqual([]);
  });

  it('without the folder, nothing changes', () => {
    expect(links(run(`The page is ${FOLDER}/checkout-prototype.html.`, { dir: DIR }))).toEqual([]);
  });
});
