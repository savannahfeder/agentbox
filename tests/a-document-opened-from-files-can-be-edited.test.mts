// A DOCUMENT OPENED FROM FILES CAN BE EDITED (2026-10-31).
//
// The editor reached the big view from a thread but not from Files, the place a
// team keeps its documents: "Documents in Files have no Edit at all, only Open
// outside". Measured by reading which thread an edit goes to, and by reading
// that the Files view hands the editor a way to save. The place now comes from main (whereEditsGo), which knows where each
// version was said first: a group's own file is edited in the group.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { whereEditsGo } from '../main/files-place.mts';

const at = (ref, title = ref.kind) => ({ ref, title });
const mine = at({ kind: 'thread', product: 'lumen', id: 'w-1' });
const hers = at({ kind: 'shared', ownerId: 'p-2', threadId: 't-2', product: 'lumen' });
const chat = at({ kind: 'chat', product: 'lumen', id: 'c-1' });
const group = at({ kind: 'room', roomId: 'r-1' });
// One version, said first in the first place named.
const said = (...places) => [{ copies: places.map((thread, i) => ({ thread, at: i + 1 })) }];

describe('which thread an edit made in Files lands on', () => {
  it('goes to your own thread when the file is on one', () => {
    expect(whereEditsGo(said(hers, mine))).toBe(mine);
  });

  it('goes to a teammate\'s shared thread when that is the only thread', () => {
    expect(whereEditsGo(said(chat, hers))).toBe(hers);
  });

  it('goes to the group when a group is the only place that holds it, or the group made it', () => {
    expect(whereEditsGo(said(chat, group))).toBe(group);
    expect(whereEditsGo(said(group, hers))).toBe(group);
    expect(whereEditsGo(said(group, mine))).toBe(group);
  });

  it('goes to the thread that made a file a group only passed on', () => {
    expect(whereEditsGo(said(hers, group))).toBe(hers);
  });

  it('goes to the chat when only a chat holds it, and offers nothing for a file sent nowhere', () => {
    expect(whereEditsGo(said(chat))).toBe(chat);
    expect(whereEditsGo([])).toBeNull();
  });
});

describe('the Files view', () => {
  it('hands the big view a way to save that goes by the file, never by a path on this disk', () => {
    const src = readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
    expect(src).toContain('onNewVersion={');
    expect(src).toContain('api.filesPlaceEdit({ key: fileKey, text })');
    expect(src).not.toContain('api.fileNewVersion(');
  });

  it('softens the inbox header buttons beside the tiles', () => {
    const soft = readFileSync(new URL('../renderer/src/soft-corners.css', import.meta.url), 'utf8');
    for (const sel of ['.th-new', '.th-disp']) expect(soft).toContain(sel);
  });
});
