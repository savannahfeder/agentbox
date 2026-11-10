// BUTTONS, CHIPS, CARDS AND MENUS ARE SOFT, AND AN AI TEAMMATE IS ROUND.
//
// "I don't see a good organizational system or rounded corners on these
// components" and "these images have sharp corners", after faces, file tiles and
// the reply box had been softened. Measured in the running app (light, 1440x900)
// and off the stylesheets on 2026-10-31: the corner most controls took,
// --radius, was 3px and read as square; --tag-radius was 0; 22 rules in the
// chat and 9 elsewhere set buttons, menus and pickers to 0; the file a teammate
// sends, the Needs you card in its chat, its answer chips and its fields drew no
// corner at all; Connections and the viewer used 4, 7, 8, 9, 12 and 14px; and an
// AI teammate's face was a dashed square at 28% while people were round.
//
// The scale is three sizes: the small corner for what you press or type in, the
// artifact corner for cards, sheets, menus and what somebody made, and round for
// faces and dots. Rows, dividers, tabs and the panels of the window stay square.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'renderer/src');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const f = join(dir, n); return statSync(f).isDirectory() ? walk(f) : [f]; });
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const css = walk(src).filter((f) => f.endsWith('.css'));
const soft = join(src, 'soft-corners.css');
// soft-corners.css loads last, so it is read last and wins a tie.
const sheets = [...css.filter((f) => f !== soft), soft].map((f) => ({ file: relative(src, f), text: strip(readFileSync(f, 'utf8')) }));
const styles = sheets.find((s) => s.file === 'styles.css').text;
const rules = sheets.flatMap((s) => [...s.text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ file: s.file, selectors: m[1].split(',').map((x) => x.trim().replace(/\s+/g, ' ')), body: m[2] })));

/** The corner the last rule naming exactly this selector gives it, or null. */
function cornerOf(sel) {
  let found = null;
  for (const r of rules) {
    if (!r.selectors.includes(sel)) continue;
    const m = /border-radius:\s*([^;]+)/.exec(r.body);
    if (m) found = m[1].trim();
  }
  return found;
}
const SMALL = /^var\(--(radius|tag-radius|artifact-corner-small)\)$/;
const BIG = /^var\(--artifact-corner\)$/;

describe('the scale', () => {
  it('puts the corner most controls take on the small corner, with no number of its own', () => {
    expect(styles).toMatch(/--radius:\s*var\(--artifact-corner-small\);/);
    expect(styles).toMatch(/--tag-radius:\s*var\(--radius\);/);
  });
  it('keeps the film look round too', () => {
    // Rounded in every theme since 2026-11-02 (one-corner-for-the-whole-app).
    const grid = styles.slice(styles.indexOf(':root[data-skin="ember-grid"] {'));
    expect(grid.slice(0, grid.indexOf('}'))).not.toMatch(/--radius:/);
  });
});

describe('what you press or type in takes the small corner', () => {
  it.each([
    ['.th-new', 'New thread'], ['.ts-done', 'Cloud'], ['.th-disp', 'the view and filters button'],
    ['.fp-find', 'Search files'], ['.cx-search', 'Chats search'], ['.td-range button', 'Today, Yesterday, This week'],
    ['.fp-kind', 'Recent and Name'], ['.td-line', 'a Today row on hover'], ['.tq-chip', 'an answer chip in a teammate chat'],
    ['.tq-in', 'a field on a teammate'], ['.tq-quiet', 'Write your own'], ['.chat-chip', 'a chip in a chat'],
    ['.chat-act', 'a message action'], ['.chat-confirm-no, .chat-confirm-yes', 'Cancel and Delete'], ['.fmt-btn', 'a format button'],
    ['.av-btn', 'a viewer button'], ['.av-pin-tag', 'a pin\'s tag'], ['.av-reply-write textarea', 'a reply to a comment'],
    ['.cn-button', 'a Connections button'], ['.cn-input', 'a Connections field'],
    ['.approval-actions button', 'Allow and Deny'], ['.rm-input', 'a group\'s field'], ['.rm-search', 'Find groups'],
    ['.gc-find', 'find in a chat'], ['.th-follow', 'Follow'], ['.tm-seg', 'a team switch'], ['.rm-btn', 'a group button'], ['.tq-sent-line', 'a thread a teammate sent you'],
  ])('%s (%s)', (sel) => {
    const v = cornerOf(sel.includes(',') ? sel.split(',')[0].trim() : sel);
    expect(v, sel).toMatch(SMALL);
  });
});

