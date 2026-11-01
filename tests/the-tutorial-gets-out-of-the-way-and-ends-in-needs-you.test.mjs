// THE TUTORIAL GETS OUT OF THE WAY AND ENDS IN NEEDS YOU (w-31c71743b5, 2026-10-30).
//
// The founder, testing a fresh window: "Skip tutorial" made a glow that blocks
// nothing read as "is this blocking me?"; the tip after turning notifications
// on still sat there instead of sending you off; the walk ended on In progress
// reading "Nothing is running."; the setup never offered her chats, because 3
// of the 4 it found ran in her home folder and the other had no answer; and "Draft a
// short post announcing what I am building", in a workspace that knows nothing
// about you, wrote about whatever folder her own Claude settings allowed.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const { chatChoices, projectsToMake, ideasFor, inHomeFolder } = await import('../renderer/src/first-run.ts');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HOME = '/Users/someone';

describe('the card', () => {
  const tour = read('renderer/src/components/Tour.tsx');
  it('has no skip on it, and Escape does not end the tutorial', () => {
    expect(tour).not.toContain('Skip tutorial');
    expect(tour).not.toContain('skipTour');
  });
  it('sends you off once notifications are on', () => {
    expect(tour).toContain('You’ll get a notification when it’s done. Explore the app while you wait');
  });
  // The status line changes length as the agent works and there is nothing on it to press.
  it('and lights nothing while the agent works', () => {
    expect(tour).toContain("{step !== 'palette' && step !== 'busy' && step !== 'gettingReady' && step !== 'inPalette' && step !== 'startHere' && <div key={`glow-${step}`}");
  });
  it('and stops asking you to watch the agent once it has said so', () => {
    expect(tour).toContain("const wanted = rawStep === 'working' && tried ? null : rawStep;");
  });
});

describe('the way to end it', () => {
  it('is in the command bar, only while it is running', () => {
    expect(read('renderer/src/components/Palette.tsx')).toContain("...(onEndTutorial ? [{ id: 'end-tutorial', label: 'End the tutorial', keywords: 'skip stop hide tips', run: onEndTutorial }] : [])");
    expect(read('renderer/src/App.tsx')).toContain('onEndTutorial={tourLive(tour) ? () => { setTour(skipTour(tour!)); setModal(null); } : undefined}');
  });
});

describe('where it ends', () => {
  it('moves to Needs you when the first thread is closed', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("if (closed && !wasClosed.current && view === 'progress') setView('inbox');");
  });
});

describe('the chats it offers', () => {
  const chat = (over) => ({ id: 'a', folder: '/Users/someone/code/app', short: '~/code/app', when: 1, lastSaid: 'Done.', ...over });
  it('a chat in the home folder is offered', () => {
    expect(chatChoices([chat({ folder: HOME, short: '~' })], { home: HOME })).toHaveLength(1);
    expect(inHomeFolder(HOME)).toBe(true);
    expect(inHomeFolder('/Users/other/')).toBe(true);
  });
  it('but makes no project: it goes to My Workspace', () => {
    expect(projectsToMake([chat({ folder: HOME, short: '~' })], [])).toEqual([]);
    expect(read('renderer/src/components/FirstRun.tsx')).toContain('if (inHomeFolder(folder)) return workspace;');
  });
  it('a chat in a real folder under it is still its own project', () => {
    expect(inHomeFolder('/Users/someone/code/app')).toBe(false);
    expect(projectsToMake([chat({})], [])).toEqual([{ folder: '/Users/someone/code/app', name: expect.any(String) }]);
  });
  it('the root and a chat the agent never answered are still left out', () => {
    expect(chatChoices([chat({ folder: '/', short: '/' })], { home: HOME })).toEqual([]);
    expect(chatChoices([chat({ lastSaid: '' })], { home: HOME })).toEqual([]);
  });
});

describe('what My Workspace suggests', () => {
  it('needs nothing it cannot know about you', () => {
    const words = ideasFor({ folder: false }).map((i) => i.text).join('\n');
    expect(words).not.toMatch(/what I am building|competitors/i);
    expect(ideasFor({ folder: false })).toHaveLength(4);
  });
});
