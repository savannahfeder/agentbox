// THE MODEL CAN BE SWITCHED FROM THE CLOUD VIEW.
//
// The cloud web app hid the model picker (`:root[data-via="cloud"]` in
// styles.css), on the reasoning that a reply from there reached the Mac without
// a model. That stopped being true when phone replies began carrying `model`
// and `effort` (tests/what-she-picks-on-the-phone-reaches-the-mac). First the
// reply box read "In Auto Mode. On ." (w-d66fd3175c), then, once the whole
// clause was hidden, there was no way to switch models mid-thread at all.
// Measured by reading the rule and by rendering the built app with
// data-via="cloud": the footer had no model word.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandFor, phoneSlug } from '../renderer/src/cloud-bridge';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('renderer/src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

// Every class a `:root[data-via="cloud"] … .x { display: none }` rule hides.
const hiddenOnCloud = () => {
  const out = new Set();
  for (const [, selectors, body] of css.matchAll(/([^{}]*data-via="cloud"[^{}]*)\{([^}]*)\}/g)) {
    if (!/display:\s*none/.test(body)) continue;
    for (const sel of selectors.split(',')) {
      if (!sel.includes('data-via="cloud"')) continue;
      for (const [, cls] of sel.matchAll(/\.([\w-]+)/g)) out.add(cls);
    }
  }
  return out;
};

describe('the cloud view shows the model', () => {
  it('hides none of the model picker, its clause or the folded box word', () => {
    const hidden = hiddenOnCloud();
    for (const cls of ['model-pick', 'clause-model', 'dock-model', 'ts-model']) {
      expect(hidden.has(cls), `.${cls} is hidden on the cloud`).toBe(false);
    }
  });

  it('keeps the priority and the mode on screen too', () => {
    const hidden = hiddenOnCloud();
    for (const cls of ['compose-sentence', 'compose-word', 'compose-word-wrap', 'clause', 'clause-priority']) {
      expect(hidden.has(cls), `.${cls} is hidden on the cloud`).toBe(false);
    }
  });

  it('sends the model picked there on to the Mac with the reply', () => {
    const cmd = commandFor('zero:answer', { product: phoneSlug('a1b2c3d4e5f6', 'alpha'), id: 'w-1', answer: 'go on', model: 'sonnet', effort: 'high' });
    expect(cmd.payload).toEqual({ text: 'go on', model: 'sonnet', effort: 'high' });
  });
});

describe('"On", the model and the full stop stay one clause', () => {
  // The reply box draws the new thread card's menu since w-e1a42f6b21 and the
  // old card still has its own drawer, so each box is asked about the one it
  // draws. The clause is the same clause in both.
  for (const [file, tag] of [
    ['renderer/src/components/Focus.tsx', 'ReplyModel'],
    ['renderer/src/components/Compose.tsx', 'ModelPicker'],
  ]) {
    it(file, () => {
      const src = read(file);
      const at = src.search(new RegExp(`\\{'On '\\}\\s*<${tag}`));
      expect(at).toBeGreaterThan(-1);
      const open = src.lastIndexOf('<span className="', at);
      const cls = src.slice(open).match(/^<span className="([^"]*)"/)[1];
      expect(cls.split(/\s+/).some((c) => c === 'clause-model' || c === 'dock-model')).toBe(true);
      // WHATEVER ENDS THE SENTENCE ENDS IT INSIDE THIS SPAN. The reply box's
      // clause now carries the level when the thread is set to one ("On Opus
      // 5.5, High."), so the stop is no longer the only thing written after
      // the picker; what must not change is that all of it is hidden with
      // "On" rather than leaving "On ." behind.
      const tail = src.slice(src.indexOf('/>', src.indexOf(`<${tag}`, at)) + 2).trimStart();
      const ends = tail.slice(0, tail.indexOf('</span>'));
      expect(ends, 'the full stop is written beside the model word').toMatch(/'\.'/);
      expect(ends, 'and nothing else opens between the two').not.toMatch(/<[a-zA-Z]/);
    });
  }
});
