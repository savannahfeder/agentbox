// Who the app is to Windows: the taskbar groups its windows by this, a
// notification is shown under the name of the Start menu shortcut that carries
// it, and a pinned window has to match its shortcut. It is package.json's
// build.appId, which is what an installer built from there gives the app too.
export const APP_USER_MODEL_ID = 'ac.astral.app';
