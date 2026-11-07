// Agentbox's own store modules, imported normally because they now live here.
//
// These files used to be loaded out of another repo by absolute path, so
// the app could not start on a machine that did not have that private repo
// checked out. They are Agentbox's now: main/store/* and shared/work-items.mts,
// shared/dashboard.mts, shared/contracts.mts. The fold rules, the lock and the
// disk write-path still exist in exactly one place, that place is just inside
// this repo. Nothing here reaches outside it.

import * as workItemsDisk from './store/work-items.mts';
import * as workItemsCore from '../shared/work-items.mts';
import * as dashboard from '../shared/dashboard.mts';
import * as project from './store/project.mts';
import * as lock from './store/project-lock.mts';

const mods = { workItemsDisk, workItemsCore, dashboard, project, lock };

// Kept as a function, and async, because every caller already awaits it and
// the shape of the returned object is what store.mts and repeats.mts destructure.
// There is nothing left to fail, so there is nothing left to throw.
export type StoreModules = typeof mods;

export async function loadStore() {
  return mods;
}
