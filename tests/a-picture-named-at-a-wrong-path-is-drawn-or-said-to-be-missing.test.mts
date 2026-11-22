// A PICTURE NAMED AT A WRONG PATH DREW AS PLAIN TEXT, WITH NO SIGN IT WAS MEANT.
//
// On w-d4bac2245a an answer named five screenshots in full, each with the
// project's folder left out: <account>/designs/w-d4bac2245a/<shot>.png instead
// of <account>/agentbox-team/designs/w-d4bac2245a/<shot>.png. The files were at
// the right path all along, and the window drew five grey paths. Measured with
// linkArtifactPaths: a full path became a picture only inside the project's
// folder, so one anywhere else under the account's documents stayed a text
// node, exactly as /tmp scratch does.
//
// Now a picture or a page written in full under the account's documents is
// drawn as one. The window asks the app's finder for it, and the finder already
// retries a path with the project's folder left out, so the path from that
// thread draws its screenshot, and one that names no file says it is missing,
// by its name: the whole path ran to two lines of a dashed box.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountFilePath, linkArtifactPaths } from '../renderer/src/artifact-paths.ts';
import { resolveArtifact, stopWatchingFolders } from '../main/artifact-path.mts';

const ACCOUNT = '/Users/you/Zero/accounts/acct';
const DIR = `${ACCOUNT}/agentbox-team`;
const SHOT = 'designs/w-d4bac2245a/card-over-chat.png';

const para = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const run = (value, dir = DIR) => { const tree = para({ type: 'text', value }); linkArtifactPaths(tree, { dir }); return tree.children[0].children; };
const drawn = (nodes) => nodes.filter((n) => n.type === 'image').map((n) => n.url);
const linked = (nodes) => nodes.filter((n) => n.type === 'link').map((n) => [n.url, n.children[0].value]);

describe('a picture written in full under the account\'s documents', () => {
  it('with the project folder left out, as on that thread, is a picture and not text', () => {
    const nodes = run(`The card over a chat:\n${ACCOUNT}/${SHOT}`);
    expect(drawn(nodes)).toEqual([`${ACCOUNT}/${SHOT}`]);
    expect(nodes.find((n) => n.type === 'image').alt).toBe(`${ACCOUNT}/${SHOT}`);
  });

  it('at its right path still draws as the short path it always did', () => {
    expect(drawn(run(`${DIR}/${SHOT}`))).toEqual([SHOT]);
  });

  it('with a typo in the project folder is a picture too, so a missing one says so', () => {
    expect(drawn(run(`${ACCOUNT}/agentbox-tem/${SHOT}`))).toEqual([`${ACCOUNT}/agentbox-tem/${SHOT}`]);
  });

  it('in another project of the account is drawn as written, never as a path into this one', () => {
    expect(drawn(run(`${ACCOUNT}/astral/designs/planet.png`))).toEqual([`${ACCOUNT}/astral/designs/planet.png`]);
    expect(drawn(run(`${DIR}-video/designs/a.png`))).toEqual([`${DIR}-video/designs/a.png`]);
  });

  it('from the home folder with a tilde is the whole path', () => {
    expect(drawn(run(`~/Zero/accounts/acct/${SHOT}`))).toEqual([`${ACCOUNT}/${SHOT}`]);
  });

  it('every one of five on their own lines, as the answer had them', () => {
    const names = ['card-over-chat', 'card-over-group', 'card-over-teammate', 'gap-16px', 'inbox-unchanged'];
    const nodes = run(names.map((n) => `${ACCOUNT}/designs/w-d4bac2245a/${n}.png`).join('\n\n'));
    expect(drawn(nodes)).toHaveLength(5);
  });
});

describe('a page written in full under the account\'s documents', () => {
  it('is a link that reads as its name', () => {
    expect(linked(run(`It is at ${ACCOUNT}/designs/w-3a/latest.html now.`)))
      .toEqual([[`${ACCOUNT}/designs/w-3a/latest.html`, 'latest.html']]);
  });
});

describe('what stays text', () => {
  it('a /tmp picture, which is scratch', () => {
    expect(run('/tmp/x.png')).toEqual([{ type: 'text', value: '/tmp/x.png' }]);
  });

  it("the app's own source and anything else outside the account", () => {
    expect(drawn(run('/Users/you/Desktop/dev/agentbox/renderer/icon.png'))).toEqual([]);
    expect(drawn(run('/Users/you/Zero/accounts/acct-old/designs/a.png'))).toEqual([]);
    expect(drawn(run('/Users/you/Zero/accounts/other/astral/designs/a.png'))).toEqual([]);
  });

  it('a file under the account that is not a picture or a page', () => {
    expect(run(`${ACCOUNT}/.agentbox/state.json`)).toHaveLength(1);
    expect(linked(run(`${ACCOUNT}/notes.md and ${ACCOUNT}/leads.csv`))).toEqual([]);
  });

  it('a path that climbs out of the account', () => {
    expect(drawn(run(`${ACCOUNT}/../../../../etc/a.png`))).toEqual([]);
  });

  it('every full path, when the project folder is not inside an account', () => {
    expect(drawn(run('/Users/you/site/designs/a.png', '/Users/you/site/docs'))).toEqual([]);
    expect(accountFilePath(`${ACCOUNT}/${SHOT}`, null)).toBeNull();
  });
});

describe('a path in backticks', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

  it('is read by the same rule', () => {
    expect(accountFilePath(`${ACCOUNT}/${SHOT}`, DIR)).toBe(`${ACCOUNT}/${SHOT}`);
    expect(accountFilePath('/tmp/x.png', DIR)).toBeNull();
    const span = focus.slice(focus.indexOf('code: ({ children, className }'), focus.indexOf('code: ({ children, className }') + 1500);
    expect(span).toContain('accountFilePath(shown, productDir)');
  });
});

describe('the picture the window then asks for', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wrong-path-'));
  const account = path.join(root, 'accounts', 'acct');
  const dir = path.join(account, 'agentbox-team');
  fs.mkdirSync(path.join(dir, 'designs', 'w-d4bac2245a'), { recursive: true });
  fs.writeFileSync(path.join(dir, SHOT), 'png');
  const ask = (src) => resolveArtifact({ src, product: 'agentbox-team', products: [{ slug: 'agentbox-team', dir }], accountRoot: account, storeRoot: root });
  afterAll(() => { stopWatchingFolders(); fs.rmSync(root, { recursive: true, force: true }); });

  it('is found at its right path, so the screenshot from that thread draws', async () => {
    expect(await ask(path.join(account, SHOT))).toEqual({ ok: true, path: path.join(dir, SHOT) });
  });

  it('is not found when no file has its name, so the window says it is missing', async () => {
    expect((await ask(path.join(account, 'designs/w-d4bac2245a/never-made.png'))).ok).toBe(false);
  });
});

describe('a whole-path picture the window is still asking about', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const whole = focus.slice(focus.indexOf('if (whole !== null) {'), focus.indexOf('const rel = src.replace'));

  it('holds a picture\'s place rather than saying "missing image" and then turning into the picture', () => {
    const asking = whole.indexOf('found === undefined');
    expect(asking).toBeGreaterThan(-1);
    expect(asking).toBeLessThan(whole.indexOf('missing image'));
    expect(whole.slice(asking, whole.indexOf('missing image'))).toContain('inline-image arriving');
  });

  it('once nothing has it, says which picture by its name, with the whole path left to the hover', () => {
    expect(whole).toContain('missing image: {shownName(file)}');
    expect(whole).toMatch(/title=\{`\$\{file\} could not be found/);
  });
});
