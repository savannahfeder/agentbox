// A HOME IN PROGRESS ROW OPENS ITS THREAD (F-215, QA session 43).
//
// With one task working, clicks on its row in Home's In progress card did
// nothing. Home's row handler looked the key up in the Needs you list only,
// and a running thread is never in it, so it returned before opening anything.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { homeRowOpens } from '../renderer/src/home/home-model.ts';

const keyOf = (i: { product: string; id: string }) => `${i.product}/${i.id}`;
const running = { product: 'p', id: 'w-run' };
const waiting = { key: 'p/w-wait' };

describe('what a Home row opens', () => {
  it('opens a running thread from the In progress card', () => {
    expect(homeRowOpens('p/w-run', [waiting], [running], keyOf)).toEqual({ item: running });
  });

  it('still opens a Needs you row through its entry', () => {
    expect(homeRowOpens('p/w-wait', [waiting], [running], keyOf)).toEqual({ entry: waiting });
  });

  it('prefers the Needs you entry when a thread is in both', () => {
    expect(homeRowOpens('p/w-run', [{ key: 'p/w-run' }], [running], keyOf)).toEqual({ entry: { key: 'p/w-run' } });
  });

  it('opens nothing for a key on neither list', () => {
    expect(homeRowOpens('p/w-gone', [waiting], [running], keyOf)).toBeNull();
    expect(homeRowOpens('q/w-run', [waiting], [running], keyOf)).toBeNull();
  });

  it('is what Home\'s row handler uses, over the In progress list', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    const openRow = app.slice(app.indexOf('const homeOpenRow'), app.indexOf('const skyOnInbox'));
    expect(openRow).toContain('homeRowOpens(key, needsList, progressTab, keyOf)');
  });
});
