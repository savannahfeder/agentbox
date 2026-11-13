// TURNING ON NOTIFICATIONS SAYS WHAT HAPPENED (w-fbe5e95dea, 2026-11-10).
//
// The founder pressed "Turn on notifications" in the walkthrough and nothing
// happened. The sample banner was sent, but a Mac that has not allowed
// Agentbox drops it without a word, and the app cannot ask the Mac whether it
// did. So the tip now says a banner was sent and, on a Mac, offers to open the
// system's notification settings in case it did not appear.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { REQUEST_CHANNELS as CHANNELS } from '../shared/bridge-map.mts';
import { NOTIFY_SETTINGS_URL } from '../main/notify.mts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('after Turn on notifications', () => {
  const tour = read('renderer/src/components/Tour.tsx');
  it('says a banner was sent and where to allow it', () => {
    expect(tour).toContain('We sent a test notification. Explore the app while you wait');
  });
  it('offers the system settings on a Mac', () => {
    expect(tour).toMatch(/step === 'busy' && tried && MAC && <button type="button" className="tour-act" onClick=\{openNotifySettings\}>Didn’t see it\? Open settings<\/button>/);
  });
});

describe('the settings channel', () => {
  it('opens the Mac notification settings', () => {
    expect(NOTIFY_SETTINGS_URL).toBe('x-apple.systempreferences:com.apple.Notifications-Settings.extension');
    expect(CHANNELS.notifySettings).toBe('zero:notify-settings');
    expect(read('preload.cjs')).toContain("notifySettings: () => ipcRenderer.invoke('zero:notify-settings'),");
    expect(read('main/serve.mts')).toContain("ipcMain.handle('zero:notify-settings', () => null);");
    expect(read('main/notify.mts')).toMatch(/ipcMain\.handle\('zero:notify-settings', \(\) => \{ void openExternal\(NOTIFY_SETTINGS_URL\); return null; \}\)/);
    expect(read('main/main.mts')).toMatch(/openExternal: \(url: string\) => shell\.openExternal\(url\)/);
  });
});
