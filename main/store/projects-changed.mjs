// EVERY project.json WRITTEN IN THIS PROCESS IS COUNTED HERE.
//
// The store hands back a kept project list for a millisecond at a time without
// asking the disk anything (Store._productsNow), and it must never hand back
// one the app itself has just changed: markShared writes a project.json and the
// next line asks the store what each project says about itself. The folders'
// times catch another process, but not a write in the same millisecond or on a
// file system whose times are coarse, so the writers count their writes instead
// and the keeper reads the count.
//
// A writer that forgets this line is a stale project list, so there are few of
// them: patchProjectAt and createProject here in the store, writeProject in
// main/team/projects.mjs, and the store's own writes, which call
// Store.forgetProducts.
let writes = 0;

export const projectWritten = () => { writes += 1; };
export const projectWrites = () => writes;
