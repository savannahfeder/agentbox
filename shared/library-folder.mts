// Which Library folder an artifact lives in. ONE rule, because main and the
// renderer both answer this question and they were answering it differently.
//
// A folder-backed artifact lives at creations/<...>/<slug> on disk, and
// `creations/` is storage, not a place the founder put anything: left in, it
// surfaced as a top-level folder called "Creations" holding everything
// folder-backed, which reads as nonsense when every artifact is one (founder
// report, 2026-07-24). So the storage root is stripped and whatever is left is
// the real folder.
//
// Main used to skip that strip, which is how the two views disagreed in the
// worst possible direction: the founder saw nine apps and canvases sitting
// loose at the top of her Library, while the agent's own list_library showed
// them tidily filed under "creations/" and therefore never noticed anything to
// organize.
export const STORAGE_ROOT = 'creations';

/**
 * @param {{ path?: string, dir?: string }} envelope
 * @returns {string} 'designs/round-1', or '' for something at the top level
 */
export function libraryFolderOf(envelope) {
  const p = envelope?.path ?? envelope?.dir ?? '';
  const cut = String(p).lastIndexOf('/');
  const folder = cut <= 0 ? '' : String(p).slice(0, cut);
  if (folder === STORAGE_ROOT) return '';
  return folder.startsWith(`${STORAGE_ROOT}/`) ? folder.slice(STORAGE_ROOT.length + 1) : folder;
}
