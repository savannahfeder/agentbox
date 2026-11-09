// A FILE, A FOLDER, A LINK OR A THREAD NAMED IN A MESSAGE READS AS A QUIET
// MENTION: an icon that says what kind of thing it is, then its name, softly
// underlined (w-a3a7d1a1ec, 2026-10-11).
//
// What broke, from her screenshot: every file a worker named was drawn as its
// full path in the accent orange ("rather unattractive"), a design folder was
// an orange `designs/w-7a670f07bb/` that said nothing about being a folder
// until she clicked it, and hovering a thread tag "doesn't feel logical".
// Measured in the stylesheet: the tag's hover asked for `var(--hover)`, which
// no theme defines, so on hover its fill dropped to nothing while its outline
// jumped to the near-white text colour, with no transition at all.
//
// Of four drawn directions she chose the mention (B): no box, an icon and the
// name, a soft wash behind it on hover, 120ms in and 200ms out.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mentionKind, mentionName, mentionLabel, folderTitle } from '../renderer/src/mentions.ts';
import { Mention } from '../renderer/src/components/Mention.tsx';
import { TicketLink, TicketNavigation } from '../renderer/src/components/TicketReference.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const visible = (html) => html.replace(/<[^>]+>/g, '');

describe('what kind of thing a reference is', () => {
  it('tells a folder, a page, a note, a picture, code, a film and an address apart', () => {
    expect(mentionKind('designs/w-7a670f07bb/')).toBe('folder');
    expect(mentionKind('legal/privacy.html')).toBe('page');
    expect(mentionKind('decisions.md')).toBe('doc');
    expect(mentionKind('report.pdf')).toBe('doc');
    expect(mentionKind('designs/a.png')).toBe('image');
    expect(mentionKind('main/phone-server.mjs')).toBe('code');
    expect(mentionKind('renderer/src/App.tsx:12')).toBe('code');
    expect(mentionKind('renders/demo.mp4')).toBe('media');
    expect(mentionKind('https://tailscale.com/kb/1153/')).toBe('link');
  });

  it('calls an address a link even when it ends in a file name', () => {
    expect(mentionKind('https://example.com/a.png')).toBe('link');
    expect(mentionKind('http://localhost:3000/page.html')).toBe('link');
    expect(mentionKind('mailto:someone@example.com')).toBe('link');
  });

  it('falls back to a plain file for anything it does not know', () => {
    expect(mentionKind('build/app.dmg')).toBe('file');
    expect(mentionKind('notes')).toBe('file');
    expect(mentionKind('')).toBe('file');
  });
});

describe('the name a mention shows', () => {
  it('is the file name, not the whole path', () => {
    expect(mentionName('legal/privacy.html')).toBe('privacy.html');
    expect(mentionName('/Users/you/Zero/designs/w-3a/latest.html')).toBe('latest.html');
    expect(mentionName('decisions.md')).toBe('decisions.md');
  });

  it('keeps a line number, which is the point of naming one', () => {
    expect(mentionName('renderer/src/App.tsx:12')).toBe('App.tsx:12');
    expect(mentionName('main/x.mjs#L40')).toBe('x.mjs#L40');
  });

  it('is the last folder for a folder', () => {
    expect(mentionName('designs/w-7a670f07bb/')).toBe('w-7a670f07bb');
  });

  it('drops only the scheme and a trailing slash from an address', () => {
    expect(mentionName('https://tailscale.com/kb/1153/')).toBe('tailscale.com/kb/1153');
    expect(mentionName('http://localhost:3000')).toBe('localhost:3000');
    expect(mentionName('mailto:someone@example.com')).toBe('someone@example.com');
  });
});

// 2026-10-12, her second screenshot: four films named by their full path,
// `/Users/…/astral-video-agent/designs/w-bddbdfe747/agenttray-intro-version-1.mp4`,
// each drawn as a plain black line over its player. The player draws its own
// name and the first round only took that name's orange away, so a film read as
// a reference nobody had detected.
describe('the words a mention shows in place of what the worker wrote', () => {
  const film = 'designs/w-bddbdfe747/agenttray-intro-version-1.mp4';
  it('shortens a film written out in full to its file name', () => {
    expect(mentionLabel(film, `/Users/you/Zero/accounts/acct/astral-video-agent/${film}`)).toBe('agenttray-intro-version-1.mp4');
    expect(mentionLabel(film, film)).toBe('agenttray-intro-version-1.mp4');
    expect(mentionLabel(film, undefined)).toBe('agenttray-intro-version-1.mp4');
  });
  it('keeps a file name that has a space in it whole', () => {
    expect(mentionLabel('Sample Film.mp4', 'Sample Film.mp4')).toBe('Sample Film.mp4');
    expect(mentionLabel('renders/Final Film.mp4', '/Users/you/renders/Final Film.mp4')).toBe('Final Film.mp4');
  });
  it('names an address by the address, even when the words were its bare form', () => {
    expect(mentionLabel('http://localhost:3002', 'localhost:3002')).toBe('localhost:3002');
    expect(mentionLabel('http://www.example.com/a/b', 'www.example.com/a/b')).toBe('www.example.com/a/b');
  });
  it('leaves words the worker chose alone', () => {
    expect(mentionLabel('designs/demo.html', 'the page')).toBeNull();
    expect(mentionLabel('missing.pdf', 'the missing file')).toBeNull();
    expect(mentionLabel('https://example.com', 'here')).toBeNull();
  });
});

