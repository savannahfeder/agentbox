// A PROJECT CAN BE RENAMED AND GIVEN A MARK.
//
// The store has been able to rename since the beginning (`renameProject`) and
// NOTHING WAS EVER WIRED TO IT, so the name a project was created with was the
// name it had forever. The same for the mark: `ProductMark` has taken a `src`
// since 2026-08-12 and nothing ever set one, so `Rail.tsx` read a field that
// did not exist on any product.
//
// These tests hold the two ends: what is written to disk, and what `listProducts`
// hands the window. The middle (the sidebar row, the picker) is the part a test
// cannot see, and the screenshots on the work item are how that was checked.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Name } from '../shared/product-name.mjs';
import { IMG_SCHEME } from '../shared/schemes.mjs';
import {
  cleanName,
  clearProjectIcon,
  isIconKind,
  iconPathFor,
  setProjectIcon,
  setProjectName,
} from '../main/project-identity.mjs';

// The same shape every other Store test uses: a throwaway root, one project
// written by hand, because none of this needs the work-item machinery.
function store(projects = { alpha: 'Alpha' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-identity-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  for (const [slug, name] of Object.entries(projects)) {
    fs.mkdirSync(path.join(accountRoot, slug), { recursive: true });
    fs.writeFileSync(
      path.join(accountRoot, slug, 'project.json'),
      JSON.stringify({ schemaVersion: 2, id: slug, name }),
    );
  }
  const s = new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] });
  return { store: s, dir: (slug) => path.join(accountRoot, slug) };
}

// A real one-pixel png, because setProjectIcon copies bytes and stats the result.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
function picture(name = 'mark.png') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-pic-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, PNG);
  return file;
}

describe('what a project is called', () => {
  it('renames it on disk, and the list says the new name', () => {
    const { store: s, dir } = store();
    expect(s.listProducts()[0].name).toBe('Alpha');

    setProjectName(dir('alpha'), Name);

    expect(s.listProducts()[0].name).toBe(Name);
    expect(JSON.parse(fs.readFileSync(path.join(dir('alpha'), 'project.json'), 'utf8')).name)
      .toBe(Name);
  });

  // THE SLUG NEVER MOVES, and this is the whole reason a rename is safe to offer
  // at all. Every work item, every session log and every claim points at a
  // project by its folder name; renaming the folder to match would orphan all of
  // them. So the folder keeps its name and only the label changes.
  it('leaves the folder, and everything pointing at it, alone', () => {
    const { store: s, dir } = store();
    setProjectName(dir('alpha'), Name);
    expect(s.listProducts()[0].slug).toBe('alpha');
    expect(fs.existsSync(path.join(dir('alpha'), 'project.json'))).toBe(true);
  });

  // Refused, not coerced. A nameless project is a blank row in the sidebar whose
  // only handle for fixing it is the name that just disappeared.
  it('refuses to leave a project with no name', () => {
    const { store: s, dir } = store();
    expect(() => setProjectName(dir('alpha'), '   ')).toThrow();
    expect(() => setProjectName(dir('alpha'), '')).toThrow();
    expect(s.listProducts()[0].name).toBe('Alpha');
  });

  it('tidies what she typed without arguing about it', () => {
    expect(cleanName(`  ${Name}  `)).toBe(Name);
    // A name pasted out of a document arrives with the newline in it, and a
    // newline in a sidebar row pushes every row below it down.
    expect(cleanName('Power\nup')).toBe('Power up');
    expect(cleanName('   ')).toBe(null);
    expect(cleanName('x'.repeat(200)).length).toBe(60);
  });
});

