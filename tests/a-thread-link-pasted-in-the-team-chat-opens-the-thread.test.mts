// A THREAD LINK PASTED IN THE TEAM CHAT OPENS THE THREAD (w-d19fcb9309).
//
// Fourth synthetic team run, 2026-11-09, then checked by hand on two copies:
// Lena pasted Maya's thread link into their chat and clicked it six times.
// Nothing happened. The chat draws its own links as plain new-tab anchors, so
// only the thread page's links knew a thread link; in the browser copy the tab
// opened nowhere, and in the app it would have opened the web page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadToOpen } from '../renderer/src/threads/share-rules.ts';
import { ChatLink } from '../renderer/src/threads/ContinuedFrom.tsx';
globalThis.React = React;

const LINK = 'https://app.agentbox.ac/t/p-maya/w-ee408ac4e8';
const plain = { metaKey: false, ctrlKey: false, shiftKey: false };

describe('a click on a link in the chat', () => {
  it('opens the thread a thread link names', () => {
    expect(threadToOpen(LINK, plain)).toEqual({ owner: 'p-maya', id: 'w-ee408ac4e8' });
  });
  it('leaves a ⌘, Ctrl or Shift click to the browser, as any link', () => {
    expect(threadToOpen(LINK, { ...plain, metaKey: true })).toBeNull();
    expect(threadToOpen(LINK, { ...plain, ctrlKey: true })).toBeNull();
    expect(threadToOpen(LINK, { ...plain, shiftKey: true })).toBeNull();
  });
  it('leaves every other address alone', () => {
    expect(threadToOpen('https://example.com/t/p-maya/w-1', plain)).toBeNull();
    expect(threadToOpen('https://app.agentbox.ac/f/abc', plain)).toBeNull();
    expect(threadToOpen(undefined, plain)).toBeNull();
  });
});

describe('the chat', () => {
  it('draws the link as a link, with its words', () => {
    const html = renderToStaticMarkup(React.createElement(ChatLink, { href: LINK }, LINK));
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain('target="_blank"');
  });
  it('draws its links with ChatLink', () => {
    const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
    expect(chat).toContain('return <ChatLink href={href}>{children}</ChatLink>;');
    expect(chat).not.toContain('return <a href={href} target="_blank" rel="noreferrer">{children}</a>;');
  });
});
