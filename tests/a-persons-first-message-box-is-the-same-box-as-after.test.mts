// A PERSON'S FIRST MESSAGE BOX IS THE SAME BOX AS AFTER.
//
// Two testers on a person's page in Team: before the first message the box was
// a bare textarea with a grey Send; once a message went, the chat's own reply
// box took its place, with its own border, its tool row and "Send Enter".
// "Same box, two looks." The first box is now drawn in the same shell, in the
// same place, with the same Send.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SendBox } from '../renderer/src/team/everything/PlacePage.tsx';
import { sendKeyFor } from '../renderer/src/reply-keys.ts';
globalThis.React = React;

const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/team/everything/everything.css'), 'utf8');
const html = renderToStaticMarkup(h(SendBox, { placeholder: 'Message Dev', onSend: async () => null }));

describe('the first message box on a person’s page', () => {
  it('is drawn in the reply box’s own shell', () => {
    expect(html).toMatch(/<div class="rm-compose tq-compose pl-first">/);
    expect(html).toMatch(/<div class="rm-compose-bar">/);
  });
  it('sends with the same button, naming its key', () => {
    expect(html).toMatch(new RegExp(`<button type="button" class="dock-send"[^>]*>Send <kbd>${sendKeyFor(true)}</kbd></button>`));
    expect(html).not.toContain('pl-btn go');
  });
  it('sits where the reply box sits once the chat has begun', () => {
    expect(css).toMatch(/\.pl-send \.rm-compose\.tq-compose \{ margin: 8px 0 0; \}/);
  });
});
