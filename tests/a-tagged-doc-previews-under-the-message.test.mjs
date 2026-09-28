// A tagged doc previews under the message, wherever in the message it was named.
//
// The card she attached was, her own row. Its result ended with
//
//   designs/dev-landing-shots/round19.html
//
// and the pane showed a chip for it and nothing else, because the preview frame
// read `item.body` alone. On a row SHE wrote, the body is the one field a
// worker cannot touch, so that is the one place the path can never be.
import { describe, it, expect } from 'vitest';
import { embeddedDocuments } from '../renderer/src/message-artifacts.ts';
import { linkArtifactPaths } from '../renderer/src/remark-artifact-paths.ts';

describe('the preview reads the whole message', () => {
  it('finds the drawing named in the result of a row she wrote', () => {
    // Her real card, trimmed to its shape.
    const item = {
      body: 'The landing page changes have not turned up in the inbox.',
      result: [
        '**Pick a line gap, a way of counting and a Claude Code section.**',
        '',
        'Three codes, like LG3 TN2 SV6. Everything else you sent is done and live.',
        '',
        'designs/dev-landing-shots/round19.html',
      ].join('\n'),
    };
    expect(embeddedDocuments(item)).toEqual(['designs/dev-landing-shots/round19.html']);
  });

  it('finds one named only in the checkpoint, which is all a live row has', () => {
    const item = {
      body: 'Redraw the settings screen.',
      note: 'Three looks, shot in the app on the lake. designs/w-bfed5b6992/looks.html',
    };
    expect(embeddedDocuments(item)).toEqual(['designs/w-bfed5b6992/looks.html']);
  });

  it('still finds one named in the body, which is how it worked before', () => {
    expect(embeddedDocuments({ body: 'See `designs/week-32/board.html` for the numbers.' }))
      .toEqual(['designs/week-32/board.html']);
  });

  it('does not frame a report, since 2026-09-14 (w-f431617a8d)', () => {
    // The report stays a chip at the foot of the card and opens on a click.
    expect(embeddedDocuments({ body: 'See `reports/week-32.html` for the numbers.' })).toEqual([]);
    expect(embeddedDocuments({ result: 'strategy/plan.html and specs/api.html' })).toEqual([]);
  });

  it('puts the newest part of the message first', () => {
    const item = {
      body: 'The old one is at designs/round18.html.',
      result: 'The new one is at designs/round19.html.',
    };
    expect(embeddedDocuments(item)).toEqual(['designs/round19.html', 'designs/round18.html']);
  });

  it('names a document once however many times the message points at it', () => {
    const item = {
      body: 'designs/round19.html',
      result: 'Updated [the page](designs/round19.html), see designs/round19.html.',
    };
    expect(embeddedDocuments(item)).toEqual(['designs/round19.html']);
  });

  it('leaves everything that is not a page alone', () => {
    // Images are already inline where they were written, source files are the
    // handoff, and a url is somebody else's document.
    const item = {
      result: [
        'attachments/pasted-77668.png',
        'renderer/src/list-rules.ts',
        'https://agentbox-v2-landing.vercel.app/index.html',
        'reports/burn.csv',
      ].join('\n'),
    };
    expect(embeddedDocuments(item)).toEqual([]);
  });
});

// A path in a sentence used to be dead text; only backticks or brackets made it
// clickable, and which of the three a worker reached for was a coin flip.
const para = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const text = (value) => ({ type: 'text', value });
const only = (tree) => tree.children[0].children;

describe('a document path in a sentence is a link', () => {
  it('links a bare path a worker typed mid-sentence', () => {
    const tree = para(text('The drawing is at designs/round19.html, have a look.'));
    linkArtifactPaths(tree);
    expect(only(tree).map((n) => n.type)).toEqual(['text', 'link', 'text']);
    expect(only(tree)[1].url).toBe('designs/round19.html');
    expect(only(tree)[1].children[0].value).toBe('designs/round19.html');
    expect(only(tree)[2].value).toBe(', have a look.');
  });

  it('links a path that is the whole line, the way rule 7 asks for it', () => {
    const tree = para(text('designs/w-78c45faed4/first-run-flows.html'));
    linkArtifactPaths(tree);
    expect(only(tree)).toHaveLength(1);
    expect(only(tree)[0].url).toBe('designs/w-78c45faed4/first-run-flows.html');
  });

  it('links every path in a line, not just the first', () => {
    const tree = para(text('Compare designs/a.html with designs/b.html.'));
    linkArtifactPaths(tree);
    expect(only(tree).filter((n) => n.type === 'link').map((n) => n.url))
      .toEqual(['designs/a.html', 'designs/b.html']);
  });

  it('does not reach inside a link somebody already wrote', () => {
    const tree = para({
      type: 'link',
      url: 'https://example.com/a.html',
      children: [text('https://example.com/a.html')],
    });
    linkArtifactPaths(tree);
    expect(only(tree)).toHaveLength(1);
    expect(only(tree)[0].children[0].type).toBe('text');
  });

  it('leaves a path in backticks to the code span that already handles it', () => {
    const tree = para(text('Open '), { type: 'inlineCode', value: 'designs/round19.html' });
    linkArtifactPaths(tree);
    expect(only(tree).map((n) => n.type)).toEqual(['text', 'inlineCode']);
  });

  it('leaves a url alone, since it is not a file of this product', () => {
    const tree = para(text('Live at https://agentbox-v2-landing.vercel.app/index.html now.'));
    linkArtifactPaths(tree);
    expect(only(tree).every((n) => n.type === 'text')).toBe(true);
  });

  it('leaves an absolute path alone for the same reason', () => {
    const tree = para(text('It wrote /tmp/scratch/out.html and threw it away.'));
    linkArtifactPaths(tree);
    expect(only(tree).every((n) => n.type === 'text')).toBe(true);
  });

  it('does not link source files, because a link is a promise it opens', () => {
    const tree = para(text('The fold is in renderer/src/list-rules.ts and supervisor.mjs.'));
    linkArtifactPaths(tree);
    expect(only(tree).every((n) => n.type === 'text')).toBe(true);
  });

  it('does not read a version number as a file', () => {
    const tree = para(text('Electron 43.0 and v1.2 of the pack.'));
    linkArtifactPaths(tree);
    expect(only(tree).every((n) => n.type === 'text')).toBe(true);
  });
});
