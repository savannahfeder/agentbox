// THE PROJECTS GET A PAGE, AND THE NAV COLUMN GETS ONE ROW.
//
// MEASURED ON HER STORE THAT DAY: 36 projects. The column drew every one of
// them as a nav row under a heading that had scrolled off the top, so what she
// saw was five settings pages followed by thirty-six unexplained names.
//
// THIS IS NOT THE "ALL PROJECTS" TABLE SHE TURNED DOWN on. This is Settings,
// where the question is which project's settings to open, and she asked for
// this one in as many words.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
// THE PAGE MOVED INTO ITS OWN FILE when it took over the running order too
// (w-a514b58055): Projects and Priority are one page now, called Projects.
// Every promise below still holds there.
const pageFile = read('renderer/src/components/ProjectsPage.tsx');
const pageOf = () => pageFile.slice(pageFile.indexOf('export function ProjectsPage('));

describe('the column stops being a list of projects', () => {
  // THE DEFECT, STATED AS THE THING IT DID. Every project was a row here.
  it('draws one door and not one row per project', () => {
    const nav = settings.slice(settings.indexOf('<div className="set-nav-scroll">'), settings.indexOf('<div className="set-pane"'));
    expect(nav).not.toContain('projects.map(');
    // One row per PAGE since the redraw (w-ccadd13c46), Projects among them.
    expect(nav).toContain('<span className="set-nav-label">{p.label}</span>');
    expect(nav).toContain('onClick={() => setPane(p.id)}');
  });

  // THE COUNT LEFT THE ROW IN THE REDRAW (w-ccadd13c46). The menu is a glance
  // surface, and the standing rule for those is no counts and no bookkeeping;
  // the Projects page itself lists every one.
  it('carries no count on any menu row', () => {
    const nav = settings.slice(settings.indexOf('<div className="set-nav-scroll">'), settings.indexOf('<div className="set-pane"'));
    expect(nav).not.toContain('{projects.length}');
    expect(nav).not.toContain('set-nav-flag');
  });

  // AND WHERE YOU ARE, when you are inside one. With the list gone the column
  // would otherwise say nothing about which project's page is on screen, which
  // is worse than the clutter was.
  it('still shows the project whose page is open', () => {
    const nav = settings.slice(settings.indexOf('<div className="set-nav-scroll">'), settings.indexOf('<div className="set-pane"'));
    // Under the Projects row since the redraw (w-ccadd13c46).
    expect(nav).toContain("{p.id === 'projects' && current && (");
    expect(nav).toContain('setPane({ project: current.slug })');
  });

  // A NEW-PROJECT ROW HERE WAS "VISUALLY UNAPPEALING", and the menu still has
  // none. The + on the Projects heading went with that heading in the redraw
  // (w-ccadd13c46); the Projects page's own New project button is the door.
  it('adds no new-project row to the menu', () => {
    const nav = settings.slice(settings.indexOf('<div className="set-nav-scroll">'), settings.indexOf('<div className="set-pane"'));
    expect(nav).not.toContain('onNewProject');
    expect(settings).toMatch(/<ProjectsPage\b[\s\S]{0,400}onNew=\{onNewProject\}/);
  });
});

describe('the page itself', () => {
  it('exists, and is reachable from a link as well as a press', () => {
    expect(pageFile).toContain('export function ProjectsPage(');
    expect(settings).toContain('<ProjectsPage');
    expect(settings).toContain("pane === 'projects'");
    expect(settings).toContain('if (SETTINGS_PAGES.some((p) => p.id === want)) return want as SettingsPageId;');
  });

  // THIRTY-SIX IS PAST READING, so the page filters. It matches the name and the
  // folder, which are the two things she would type.
  it('can be filtered by name and by folder', () => {
    const page = pageOf();
    expect(page).toContain('p.name.toLowerCase().includes(needle)');
    expect(page).toContain('p.slug.toLowerCase().includes(needle)');
    expect(page).toContain("(p.dir ?? '').toLowerCase().includes(needle)");
  });

  // THE FOLDER IS DRAWN, because it is the one thing that tells two projects of
  // the same name apart, and her store has several such pairs.
  it('shows each project’s folder under its name', () => {
    const page = pageOf();
    expect(page).toContain('shortPath(p.dir)');
  });

  // NO STATE WORDS ON A ROW (2026-10-02, w-bb5047e258). The row carried "2
  // running" and "on its own", which read together as "2 running on its own":
  // "I'm not sure I understand what [it] means, and it looks a little visually
  // unappealing". Both facts live where they mean something, the inbox and
  // the project's own page, so the row is a name and a folder.
  it('says nothing about a project’s state on its row', () => {
    const page = pageOf();
    expect(page).not.toContain('pp-flag');
    expect(page).not.toContain("'on its own'");
    expect(page).not.toMatch(/\{p\.running\} running/);
  });

  // A PRESS ON A ROW OPENS THE PROJECT. Renaming and pictures stay on the page
  // it opens. Since the merge (w-a514b58055) a row can also be dragged into a
  // new place, which is the order and not an edit of the project.
  it('opens the project, and edits nothing on it from the list', () => {
    const page = pageOf();
    expect(page).toContain('onOpen(slug)');
    expect(page).not.toContain('onRename');
    expect(page).not.toContain('ProjectIcon');
  });
});

describe('the way back', () => {
  // A page you can only leave by pressing Escape out of Settings altogether is
  // the complaint she filed about Settings in the first place.
  it('gets out of one project back to the list', () => {
    expect(settings).toContain('className="set-crumb"');
    const crumb = settings.slice(settings.indexOf('className="set-crumb"'));
    expect(crumb.slice(0, 300)).toContain("setPane('projects')");
    expect(crumb.slice(0, 300)).toContain('<span>Projects</span>');
  });

  // A project that disappears while its page is open lands on the list rather
  // than on General, because the list is the nearest thing that still answers
  // the question the page was asked.
  it('lands on the list when a project goes away underneath it', () => {
    expect(settings).toContain("if (typeof pane !== 'string' && model && !current) setPane('projects');");
  });

  // The stylesheet has to actually carry the page, or every class above is a
  // name pointing at nothing.
  it('is styled', () => {
    const css = read('renderer/src/styles.css');
    for (const name of ['.proj-index-top', '.proj-index-find', '.set-crumb']) {
      expect(css).toContain(name);
    }
    const page = read('renderer/src/components/projects-page.css');
    for (const name of ['.pp-row', '.pp-where', '.pp-rank', '.pp-acts']) {
      expect(page).toContain(name);
    }
    expect(page).not.toContain('.pp-flag');
  });

  // THE SEARCH LOOKS LIKE A SEARCH (2026-10-02): a plain box reading "Find a
  // project" "doesn't look super clear as a search". It carries the magnifier
  // every search field has, says Search, and clears with one press.
  it('draws the find box as a search bar', () => {
    const page = pageOf();
    expect(page).toMatch(/className="proj-search"/);
    expect(page).toMatch(/className="proj-search-icon"/);
    expect(page).toMatch(/placeholder="Search projects"/);
    expect(page).toMatch(/aria-label="Clear the search"/);
    expect(read('renderer/src/styles.css')).toMatch(/\.proj-search-icon \{/);
  });
});
