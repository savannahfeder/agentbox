// The voice alpha said "I need the microphone. Allow it in System Settings"
// and gave no way to (2026-10-16); voice notes ask the same way now. Measured on her Mac: Agentbox runs from Terminal, so
// macOS asks on Terminal's behalf, and Terminal's microphone had been refused
// on 2026-10-05. After a refusal macOS never shows its Allow box again, so
// asking returned no at once. One press now clears that one
// refusal (tccutil, for that one app and the microphone only) and asks again,
// which brings back the Allow box; if that still fails it opens the exact
// Settings page. Nothing is reset without the press.
import { describe, expect, it, vi } from 'vitest';
import { micOwner, getMic, SETTINGS_URL } from '../main/mic.mjs';

function prefs(status, answer) {
  return { getMediaAccessStatus: vi.fn(() => status), askForMediaAccess: vi.fn(async () => answer) };
}
const runOk = () => vi.fn((cmd, args, opts, cb) => cb(null, '', ''));

describe('which app macOS asks about', () => {
  it('is the app that opened Agentbox, by its name', () => {
    expect(micOwner({ __CFBundleIdentifier: 'com.apple.Terminal' })).toEqual({ id: 'com.apple.Terminal', name: 'Terminal' });
    expect(micOwner({ __CFBundleIdentifier: 'com.googlecode.iterm2' }).name).toBe('iTerm');
    expect(micOwner({ __CFBundleIdentifier: 'com.microsoft.VSCode' }).name).toBe('VS Code');
  });

  it('is unknown when nothing says, and is never made up', () => {
    expect(micOwner({})).toEqual({ id: null, name: null });
    expect(micOwner({ __CFBundleIdentifier: 'not a bundle id; rm -rf /' })).toEqual({ id: null, name: null });
  });
});

describe('the one press', () => {
  it('clears the old refusal for that app and asks again, which shows the Allow box', async () => {
    const sp = prefs('denied', true);
    const run = runOk();
    const openExternal = vi.fn();
    expect(await getMic({ systemPreferences: sp, run, openExternal, owner: { id: 'com.apple.Terminal', name: 'Terminal' } })).toBe('granted');
    expect(run).toHaveBeenCalledWith('tccutil', ['reset', 'Microphone', 'com.apple.Terminal'], expect.any(Object), expect.any(Function));
    expect(sp.askForMediaAccess).toHaveBeenCalledWith('microphone');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('only asks when nothing was refused yet, and resets nothing', async () => {
    const sp = prefs('not-determined', true);
    const run = runOk();
    expect(await getMic({ systemPreferences: sp, run, openExternal: vi.fn(), owner: { id: 'com.apple.Terminal', name: 'Terminal' } })).toBe('granted');
    expect(run).not.toHaveBeenCalled();
  });

  it('does nothing at all when the microphone is already allowed', async () => {
    const sp = prefs('granted', true);
    const run = runOk();
    expect(await getMic({ systemPreferences: sp, run, openExternal: vi.fn(), owner: { id: 'com.apple.Terminal', name: 'Terminal' } })).toBe('granted');
    expect(run).not.toHaveBeenCalled();
    expect(sp.askForMediaAccess).not.toHaveBeenCalled();
  });

  it('opens the microphone page in Settings when the Allow box is refused again', async () => {
    const openExternal = vi.fn();
    expect(await getMic({ systemPreferences: prefs('denied', false), run: runOk(), openExternal, owner: { id: 'com.apple.Terminal', name: 'Terminal' } })).toBe('settings');
    expect(openExternal).toHaveBeenCalledWith(SETTINGS_URL);
    expect(SETTINGS_URL).toMatch(/Privacy_Microphone/);
  });

  it('resets nothing when it does not know which app to reset, and opens Settings instead', async () => {
    const run = runOk();
    const openExternal = vi.fn();
    expect(await getMic({ systemPreferences: prefs('denied', false), run, openExternal, owner: { id: null, name: null } })).toBe('settings');
    expect(run).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalled();
  });

  it('still asks when the reset itself fails', async () => {
    const run = vi.fn((cmd, args, opts, cb) => cb(new Error('exit 64'), '', ''));
    const sp = prefs('denied', true);
    expect(await getMic({ systemPreferences: sp, run, openExternal: vi.fn(), owner: { id: 'com.apple.Terminal', name: 'Terminal' } })).toBe('granted');
  });
});