describe('cards, sheets and menus take the artifact corner', () => {
  it.each([
    ['.tq-doc-card', 'the file a teammate sends in its chat'],
    ['.approval-card', 'the permission card'], ['.modal', 'a sheet or dialog'], ['.cn-tile', 'a Connections card'], ['.cn-sheet', 'a Connections sheet'],
    ['.av-note', 'a comment card in the viewer'], ['.av-write-box', 'the note box, like the reply box'],
    ['.th-menu', 'a thread menu'], ['.th-pop', 'the view and filters menu'], ['.tc-menu', 'the composer\'s menus'],
    ['.chat-menu', 'a message\'s menu'], ['.chat-confirm', 'a delete question'], ['.chat-emoji', 'the emoji picker'],
    ['.prio-menu', 'priority'], ['.when-menu', 'when'], ['.slash-menu', 'slash commands'], ['.mention-menu', 'mentions'],
    ['.set-picker-menu', 'a settings picker'], ['.th-acct-menu', 'the account menu'], ['.th-me-pop', 'your own menu'],
    ['.fp-menu', 'a file\'s menu'], ['.rm-pop', 'a group\'s menu'],
  ])('%s (%s)', (sel) => {
    expect(cornerOf(sel), sel).toMatch(BIG);
  });
});

describe('an AI teammate is round, and still told apart by its dashed ring', () => {
  it('rounds the mark all the way, like a person', () => {
    expect(styles).toMatch(/--mate-corner:\s*50%;/);
  });
  it('keeps it dashed', () => {
    for (const sel of ['.agent-face', '.ev-ai', '.tq']) {
      const dashed = rules.some((r) => r.selectors.includes(sel) && /border: 1px dashed/.test(r.body));
      expect(dashed, sel).toBe(true);
    }
  });
  it('does not make a group round: its # stays a soft tile', () => {
    expect(cornerOf('.ev-hash')).toMatch(SMALL);
  });
});

describe('no control is squared by hand', () => {
  // A zero on these is a decision about a surface that paints no box, sits flush
  // against the window, is the phone's full-width sheet, or belongs to a table,
  // which is square inside and in its pane.
  const FLUSH = [
    /^\.tab$/, /^\.rail$/, /list-pane/, /doc-card$/, /doc-view$/, /^\.chat-thread-(panel|line)$/, /video$/, /artifact-thumbnail$/,
    /\.ps-step \+ \.ps-step/, /pre code$/, /did-cmd$/, /kbd$/, /\.idle-(key|field)$/, /usage-(panel|meter)/, /::before$/,
    /\.opt-strip$/, /\.set-plate$/, /\.app-mark$/, /\.tq-from-table$/, /\.ts-rail$/, /\.set-step$/, /\.sent-line$/,
    /\[data-review-style/, /\[data-preview-treatment/, /\.doc-head$/, /\.film-video$/, /\.workspace-find button$/,
    /\.tbl-menu$/,
  ];
  const CONTROL = /(btn|button|chip|menu|pop|confirm|search|field|input|act|emoji|retry|close|send|caret|cancel|save|more|play|speed|remove|find|back|open|x|tick|picker|card|box|quick|ask)$/;
  it('leaves no button, chip, field, card or menu at 0 outside the phone layout', () => {
    const squared = rules
      .filter((r) => r.file !== 'phone.css' && /border-radius:\s*0(px)?\s*(;|$)/.test(r.body))
      .flatMap((r) => r.selectors.map((s) => ({ file: r.file, s })))
      .filter(({ s }) => !FLUSH.some((re) => re.test(s)))
      .filter(({ s }) => /^0(px)?$/.test(cornerOf(s)))
      .filter(({ s }) => CONTROL.test((s.split(/[\s>+~]+/).pop() || '').replace(/:{1,2}[a-z-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '')))
      .map(({ file, s }) => `${file}: ${s}`);
    expect(squared).toEqual([]);
  });
  it('gives Connections and the viewer no loose corner of their own', () => {
    for (const file of ['connections/connections.css', 'components/artifact-view.css']) {
      const text = sheets.find((s) => s.file === file).text;
      const loose = [...text.matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1].trim())
        .filter((v) => !/^(var\(--[a-z-]+\)|50%|0|inherit)$/.test(v));
      expect(loose, file).toEqual([]);
    }
  });
});
