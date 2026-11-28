// A TEAMMATE'S FILE HANDED TO AN AGENT CARRIES THAT FILE (2026-11-23).
//
// A review of 1e7dc52bb: Hand to an agent from one file of a teammate's thread
// carried only the newest copy of that file among the files the brief
// gathered, and when the brief did not hold it (the brief gathers only the
// attachments of its last messages), it fell back to all of them: the agent
// got every file but the one the comments were on. Measured by asking which
// files the card carries for a file the brief does not hold.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { carriedForFile } from '../renderer/src/threads/continue-thread';

const brief = [
  { name: 'checkout.html', srcPath: '/copy/attachments/aaaaaaaaaaaa-checkout.html', image: false },
  { name: 'first-visit.png', srcPath: '/copy/attachments/bbbbbbbbbbbb-first-visit.png', image: true },
  { name: 'first-visit-v2.png', srcPath: '/copy/attachments/cccccccccccc-first-visit-v2.png', image: true },
];

describe('the card a file of a teammate\'s thread opens', () => {
  it('carries the newest copy of that file the brief holds, and no other', () => {
    expect(carriedForFile(brief, ['/copy/attachments/cccccccccccc-first-visit-v2.png'])).toEqual([brief[2]]);
  });

  it('carries the file itself when the brief does not hold it', () => {
    expect(carriedForFile(brief, ['/copy/designs/w-1/bookings.png'])).toEqual([{ name: 'bookings.png', srcPath: '/copy/designs/w-1/bookings.png', image: true }]);
  });

  it('carries none of the others when the file is not found here', () => {
    expect(carriedForFile(brief, ['bookings.png'])).toEqual([]);
  });

  it('carries everything the brief holds when no one file was asked for', () => {
    expect(carriedForFile(brief, undefined)).toEqual(brief);
    expect(carriedForFile(brief, [])).toEqual(brief);
  });

  it('is what the card is opened with, from the file found where its view opens it', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    expect(app).toContain('attachments: carriedForFile(start.attachments, files)');
    expect(page).toMatch(/api\.resolveDoc\(\{ product, src: f \}\)/);
  });
});
