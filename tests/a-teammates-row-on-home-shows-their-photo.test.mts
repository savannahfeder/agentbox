// A row a teammate sent showed a letter on Home's Needs you, while the same
// teammate's photo showed in Home's team card, the inbox row and the Team page
// beside it (seen on the demo copy, 2026-11-21, once its teammates had photos).

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HomePage, type NeedsRow } from '../renderer/src/home/HomePage.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTO = 'data:image/jpeg;base64,/9j/AAAA';
const row = (extra: Partial<NeedsRow>): NeedsRow => ({ key: 'k', letter: 'L', title: 'Launch email', from: 'Lena', priority: null, project: '', at: null, unread: false, ...extra });
const draw = (needs: NeedsRow[]) => renderToStaticMarkup(React.createElement(HomePage, {
  hello: 'Good morning', now: Date.now(), needs, needsCount: needs.length, progressCount: 0, team: null, progress: [],
  slot: () => {}, onDoor: () => {}, onOpen: () => {}, onMember: () => {}, onTeam: () => {},
}));

describe('a Needs you row on Home', () => {
  it('shows the sender\'s photo when they have one', () => {
    const html = draw([row({ photo: PHOTO })]);
    expect(html).toContain(`src="${PHOTO}"`);
    expect(html).not.toMatch(/class="hm-face">L</);
  });

  it('keeps the letter when they have none', () => {
    expect(draw([row({})])).toMatch(/class="hm-face">L</);
  });

  it('is handed the photo of the person who sent it, never for their agent', () => {
    const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
    expect(app).toContain('const photo = sent && !sent.agent ? team?.byId.get(sent.from)?.avatarUrl : null;');
  });
});