describe('the mark beside the name', () => {
  it('is nothing at all until she picks one, which is what draws the burst', () => {
    const { store: s } = store();
    expect(s.listProducts()[0].logo).toBe(null);
  });

  // COPIED IN, NOT POINTED AT. Her suggestion was a pointer at wherever the
  // picture already sits; main/project-identity.mjs says why this copies instead.
  // Nothing about it leaves the Mac either way, which was her actual constraint.
  it('copies the picture into the project folder and draws it from there', () => {
    const { store: s, dir } = store();
    const source = picture();

    setProjectIcon(dir('alpha'), source);

    expect(fs.existsSync(path.join(dir('alpha'), 'icon.png'))).toBe(true);
    // The original is untouched: this is a copy, not a move. Somebody who picks
    // a picture out of a folder they care about must still have it afterwards.
    expect(fs.existsSync(source)).toBe(true);
    expect(s.listProducts()[0].logo).toMatch(new RegExp(`^${IMG_SCHEME}://file/`));
    expect(s.listProducts()[0].logo).toContain('icon.png');
  });

  // One file per project. Without this a project that had a .png and then chose
  // a .webp keeps both, and the stale one is what a later reader trips over.
  it('replaces the old picture rather than collecting them', () => {
    const { store: s, dir } = store();
    setProjectIcon(dir('alpha'), picture('one.png'));
    setProjectIcon(dir('alpha'), picture('two.webp'));

    expect(fs.existsSync(path.join(dir('alpha'), 'icon.png'))).toBe(false);
    expect(fs.existsSync(path.join(dir('alpha'), 'icon.webp'))).toBe(true);
    expect(s.listProducts()[0].logo).toContain('icon.webp');
  });

  it('goes back to the burst, and takes the file with it', () => {
    const { store: s, dir } = store();
    setProjectIcon(dir('alpha'), picture());
    clearProjectIcon(dir('alpha'));

    expect(s.listProducts()[0].logo).toBe(null);
    // The picture goes too. Leaving it behind means "no icon" and an icon.png
    // sitting in her folder, which is the kind of thing that gets asked about a
    // month later.
    expect(fs.existsSync(path.join(dir('alpha'), 'icon.png'))).toBe(false);
  });

  // A PICTURE SHE HAS SINCE DELETED DRAWS THE BURST, NOT A BROKEN IMAGE. The
  // burst is a correct answer to "this project has no mark". A broken image is
  // not an answer at all, and it is the one thing a user reads as the app being
  // broken rather than the file being gone.
  it('falls back to the burst when the picture is no longer there', () => {
    const { store: s, dir } = store();
    setProjectIcon(dir('alpha'), picture());
    fs.rmSync(path.join(dir('alpha'), 'icon.png'));

    expect(s.listProducts()[0].logo).toBe(null);
  });

  it('takes only pictures it can actually draw', () => {
    const { dir } = store();
    expect(isIconKind('a.png')).toBe(true);
    expect(isIconKind('a.JPG')).toBe(true);
    // No svg: an svg is a document with script in it, and this one is drawn
    // inside her app rather than in a sandbox.
    expect(isIconKind('a.svg')).toBe(false);
    expect(isIconKind('a.pdf')).toBe(false);
    expect(() => setProjectIcon(dir('alpha'), picture('note.txt'))).toThrow();
  });

  // A project.json edited by hand, or written by something older, must not be
  // able to turn the mark into a read outside the project folder.
  it('never reads a mark from outside the project folder', () => {
    const { dir } = store();
    expect(iconPathFor({ dir: dir('alpha'), logo: '../../../etc/hosts.png' })).toBe(null);
    expect(iconPathFor({ dir: dir('alpha'), logo: '/etc/passwd.png' })).toBe(null);
    expect(iconPathFor({ dir: dir('alpha'), logo: 'icon.svg' })).toBe(null);
  });

  it('gives each project its own mark and leaves the others on the burst', () => {
    const { store: s, dir } = store({ alpha: 'Alpha', beta: 'Beta' });
    setProjectIcon(dir('beta'), picture());

    const byName = Object.fromEntries(s.listProducts().map((p) => [p.name, p.logo]));
    expect(byName.Alpha).toBe(null);
    expect(byName.Beta).toContain('icon.png');
  });
});
