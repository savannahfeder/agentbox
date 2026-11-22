// THE "ADD YOUR RECENT AGENTS" STEP NEVER HOLDS THE SETUP.
//
// A tester's first setup on a Mac froze on this step (2026-11-16): its button
// waited on the import with no limit of its own, with Skip and Back greyed
// out. It was given a 15-second limit. Then on 2026-11-21 a new user with a
// very large chat history reached the sign-in step with the import still
// running and the app not answering (tests/bringing-in-a-heavy-chat-history-
// never-holds-the-app). Now Add starts the import and moves on at once, and
// the count is filled in when the import lands. Checked below against an
// import that never answers, one that throws, and one that answers.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { bringInBehind } from '../renderer/src/setup-split';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Add to your inbox', () => {
  it('returns before an import that never answers', async () => {
    const heard: number[] = [];
    const out = bringInBehind(() => new Promise<number>(() => {}), (n) => heard.push(n));
    expect(out).toBeUndefined();
    await settle();
    expect(heard).toEqual([]);
  });

  it('hears the count when the import lands', async () => {
    const heard: number[] = [];
    let land: (n: number) => void = () => {};
    bringInBehind(() => new Promise<number>((r) => { land = r; }), (n) => heard.push(n));
    await settle();
    land(3);
    await settle();
    expect(heard).toEqual([3]);
  });

  it('hears nothing came in from an import that throws, whether at once or later', async () => {
    const heard: number[] = [];
    bringInBehind(() => { throw new Error('no'); }, (n) => heard.push(n));
    bringInBehind(async () => { throw new Error('no'); }, (n) => heard.push(n));
    await settle(); await settle();
    expect(heard).toEqual([0, 0]);
  });
});

describe('the step and the first run use it', () => {
  it('the step starts the import and moves on without waiting', () => {
    const src = fs.readFileSync('renderer/src/components/SetupSplit.tsx', 'utf8');
    const bring = src.slice(src.indexOf('const bring = useCallback'), src.indexOf('const [browsing'));
    expect(bring).toMatch(/bringInBehind\(p\.bringIn,/);
    expect(bring).not.toMatch(/await/);
    expect(bring).toMatch(/\n\s*next\(\);\n\s*\}, \[/);
  });

  it("the first run's own busy flag is cleared even when a press throws", () => {
    const src = fs.readFileSync('renderer/src/components/FirstRun.tsx', 'utf8');
    const bringIn = src.slice(src.indexOf('const bringIn = useCallback'), src.indexOf('// THE KEYBOARD'));
    expect(bringIn).toMatch(/finally \{ setBusy\(false\); \}/);
  });
});
