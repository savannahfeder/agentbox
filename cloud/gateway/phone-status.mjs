import { cloudSessionId } from '../../shared/cloud-kit.mts';

const segment = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v);
const address = (p) => p && /^[0-9a-f]{12}$/.test(p.device ?? '') && segment(p.project) && segment(p.item);

// Which helpers are out, by the events the Mac counts them from (main/harnesses/claude-stream.mts `countHelpers`).
function countHelpers(r, msg) {
  if (msg.type !== 'system' || !msg.task_id) return;
  const out = r.helpers.filter((id) => id !== msg.task_id);
  if (msg.subtype === 'task_started') r.helpers = [...out, msg.task_id];
  else if (msg.subtype === 'task_updated' && msg.patch?.status && msg.patch.status !== 'in_progress' && msg.patch.status !== 'running') r.helpers = out;
}

export function cloudRunSnapshot(snapshot, { runId, since, at }) {
  if (!snapshot?.item) return null;
  const live = snapshot.live;
  if (at === null) {
    if (live?.runId !== runId) return null;
    const { live: _gone, ...rest } = snapshot;
    return rest;
  }
  if (Number(live?.since) > since) return null;
  return { ...snapshot, live: { runId, since, at, where: 'cloud', doing: live?.runId === runId ? live.doing ?? [] : [] } };
}

export function createPhoneRunStatus({ db, objects, now, active, events, log }) {
  const prefix = 'ledger/phone/status/';
  return {
    async watch(owner, sessionId, runId, phone, since) {
      if (!db.runStatus || !address(phone)) return;
      const key = `${prefix}${owner}/${runId}.json`;
      try {
        await objects.put(key, JSON.stringify({ owner, sessionId, runId, phone, since }), { ifNoneMatch: '*' });
      } catch (err) { if (!err?.conflict) throw err; }
    },
    async sweep() {
      if (!db.runStatus) return;
      for (const r of await db.cloudRuns?.() ?? []) {
        if (!/^[0-9a-f-]{36}$/.test(r.owner ?? '') || !/^[A-Za-z0-9._-]{1,120}$/.test(r.runId ?? '') || !address(r) || !Number.isFinite(Number(r.since))) continue;
        const sessionId = cloudSessionId(r.item, r.runId);
        if (await active(r.owner, sessionId, r.runId)) {
          await this.watch(r.owner, sessionId, r.runId, { device: r.device, project: r.project, item: r.item }, Number(r.since));
        } else {
          await db.runStatus(r.owner, { device: r.device, project: r.project, item: r.item }, { runId: r.runId, since: Number(r.since), at: null });
        }
      }
      for (const key of await objects.list(prefix)) {
        try {
          const obj = await objects.get(key);
          if (!obj) continue;
          const r = JSON.parse(obj.body);
          const running = await active(r.owner, r.sessionId, r.runId);
          let done = !running || !!await objects.head(`runs/u-${r.owner}/${r.runId}/done.json`);
          if (!done && events) {
            r.cursor ??= 0;
            r.working ??= true;
            r.helpers ??= [];
            for (let n = 0; n < 4; n += 1) {
              const page = await events(r.owner, r.sessionId, r.runId, r.cursor);
              if (page?.error === 'no-run') { done = true; break; }
              if (!page?.ok || !Array.isArray(page.events)) throw new Error('the cloud did not return run events');
              const text = page.events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data ?? '', 'base64').toString('utf8')).join('');
              const lines = `${r.partial ?? ''}${text}`.split('\n');
              r.partial = lines.pop();
              if (r.partial.length > 256 * 1024) r.partial = '';
              for (const line of lines) {
                let msg; try { msg = JSON.parse(line); } catch { continue; }
                // A turn can end with helpers still out, and then the run is still at work.
                countHelpers(r, msg);
                if (['turn/completed', 'turn/failed'].includes(msg.method) || msg.type === 'result') r.working = r.helpers.length > 0;
                else if (msg.method === 'turn/started' || ['assistant', 'stream_event'].includes(msg.type)) r.working = true;
              }
              r.cursor += page.events.length;
              if (!page.more || !page.events.length) break;
            }
            await objects.put(key, JSON.stringify(r), { ifMatch: obj.etag });
          }
          const at = !done && r.working !== false ? now() : null;
          const written = await db.runStatus(r.owner, r.phone, { runId: r.runId, since: r.since, at });
          // A concurrent snapshot write is retried on the next clock tick.
          if (done && written !== false) await objects.del(key);
        } catch (err) { log(`phone: could not refresh cloud running status: ${err?.message || err}`); }
      }
    },
  };
}
