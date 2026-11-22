// A TEAMMATE'S FILE BESIDE THE CHAT NAMES NO FOLDER ID (2026-11-22).
//
// Opening a picture from a teammate's thread beside the chat, the pane's path
// line read "bbbbbbbb-1111-4222-8333-444444444444 › attachments ›
// 1-before-in-progress.png": the folder this computer keeps that thread's copy
// in is named by an id, and the line led with it. Measured on two copies on a
// stand-in team cloud, then by building the line from that path.
import { describe, it, expect } from 'vitest';
import { crumbParts } from '../renderer/src/doc-pane.ts';

const shelf = '/tmp/store/accounts/a/_team-threads/aaaaaaaa-1111-4222-8333-444444444444/bbbbbbbb-1111-4222-8333-444444444444';

describe("the path line over a teammate's file", () => {
  it('leaves out the id the thread\'s copy is kept under', () => {
    expect(crumbParts(`${shelf}/attachments/1-before-in-progress.png`, [shelf])).toEqual(['attachments', '1-before-in-progress.png']);
  });

  it('keeps a file whose own name is an id', () => {
    expect(crumbParts(`${shelf}/attachments/bbbbbbbb-1111-4222-8333-444444444444`, [shelf])).toEqual(['attachments', 'bbbbbbbb-1111-4222-8333-444444444444']);
  });

  it('keeps a folder that only looks a little like one', () => {
    expect(crumbParts('/x/agentbox/designs/deadbeef/card.png', ['/x/agentbox'])).toEqual(['agentbox', 'designs', 'deadbeef', 'card.png']);
  });
});
