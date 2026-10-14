// A global failure summary is not a user chat and must not jump between project inboxes.
import {it,expect} from 'vitest';import fs from 'node:fs';
it('keeps global trouble diagnostics out of selectable chat rows',()=>{const source=fs.readFileSync('renderer/src/App.tsx','utf8');expect(source).not.toContain('return troubleRow(t, items);')});
