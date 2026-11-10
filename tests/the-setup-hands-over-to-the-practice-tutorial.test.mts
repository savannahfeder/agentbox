// THE SETUP HANDS OVER TO THE PRACTICE TUTORIAL (w-fbe5e95dea, 2026-11-10).
//
// The walkthrough the setup used to end in ran on the person's own threads:
// the founder pressed 1 on "AgentBox crash fix ready to release", a real
// thread brought in from her computer, and it sent that answer to a real
// agent. Its list of steps beside the app pulled her eye one way while the tip
// in the app pulled it another ("I have no idea what to do"), and writing back
// took her to Home with nothing left to mark done. The practice tutorial runs
// in the whole window, one tip beside the glow, on threads labelled Practice
// that nothing real is behind, and it teaches the inbox.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const fn = app.slice(app.indexOf('const finishFresh = useCallback'), app.indexOf('\n  }, [', app.indexOf('const finishFresh = useCallback')));

describe('the end of the setup', () => {
  it('starts the practice tutorial, not the walkthrough on real threads', () => {
    expect(fn).toMatch(/startTutorial\(null\);/);
    expect(fn).not.toMatch(/setTour\(startTour\(\)\)/);
  });
  it('leaves Home shut, so the tutorial opens on its own inbox', () => {
    expect(fn).not.toMatch(/setHomeOpen\(homeOn\)/);
  });
});
