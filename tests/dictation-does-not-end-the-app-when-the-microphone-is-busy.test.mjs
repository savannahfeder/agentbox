// DICTATION DOES NOT END THE APP WHEN THE MICROPHONE IS BUSY.
//
// `AVAudioInputNode.installTap` does not return an error when the input format
// is 0 Hz, which is what a call, Siri, CarPlay or another recording app
// holding the microphone leaves behind: it raises an Objective-C exception,
// which no Swift `catch` can take, and the app is killed where it stands with
// SIGABRT. The newer-model dictation (2026-10-24) installed its tap with
// `node.outputFormat(forBus: 0)` passed straight in and nothing looked at it;
// expo-speech-recognition, which this app also ships, guards the same call
// (ExpoSpeechRecognizer.swift, `audioInputIsBusy`). Measured by reading both.
//
// The same block then reached JavaScript from Core Audio's own thread, and
// touched a shared Date without the lock beside it. Neither is allowed from
// there, and a debug build survives both.
//
// Swift has no test runner here, so this reads the file. It can only say the
// guards are in place, not that a phone with a busy microphone recovers.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const swift = readFileSync(new URL('../mobile/modules/apple-dictation/ios/AppleDictationModule.swift', import.meta.url), 'utf8');

describe('the newer dictation model, opening the microphone', () => {
  it('reads the hardware format once, into a name', () => {
    expect(swift).toMatch(/let live = node\.outputFormat\(forBus: 0\)/);
  });

  it('refuses a format of no sample rate or no channels before installing the tap', () => {
    const guard = swift.indexOf('live.sampleRate > 0');
    const tap = swift.indexOf('node.installTap');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(tap);
    expect(swift).toMatch(/throw DictationError\.microphoneBusy/);
    expect(swift).toMatch(/case \.microphoneBusy: return "\w/);
  });

  it('never hands installTap a format nobody looked at', () => {
    expect(swift).not.toMatch(/installTap\([^)]*node\.outputFormat/);
  });

  it('hands the audio session back on the one way out that never took it', () => {
    const guardBody = swift.slice(swift.indexOf('live.sampleRate > 0'), swift.indexOf('node.removeTap'));
    expect(guardBody).toMatch(/setActive\(false/);
  });
});

describe('what the audio thread is allowed to do', () => {
  it('reaches JavaScript only through the main thread', () => {
    expect(swift).toMatch(/DispatchQueue\.main\.async \{ self\?\.sendEvent\(name, body\) \}/);
  });

  it('takes the lock around the level clock it shares', () => {
    const level = swift.slice(swift.indexOf('private func level('));
    const lock = level.indexOf('lock.lock()');
    const wrote = level.indexOf('lastLevel = now');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(wrote);
    expect(level.indexOf('lock.unlock()')).toBeGreaterThan(wrote);
  });
});
