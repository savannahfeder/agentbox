// A CLICK AWAY NEVER CUTS OFF A VOICE NOTE.
//
// Recording a voice note in a chat, then clicking anywhere outside the box
// (the conversation, the empty part of the window, a full-screen document)
// folded the box. Folding it unmounts the recorder, which stops the note
// mid-sentence: the person has to start the message again. The click-away
// folds in App.tsx never asked whether a note was recording; the dock's own
// fold in Focus.tsx did, through its draft check.
//
// Measured with the stand-in microphone: the window-wide "a note is recording"
// fact is on from the mic press (waiting for the microphone counts) until the
// tick, the cross, a refusal, the box going, or a slip too short to keep, and
// stays on while any one of two boxes records. Both folds in App.tsx are
// pinned to ask it before folding, and to still fold when nothing records.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fakeMicrophone } from './helpers/fake-microphone.mjs';
import { aNoteIsRecording } from '../renderer/src/team/voice-recording.ts';

const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('a note counts as recording from the mic press to its end', () => {
  it('is off before anything is pressed', () => {
    const m = fakeMicrophone();
    m.box();
    expect(aNoteIsRecording(m.env.busy)).toBe(false);
  });

  it('is on while waiting for the microphone, and while recording', async () => {
    const m = fakeMicrophone({ holdAsk: true });
    const b = m.box();
    const started = b.r.start();
    expect(aNoteIsRecording(m.env.busy)).toBe(true);
    m.ask();
    await started;
    m.pass(2000);
    expect(aNoteIsRecording(m.env.busy)).toBe(true);
  });

  it('is off once the tick ends it', async () => {
    const m = fakeMicrophone();
    const b = m.box();
    await b.r.start();
    m.pass(2000);
    b.r.stop();
    await m.settle();
    expect(b.notes).toHaveLength(1);
    expect(aNoteIsRecording(m.env.busy)).toBe(false);
  });

  it('is off once the cross throws it away, or stops the wait for the microphone', async () => {
    const m = fakeMicrophone();
    const b = m.box();
    await b.r.start();
    m.pass(2000);
    b.r.cancel();
    await m.settle();
    expect(aNoteIsRecording(m.env.busy)).toBe(false);

    const w = fakeMicrophone({ holdAsk: true });
    const waiting = w.box();
    void waiting.r.start();
    waiting.r.cancel();
    expect(aNoteIsRecording(w.env.busy)).toBe(false);
  });

  it('is off when the microphone is refused or will not open', async () => {
    const refused = fakeMicrophone({ access: 'settings' });
    await refused.box().r.start();
    expect(aNoteIsRecording(refused.env.busy)).toBe(false);

    const broken = fakeMicrophone({ openFails: 'NotReadableError' });
    await broken.box().r.start();
    expect(aNoteIsRecording(broken.env.busy)).toBe(false);
  });

  it('is off when a slip is too short to keep', async () => {
    const m = fakeMicrophone();
    const b = m.box();
    await b.r.start();
    m.pass(100);
    b.r.stop();
    await m.settle();
    expect(b.notes).toHaveLength(0);
    expect(aNoteIsRecording(m.env.busy)).toBe(false);
  });

  it('is off once the box goes, whether it was recording or still waiting', async () => {
    const m = fakeMicrophone();
    const b = m.box();
    await b.r.start();
    m.pass(2000);
    b.r.dispose();
    expect(aNoteIsRecording(m.env.busy)).toBe(false);

    const w = fakeMicrophone({ holdAsk: true });
    const waiting = w.box();
    void waiting.r.start();
    waiting.r.dispose();
    expect(aNoteIsRecording(w.env.busy)).toBe(false);
  });

  it('stays on while the box recording is not the one that went', async () => {
    const m = fakeMicrophone();
    const recording = m.box('direct:p:w-1');
    const other = m.box('room:r:');
    await recording.r.start();
    m.pass(2000);
    other.r.dispose();
    expect(aNoteIsRecording(m.env.busy)).toBe(true);
  });
});

// The fold's handler, from where it starts to where its effect closes.
const handler = (opening, closing) => {
  const from = app.indexOf(opening);
  expect(from).toBeGreaterThan(-1);
  return app.slice(from, app.indexOf(closing, from) + closing.length);
};

describe('the folds in App.tsx ask first', () => {
  it('clicking nothing does not fold the box while a note records, and still folds it otherwise', () => {
    const away = handler("if (modal !== 'reply') return;\n    const away", '}, [modal]);');
    const asks = away.indexOf('if (aVoiceNoteIsRecording()) return;');
    expect(asks).toBeGreaterThan(-1);
    expect(away.indexOf('setModal(null);')).toBeGreaterThan(asks);
  });

  it('a click away from the box over a full-screen document does not fold it while a note records', () => {
    const fold = handler("if (!fullScreenDoc || modal !== 'reply') return;", '}, [fullScreenDoc, modal]);');
    expect(fold).toMatch(/const foldBack = \(\) => \{ if \(!aVoiceNoteIsRecording\(\)\) setModal\(null\); \};/);
    expect(fold).not.toMatch(/foldBack = \(\) => setModal\(null\)/);
  });

  it('the window-wide fact App.tsx asks is the recorder shared by every box', () => {
    expect(app).toMatch(/import \{[^}]*\baVoiceNoteIsRecording\b[^}]*\} from '\.\/team\/useVoiceRecorder';/);
    const hook = readFileSync(new URL('../renderer/src/team/useVoiceRecorder.ts', import.meta.url), 'utf8');
    expect(hook).toContain('export const aVoiceNoteIsRecording = () => aNoteIsRecording(busy);');
  });
});
