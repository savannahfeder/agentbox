// A PICTURE THE PHONE HAS DRAWN BEFORE COMES FROM ITS OWN CACHE.
//
// "On mobile images take far too long to load. I lose at least half a second
// each time I open a thread" (2026-10-30). The app keeps no links between
// launches, so every launch signs each file again, and a signed link carries a
// new token each time. React Native's Image cached by the whole link, so every
// launch fetched every picture again in full. A file online is named by what
// is in it, so its path alone names it for good: the cache is keyed by that.
import { describe, it, expect } from 'vitest';
import { pictureSource } from '../mobile/src/lib/files';

const base = 'https://abc.supabase.co/storage/v1/object/sign/phone-files/u1/mac1';

describe('pictureSource', () => {
  it('keys a signed link by its file, so a re-signed link finds the same picture', () => {
    const a = pictureSource(`${base}/9f2c.png?token=one`);
    const b = pictureSource(`${base}/9f2c.png?token=two`);
    expect(a.uri).toBe(`${base}/9f2c.png?token=one`);
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it('keeps two files apart', () => {
    expect(pictureSource(`${base}/9f2c.png?token=one`).cacheKey).not.toBe(pictureSource(`${base}/77aa.png?token=one`).cacheKey);
  });

  it('leaves a link that is not one of your files keyed by the whole link', () => {
    expect(pictureSource('https://example.com/a.png?v=2')).toEqual({ uri: 'https://example.com/a.png?v=2' });
    expect(pictureSource('data:image/png;base64,AAAA')).toEqual({ uri: 'data:image/png;base64,AAAA' });
  });
});
