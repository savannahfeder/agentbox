// NEEDS YOU OPENS ON ITS THREADS, NOT ON A BOX OF ASKS (w-78be9e67e8).
//
// A box headed "Waiting on you before they can go on" sat above the Needs you
// list, one big row per key, sign-in, file or code a cloud thread asked for.
// It was never approved, and the threads it named were already in the list
// below it saying "Needs a key". Measured on the built renderer with two
// threads waiting on keys: the box took the top 200px of the list and cut one
// title mid-quote. The ask itself stays on the thread's own card.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NEED, needsLeft, needsWord } from '../shared/cloud-needs.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

describe('the top of Needs you', () => {
  it('draws no box of asks above the list', () => {
    expect(read('renderer/src/components/List.tsx')).not.toMatch(/NeedsWaiting/);
    expect(fs.existsSync(path.join(root, 'renderer/src/threads/NeedsWaiting.tsx'))).toBe(false);
    expect(read('renderer/src/components/need-card.css')).not.toMatch(/\.nw[-\s{]/);
  });

  it('still names the ask on the thread\'s own row', () => {
    const row = { id: 'w-1', status: 'open', result: `**I need a key.**\n\n${NEED} key ELEVENLABS_API_KEY | the ElevenLabs API key`, wrote: { result: { ts: 1 } } };
    expect(needsWord(needsLeft(row, []))).toBe('Needs a key');
    expect(needsWord(needsLeft(row, ['ELEVENLABS_API_KEY']))).toBe(null);
  });

  it('leaves a thread that asked for nothing as it was', () => {
    expect(needsWord(needsLeft({ id: 'w-2', status: 'open', result: 'Done.' }, []))).toBe(null);
  });
});
