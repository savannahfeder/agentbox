// SETUP FILES A CHAT INTO THE PROJECT ITS FOLDER ALREADY HAS.
//
// Setup's last screen (w-62228098e6) was handed only the project the walk had
// just made. Run setup again from ⌘K ("Set Agentbox up again") over a store
// that already has Kestrel and Lantern, and every chat in their folders was a
// folder with no project: pressing "Bring in 8" asked the store to make
// Kestrel and Lantern again, the store refused ("product kestrel already
// exists"), and their chats were dropped without a word. Only the two chats
// in a folder with no project came in. Measured in the power test's scripted
// pass, on a copy with 16 chats across three folders. A folder whose name
// differs from its project's would have been made into a second project of
// the same folder instead.
//
// So the card is handed every project, and a chat lands in the one its folder
// already has. (The old walk's own project list went with it, 2026-11-21.)

import { describe, it, expect } from 'vitest';
import { destinations } from '../renderer/src/agent-import-card';

const kestrel = { slug: 'kestrel', name: 'Kestrel', repoPath: '/h/dev/kestrel' };
const payments = { slug: 'payments-api', name: 'Payments API', repoPath: '/h/dev/payments' };
const chat = (id, folder) => ({ id, source: 'terminal', folder, folderName: folder.split('/').pop(), short: folder, title: id, when: Date.now(), path: `/x/${id}.jsonl` });

describe('a chat in a folder a project already points at', () => {
  const sections = (threads) => destinations({ found: null, folders: [], products: [kestrel, payments], project: 'house', threads });

  it('lands in that project, not a new one', () => {
    const d = sections([chat('a', '/h/dev/kestrel')]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ slug: 'kestrel' });
    expect(d[0].kind).not.toBe('new');
  });

  it('lands there even when the folder is named differently from the project', () => {
    const d = sections([chat('b', '/h/dev/payments')]);
    expect(d[0]).toMatchObject({ slug: 'payments-api' });
  });

  it('still makes a project for a folder nobody points at', () => {
    const d = sections([chat('c', '/h/dev/scratchpad')]);
    expect(d[0]).toMatchObject({ kind: 'new', slug: null, folder: '/h/dev/scratchpad' });
  });
});
