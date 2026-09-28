// Agentbox's own store modules, imported normally because they now live here.
//
// These files used to be loaded out of another repo by absolute path, so
// the app could not start on a machine that did not have that private repo
// checked out. They are Agentbox's now: main/store/* and shared/work-items.mjs,
// shared/dashboard.mjs, shared/contracts.mjs. The fold rules, the lock and the
// disk write-path still exist in exactly one place, that place is just inside
// this repo. Nothing here reaches outside it.

import * as workItemsDisk from './store/work-items.mjs';
import * as workItemsCore from '../shared/work-items.mjs';
import * as dashboard from '../shared/dashboard.mjs';
import * as project from './store/project.mjs';
import * as lock from './store/project-lock.mjs';

const mods = { workItemsDisk, workItemsCore, dashboard, project, lock };

// Kept as a function, and async, because every caller already awaits it and
// the shape of the returned object is what store.mjs and repeats.mjs destructure.
// There is nothing left to fail, so there is nothing left to throw.
export async function loadStore() {
  return mods;
}
