// A PROJECT ROW NAMED THE STORE FOLDER AND NOT THE REPOSITORY.
//
// Measured on the Linux box, 2026-10-23 (F-36): Web Todo's row in Settings >
// Projects read `/home/box/.local/share/agentbox/accounts/aaaaaaaa…/web-…`
// while every commit it had ever made landed in
// `/workspace/agentbox-test-repos/web-todo`. The store holds a project's
// documents; the repository is where its work happens, and that is the one
// people recognise. The row drew `dir` because `dir` was all it was handed.
//
// And it was cut off either way (F-35): the path is one line with an ellipsis
// and nothing carried the whole of it, so two projects under one account root
// were told apart by a stretch of path that is identical on both.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectsPage, where } from '../renderer/src/components/ProjectsPage.tsx';
import { shortPath } from '../renderer/src/components/Settings.tsx';

const STORE = '/home/box/.local/share/agentbox/accounts/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/web-todo';
const REPO = '/workspace/agentbox-test-repos/web-todo';

const draw = (details, home = null) => renderToStaticMarkup(createElement(ProjectsPage, {
  ranked: details.map((d) => ({ slug: d.slug, name: d.name, dir: d.dir, repoPath: d.repoPath ?? null })),
  details,
  home,
  onOpen() {},
}));

describe('which path a project row shows', () => {
  // THE DEFECT: the repository was known and the store folder was drawn.
  it('names the code folder where the project has one', () => {
    const html = draw([{ slug: 'web-todo', name: 'Web Todo', dir: STORE, repoPath: REPO }]);
    expect(html).toContain(REPO);
    expect(html).not.toContain('.local/share/agentbox');
  });

  // THE CASE THAT MUST NOT CHANGE: a project with no repository still says
  // where it is, because that is the only thing telling two of one name apart.
  it('falls back to the store folder for a project with no code of its own', () => {
    const html = draw([{ slug: 'my-workspace', name: 'My Workspace', dir: STORE, repoPath: null }]);
    expect(html).toContain('accounts/aaaaaaaa');
  });

  // AND THE WHOLE PATH IS THERE TO BE READ, since the row cuts it off.
  it('carries the full path as the row’s title', () => {
    expect(draw([{ slug: 'web-todo', name: 'Web Todo', dir: STORE, repoPath: REPO }]))
      .toContain(`title="${REPO}"`);
  });

  it('answers with nothing for a project that has neither', () => {
    expect(where({ repo: null, dir: '' })).toBe('');
    expect(where({ repo: REPO, dir: STORE })).toBe(REPO);
    expect(where({ repo: null, dir: STORE })).toBe(STORE);
  });
});

describe('the home folder in a drawn path', () => {
  // ON LINUX THE HOME IS `/home/<name>` and `shortPath` only knew `/Users/`, so
  // a store folder was drawn as sixty characters of account root before the
  // ellipsis even started.
  it('draws a path under the home as ~, when the home is given', () => {
    const html = draw([{ slug: 'my-workspace', name: 'My Workspace', dir: STORE, repoPath: null }], '/home/box');
    expect(html).toContain('~/.local/share/agentbox');
    expect(html).not.toContain('>/home/box/.local');
  });

  // THE CASE THAT MUST NOT MATCH: a folder that merely starts with the same
  // letters is not inside the home.
  it('leaves a path outside the home alone', () => {
    expect(shortPath('/home/boxcar/code/x', '/home/box')).toBe('/home/boxcar/code/x');
    expect(shortPath('/workspace/repos/x', '/home/box')).toBe('/workspace/repos/x');
    expect(shortPath('/home/box', '/home/box')).toBe('/home/box');
  });

  // And with no home said, the macOS shape it always guessed still holds, which
  // is what every other caller relies on.
  it('still shortens a Mac home with nothing said', () => {
    expect(shortPath('/Users/you/Desktop/dev/kestrel')).toBe('~/Desktop/dev/kestrel');
    expect(shortPath('/home/box/x')).toBe('/home/box/x');
  });
});
