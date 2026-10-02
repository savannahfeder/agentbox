import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {AgentUpdates} from './components/AgentUpdates';
import '@fontsource-variable/source-sans-3';
import './styles.css';
import './workspace-navigation.css';
import { applyTheme, machineTheme, resolvePick, resolveTheme, THEME_KEY } from './theme';
import { applySkin, applyTune, normalizeSavedLook, resolveSkin, resolveTune, SKIN_KEY, TUNE_KEY, wornSkin } from './skins';
// The shape an opened task is, while that is still an open question on.
// Same reason as the theme above: it moves the header and the width of the
// words, so a frame drawn before it lands is a reflow.
import { applyTaskShape, resolveTaskShape, TASK_SHAPE_KEY } from './task-shape';

// A thrown React error takes the screen down without taking the process down,
// so nothing in the main process ever hears about it. These two lines are the
// only way a crash in the window reaches anyone. Name, message and stack and
// nothing else: the main process scrubs them before they touch disk, and the
// window is never trusted to decide what is safe to say.
const sendCrash = (name: string, message: string, stack: string) => {
  try { window.zero?.crash?.({ name, message, stack }); } catch {}
};
window.addEventListener('error', (e) => {
  sendCrash(e.error?.name ?? 'Error', e.error?.message ?? String(e.message ?? ''), e.error?.stack ?? '');
});
window.addEventListener('unhandledrejection', (e) => {
  const r: any = (e as PromiseRejectionEvent).reason;
  sendCrash(r?.name ?? 'UnhandledRejection', r?.message ?? String(r ?? ''), r?.stack ?? '');
});

// Before the first paint, not in an effect after it: a theme applied on mount
// shows one frame of the other one, and the other one here is a white flash in
// a dark room.
normalizeSavedLook(localStorage);
applyTheme(resolveTheme(localStorage.getItem(THEME_KEY)));
// And the picture, for the same reason and one worse: a skin changes what the
// surfaces are made of, so a frame drawn before it lands is an opaque card
// that then turns to glass, which reads as the window flinching.
//
// IT IS IN A FUNCTION NOW, and the reason is the theme lab below: resolveSkin
// refuses any id that is not in SKINS, and the lab's fifteen are appended to
// SKINS when the lab loads. Reading the stored skin before that happens turns
// every candidate into "no picture", so she would pick one, reload, and be
// back on plain dark with no idea why.
const paintTheLook = () => {
  // Match system on a dark Mac is Dark, which is Ember Grid (skins.ts).
  const startingSkin = wornSkin(resolvePick(localStorage.getItem(THEME_KEY)), resolveSkin(localStorage.getItem(SKIN_KEY)), machineTheme());
  applySkin(startingSkin);
  // And her dials with it, in the same breath and for the same reason: the
  // stylesheet's own numbers are the ones she overruled, so painting once with
  // them and again with hers is the window changing its mind in front of her.
  if (startingSkin !== 'none') applyTune(resolveTune(localStorage.getItem(TUNE_KEY), startingSkin));
  applyTaskShape(resolveTaskShape(localStorage.getItem(TASK_SHAPE_KEY)));
};

const boot = () => {
  paintTheLook();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AgentUpdates><App /></AgentUpdates>
    </React.StrictMode>
  );
};

// THE THEME LAB IS GONE.It was the strip that let her step through candidate
// pictures without leaving her inbox, it did its job, she picked her sixteen,
// and it left with the round it belonged to. The seventeen candidates it
// carried are recorded in decisions.md and their raw files are in designs/.
// tests/the-theme-lab-is-gone.test.mjs holds the door shut.
boot();
