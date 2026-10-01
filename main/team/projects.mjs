// A PROJECT ON THIS MAC, SEEN AS SHARED OR PRIVATE.
//
// A shared project is an ordinary local project whose project.json carries a
// `team` record: the project's id in the cloud, the team, and who can see it.
// That id is the same on every teammate's Mac; the folder, its name on disk and
// the code it points at are each person's own. A project without `team` is
// private, and private projects never leave the Mac (only the title-free
// activity below does).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROJECT_FILE = 'project.json';

function readProject(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, PROJECT_FILE), 'utf8')); } catch { return null; }
}

function writeProject(dir, project) {
  const file = path.join(dir, PROJECT_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
}

// The `team` record, cleaned, or null for a private project.
export function teamOf(project) {
  const t = project?.team;
  if (!t || typeof t !== 'object' || typeof t.projectId !== 'string' || !t.projectId) return null;
  return {
    projectId: t.projectId,
    teamId: typeof t.teamId === 'string' ? t.teamId : null,
    visibility: t.visibility === 'people' ? 'people' : 'team',
    people: Array.isArray(t.people) ? t.people.filter((p) => typeof p === 'string') : [],
    // Who shared it. Runs the rows written before anyone signed in
    // (shared/team-rules.mjs runnerOf).
    sharedBy: typeof t.sharedBy === 'string' ? t.sharedBy : null,
    // A MESSAGE THREAD between two people (approved 2026-10-01): a shared
    // record the two of them only can see, kept out of every project list.
    direct: t.direct === true,
  };
}

export function readTeam(dir) {
  return teamOf(readProject(dir));
}

// Every shared project on this Mac, as sync wants them.
export function listSharedProjects(products) {
  return products
    .filter((p) => p.team?.projectId)
    .map((p) => ({ projectId: p.team.projectId, dir: p.dir, name: p.name, slug: p.slug, direct: p.team.direct === true }));
}

// Mark a local project shared. Its cloud id is minted the first time and kept
// for good, so sharing, unsharing to specific people and sharing again is one
// project in the cloud, not three.
export function markShared(dir, { teamId, visibility = 'team', people = [], sharedBy = null }) {
  const project = readProject(dir);
  if (!project) throw new Error(`no project.json in ${dir}`);
  const projectId = project.team?.projectId || crypto.randomUUID();
  project.team = {
    projectId, teamId, visibility: visibility === 'people' ? 'people' : 'team', people: [...new Set(people)],
    sharedBy: project.team?.sharedBy || sharedBy,
  };
  writeProject(dir, project);
  return teamOf(project);
}

// A project a teammate shared, made into a project here. Its folder is named
// from the project's name, and a name already taken on this Mac gets -2, -3.
export function joinSharedProject(accountRoot, cloudProject) {
  const base = cloudProject.direct ? `direct-${String(cloudProject.id).slice(0, 8)}` : String(cloudProject.name || 'shared').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'shared';
  let slug = base;
  for (let n = 2; fs.existsSync(path.join(accountRoot, slug)); n += 1) {
    // The same project joined before (a folder that already carries its id) is
    // not joined twice.
    if (readTeam(path.join(accountRoot, slug))?.projectId === cloudProject.id) {
      return { projectId: cloudProject.id, dir: path.join(accountRoot, slug), name: cloudProject.name, slug, direct: readTeam(path.join(accountRoot, slug))?.direct === true };
    }
    slug = `${base}-${n}`;
  }
  const dir = path.join(accountRoot, slug);
  fs.mkdirSync(dir, { recursive: true });
  writeProject(dir, {
    schemaVersion: 1,
    id: slug,
    name: cloudProject.name,
    createdAt: new Date().toISOString(),
    team: {
      projectId: cloudProject.id,
      teamId: cloudProject.teamId ?? null,
      visibility: cloudProject.visibility === 'people' ? 'people' : 'team',
      people: cloudProject.people ?? [],
      sharedBy: cloudProject.createdBy ?? null,
      ...(cloudProject.direct ? { direct: true } : {}),
    },
  });
  return { projectId: cloudProject.id, dir, name: cloudProject.name, slug, direct: cloudProject.direct === true };
}

// THE RECORD A MESSAGE BETWEEN TWO PEOPLE LIVES IN, made on the sender's Mac
// the first time they write to that person. Its folder is named for nobody, so
// it can never collide with a project, and both people are on it from the
// start; the other Mac joins it like any shared record.
export function makeDirect(accountRoot, { teamId, me, other, others = other ? [other] : [] }) {
  const projectId = crypto.randomUUID();
  const slug = `direct-${projectId.slice(0, 8)}`;
  const dir = path.join(accountRoot, slug);
  fs.mkdirSync(dir, { recursive: true });
  writeProject(dir, {
    schemaVersion: 1,
    id: slug,
    name: 'Direct',
    createdAt: new Date().toISOString(),
    team: { projectId, teamId, visibility: 'people', people: [me, ...others], sharedBy: me, direct: true },
  });
  return { projectId, dir, slug };
}
