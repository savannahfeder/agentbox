// The New thread page's Project list, one group per computer: which computer
// each project is on, whether that computer is on, and the ones that can run
// a thread first.
import { ago, macAway, phoneSlug, type PhoneRows } from '../../../renderer/src/phone-rows';
import { Name } from '../../../shared/product-name.mjs';

type ProjectRow = PhoneRows['projects'][number];
export interface ComputerGroup {
  device: string;
  label: string;
  /** A thread filed here starts: the computer is on, or the cloud carries it. */
  runs: boolean;
  projects: { slug: string; name: string }[];
}

export function projectsByComputer(projects: readonly ProjectRow[], computers: readonly { device: string; name: string }[], now: number): ComputerGroup[] {
  const byDevice = new Map<string, ProjectRow[]>();
  for (const p of projects) byDevice.set(p.device, [...(byDevice.get(p.device) ?? []), p]);
  const groups = [...byDevice].map(([device, rows]) => {
    const seenAt = Math.max(0, ...rows.map((p) => Date.parse(p.updated_at ?? '') || 0));
    const on = !macAway(seenAt, now);
    const cloud = rows.some((p) => p.cloud === true);
    const name = computers.find((c) => c.device === device)?.name || 'Another computer';
    const state = on ? 'online' : cloud ? `off, runs in ${Name} Cloud` : `last online ${ago(now - seenAt)}`;
    const rank = on ? 0 : cloud ? 1 : 2;
    return { rank, seenAt, group: { device, label: `${name} · ${state}`, runs: on || cloud, projects: rows.map((p) => ({ slug: phoneSlug(p.device, p.project), name: p.name })) } };
  });
  return groups.sort((a, b) => a.rank - b.rank || b.seenAt - a.seenAt).map((g) => g.group);
}

/** The projects with those a thread can start in ahead of the rest, so the page never opens on a computer that is gone. */
export function runnableFirst<P extends { slug: string }>(products: readonly P[], groups: readonly ComputerGroup[]): P[] {
  const runs = new Set(groups.filter((g) => g.runs).flatMap((g) => g.projects.map((p) => p.slug)));
  return [...products.filter((p) => runs.has(p.slug)), ...products.filter((p) => !runs.has(p.slug))];
}
