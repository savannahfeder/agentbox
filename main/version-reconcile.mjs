// An agent revises a document with ordinary file tools, so nothing can make it say
// which version it started from, and a version built on an old one drops whatever
// people typed since. This works out where it started from the words, and only
// merges when being wrong would keep words someone meant to remove rather than
// lose any. When both changed the same words the edit stays, and it says so: the
// agent's wording is one step back, and typed words are what cannot be got back.
import fsDefault from 'node:fs';
import path from 'node:path';
import { filesInLines, reviewKind, threadFiles } from '../shared/artifact-marks.mjs';
import { changes, changeSize, mergeText } from '../shared/text-merge.mjs';
import { saveNextVersion } from './file-version.mjs';
import { isInside, MAX_DOC_BYTES } from './doc-file.mts';

// A chain this long has plenty of versions nobody would have copied from.
const LOOK_BACK = 30;
// Past half changed it is a rewrite, not a revision of anything.
const MOST_CHANGED = 0.5;

function readVersion(dir, v, fs) {
  const file = path.resolve(dir, v.path);
  if (!isInside(dir, file)) return null;
  try {
    if (fs.statSync(file).size > MAX_DOC_BYTES) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function planFamily(family, dir, fs) {
  const versions = family.versions;
  const newest = versions.at(-1);
  const newestEdit = versions.findLastIndex((v) => v.edited);
  const nothing = { do: 'none', file: newest.id };
  const words = readVersion(dir, newest, fs);
  if (words === null) return null;
  const earlier = versions.slice(0, -1).slice(-LOOK_BACK).map((v) => ({ v, text: readVersion(dir, v, fs) })).filter((x) => x.text !== null);
  const head = earlier.at(-1);
  if (!head || head.v !== versions.at(-2)) return null;
  // The same words as a version already kept is someone going back to it on purpose.
  if (earlier.some((x) => x.text === words)) return nothing;

  const sized = earlier.map((x) => ({ ...x, size: changeSize(x.text, words) }));
  const closest = sized.reduce((best, x) => (x.size <= best.size ? x : best));
  const missed = { do: 'missed', file: newest.id, missed: versions[newestEdit].path };
  if (closest.size > (words.length + closest.text.length) * MOST_CHANGED) {
    const edit = earlier.find((x) => x.v === versions[newestEdit]);
    const before = earlier[earlier.indexOf(edit) - 1];
    const typed = edit && before ? changes(before.text, edit.text).map((c) => c.text.trim()).filter(Boolean) : [];
    return typed.some((t) => !words.includes(t)) ? missed : nothing;
  }
  if (closest.v === head.v || closest.size === sized.at(-1).size) return nothing;
  // Nobody else wrote since where it started: it went back over its own work.
  if (!versions.slice(versions.indexOf(closest.v) + 1, -1).some((v) => v.edited)) return nothing;

  const merged = mergeText(closest.text, head.text, words, { overlap: 'head' });
  if (merged.ambiguous || merged.text === head.text) return { ...missed, from: closest.v.id };
  if (merged.text === words) return nothing;
  return { do: 'merge', file: newest.id, from: closest.v.id, path: newest.path, text: merged.text, ...(merged.clashes.length ? { clash: merged.clashes.length } : {}) };
}

/** What each document on this thread needs, for those whose newest version an agent wrote over someone's edit. */
export function planReconcile({ dir, lines, fs = fsDefault }) {
  const settled = new Set((lines ?? []).flatMap((l) => (l?.patch?.artifact?.do === 'reconcile' ? [l.patch.artifact.file] : [])));
  const plans = [];
  for (const family of threadFiles(filesInLines(lines))) {
    const versions = family.versions;
    const newest = versions.at(-1);
    if (versions.length < 3 || newest.edited || settled.has(newest.id)) continue;
    if (reviewKind(newest.path) !== 'markdown' || !versions.some((v) => v.edited)) continue;
    const plan = planFamily(family, dir, fs);
    if (plan) plans.push(plan);
  }
  return plans;
}

/**
 * One look over the rows, for the supervisor's tick. Only rows people have edited
 * a file on, with no run going (an agent still working may change its version
 * yet), and only when the row moved since the last look. A failure says so here
 * and the row is looked at again next time.
 */
export function reconcileRows({ items, isLive, dirOf, historyOf, writeTo, looked, warn = () => {}, fs = fsDefault }) {
  for (const item of items) {
    if (!item.artifacts?.edits?.length || isLive(item)) continue;
    const key = `${item.product}\0${item.id}`;
    if (looked.get(key) === item.updatedAt) continue;
    looked.set(key, item.updatedAt);
    try {
      reconcileThread({ dir: dirOf(item), threadId: item.id, lines: historyOf(item), write: (patch) => writeTo(item, patch), fs });
    } catch (err) {
      looked.delete(key);
      warn(`could not reconcile the versions on ${item.id}: ${err?.message ?? err}`);
    }
  }
}

/**
 * Carries out the plan. `write(patch)` appends a line to the thread. The mark goes
 * last, so a crash in between leaves something the next look finishes: a merged
 * version is itself the person's edit on top, which the plan then leaves alone.
 */
export function reconcileThread({ dir, threadId, lines, write, fs = fsDefault }) {
  const plans = planReconcile({ dir, lines, fs });
  for (const plan of plans) {
    if (plan.do === 'merge') {
      const saved = saveNextVersion({ dir, threadId, lines, basePath: plan.path, text: plan.text, fs });
      if (!saved.ok) throw new Error(saved.error);
      write({ artifact: { do: 'edit', file: saved.file, path: saved.path } });
      write({ artifact: { do: 'reconcile', file: plan.file, path: saved.path, from: plan.from, ...(plan.clash ? { clash: plan.clash } : {}) } });
      const clash = plan.clash ? ` Where both changed the same words (${plan.clash === 1 ? 'one place' : `${plan.clash} places`}), the edit stayed, so check whether you want the agent's wording instead.` : '';
      write({ note: `An edit made while the agent worked was missing from its version, so [${saved.name}](${saved.path}) has both.${clash} The agent's version is kept as it wrote it.` });
    } else if (plan.do === 'missed') {
      write({ artifact: { do: 'reconcile', file: plan.file, missed: plan.missed } });
      write({ note: `The agent's newest version was written without the edit in [${path.basename(plan.missed)}](${plan.missed}), and they could not be merged safely. Both are kept. Tell the agent which to use.` });
    } else {
      write({ artifact: { do: 'reconcile', file: plan.file } });
    }
  }
  return plans;
}
