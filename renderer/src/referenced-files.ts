// The renderer's door onto the shared rule. The rule itself moved to
// shared/referenced-files.mjs when the brief needed it too: a worker being
// handed her screenshot has to resolve the same paths her attachment row
// does, and two copies of a regex that decides what a file is would drift
// apart the first time either side gained an extension.
export { referencedFiles, fileLabel, isImagePath } from '../../shared/referenced-files.mjs';