describe('the name a design folder goes by', () => {
  const names = (id) => (id === 'w-b222222222' ? 'Phone access setup' : null);
  it('is "Designs for this thread" when it is this thread\'s own folder', () => {
    expect(folderTitle('designs/w-a111111111/', { thread: 'w-a111111111', name: names })).toBe('Designs for this thread');
  });
  it('names another thread by its title', () => {
    expect(folderTitle('designs/w-b222222222/', { thread: 'w-a111111111', name: names })).toBe('Designs for Phone access setup');
  });
  it('keeps the folder\'s own name when the thread is unknown or it is not a designs folder', () => {
    expect(folderTitle('designs/w-c333333333/', { thread: 'w-a111111111', name: names })).toBe('w-c333333333');
    expect(folderTitle('designs/w-a111111111/round-2/', { thread: 'w-a111111111', name: names })).toBe('round-2');
    expect(folderTitle('renders/w-a111111111/', { thread: 'w-a111111111', name: names })).toBe('w-a111111111');
  });
});

describe('how a mention is drawn', () => {
  it('is an icon and the name, with the full path on hover, and no code box', () => {
    const html = renderToStaticMarkup(h(Mention, { kind: 'page', title: 'legal/privacy.html', href: 'file:///x' }, 'privacy.html'));
    expect(html).toContain('class="mention mention-page"');
    expect(html).toContain('<svg');
    expect(html).toContain('title="legal/privacy.html"');
    expect(html).not.toContain('<code');
    expect(visible(html)).toBe('privacy.html');
  });

  it('draws a thread the same way, keeping its name and never its id', () => {
    const id = 'w-a123456789';
    const html = renderToStaticMarkup(h(TicketNavigation.Provider, { value: { open: () => {}, name: () => 'Shared engine' } }, h(TicketLink, { id }, id)));
    expect(html).toContain('mention mention-thread');
    expect(visible(html)).toBe('Shared engine');
  });
});

describe('the stylesheet', () => {
  const css = read('renderer/src/components/mention.css');
  const styles = read('renderer/src/styles.css');

  it('asks only for colours a theme defines, so hover can never drop to nothing', () => {
    const asked = [...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(0);
    for (const token of new Set(asked)) {
      expect(styles, token).toMatch(new RegExp(`^\\s*${token}\\s*:`, 'm'));
    }
  });

  it('moves in 120ms and back out in 200ms, never snapping', () => {
    expect(css).toMatch(/\.mention\s*\{[^}]*transition:[^}]*200ms/);
    expect(css).toMatch(/\.mention:hover[^{]*\{[^}]*transition-duration:\s*120ms/);
  });

  it('draws neither a mention nor a folder\'s name in the accent orange', () => {
    expect(css).not.toMatch(/color:\s*var\(--accent\)/);
    const folderRule = styles.match(/\.folder-preview-path\s*\{[^}]*\}/)?.[0] ?? '';
    expect(folderRule).not.toMatch(/var\(--accent\)/);
  });

  it('no stylesheet asks for the --hover colour that no theme has', () => {
    const sheets = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? sheets(path.join(dir, e.name)) : e.name.endsWith('.css') ? [path.join(dir, e.name)] : []);
    for (const file of sheets(path.join(root, 'renderer/src'))) {
      expect(fs.readFileSync(file, 'utf8'), path.relative(root, file)).not.toMatch(/var\(--hover\)/);
    }
  });
});

describe('the message pane', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  it('draws a file it links to as a mention, the code span included', () => {
    expect(focus).toMatch(/<ArtifactLink[^>]*kind=\{mentionKind\(href/);
    expect(focus).toMatch(/<ArtifactLink[^>]*kind=\{mentionKind\(path\)\}/);
  });
  it('gives the folder its icon and a name instead of its path', () => {
    expect(focus).toMatch(/folderTitle\(folder/);
  });
  it('draws a film or a sound\'s name over its player as a mention too', () => {
    const media = focus.slice(focus.indexOf('export function ArtifactMedia'), focus.indexOf('// A FOLDER A WORKER NAMES'));
    expect(media).toMatch(/className="inline-media-name mention mention-media"/);
    expect(media).toMatch(/<MentionIcon kind="media" \/>/);
    expect(media).toMatch(/mentionLabel\(rel/);
  });
  it('no longer draws a film\'s name in the message\'s own code box', () => {
    expect(focus).not.toMatch(/<ArtifactMedia[^\n]*label=\{<code>/);
  });
});
