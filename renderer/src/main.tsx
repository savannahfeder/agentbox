import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {AgentUpdates} from './components/AgentUpdates';
import '@fontsource-variable/source-sans-3';
import './styles.css';
import './workspace-navigation.css';
// The shape an opened task is, while that is still an open question on.
// Applied before the first paint: it moves the header and the width of the
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

// ONE LOOK, LIGHT (w-9e434e8671). There is no stored theme or picture to read
// before the first paint any more: the stylesheet's `:root` is the only look.

const boot = () => {
  applyTaskShape(resolveTaskShape(localStorage.getItem(TASK_SHAPE_KEY)));
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AgentUpdates><App /></AgentUpdates>
    </React.StrictMode>
  );
};

boot();
