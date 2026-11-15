// A TABLE NAMED IN A MESSAGE REACHES TEAMMATES.
//
// Found by the team test on w-1fc102959f (2026-11-09): three synthetic
// engineers, and the backend one works in tables (an agent's list of endpoints
// that skip auth, saved as .csv) and sends them to teammates. Messages, groups,
// rooms and shared-project lines carry the files they name through
// shared/carried-files.mts, and that list had no .csv, .tsv or deck, while a
// shared thread (main/team/thread-share.mjs) carried all three. So the table
// opened from a teammate's thread and was dead text in a message about it. The
// app tells agents a list belongs in a .csv, so tables are among the files
// agents make most.
//
// Pinned: .csv, .tsv and a deck are carried, written any of the ways a message
// names a file, and a script or a key file still is not.
import { describe, it, expect } from 'vitest';
import { isCarriedKind, filesNamedInWords } from '../shared/carried-files.mts';

describe('the files a shared project carries', () => {
  it('include tables and decks, as shared threads do', () => {
    for (const f of ['endpoints.csv', 'rows.tsv', 'launch.pptx', 'old.ppt', 'ENDPOINTS.CSV']) expect(isCarriedKind(f), f).toBe(true);
  });

  it('finds a table however the message names it', () => {
    const said = 'The list is in /Users/x/docs/designs/w-1/endpoints-v2.csv, see also `rows.tsv` and [the deck](reports/launch.pptx).';
    expect(filesNamedInWords(said)).toEqual(['/Users/x/docs/designs/w-1/endpoints-v2.csv', 'rows.tsv', 'reports/launch.pptx']);
  });

  it('still leaves scripts, keys and config behind', () => {
    for (const f of ['deploy.sh', 'id_rsa', 'server.key', '.env', 'config.json', 'notes.txt', 'data.csv.sh']) expect(isCarriedKind(f), f).toBe(false);
  });
});
