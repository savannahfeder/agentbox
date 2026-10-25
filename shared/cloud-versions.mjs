// THE CLOUD IMAGE'S CLAUDE CODE AND CODEX AGAINST THIS MAC'S.
//
// scripts/cloud-setup.mjs pins the image to the versions this Mac ran when it
// was built and writes them into cloud.json. A thread moves between the two,
// so a gap in major.minor is worth a rebuild, and a gap in major is a known
// break: that engine's threads stay on this Mac until the image is rebuilt.

const minor = (v) => {
  const m = /^(\d+)\.(\d+)\.\d+/.exec(String(v ?? '').trim());
  return m ? { major: Number(m[1]), text: `${m[1]}.${m[2]}` } : null;
};

/** `cloud` and `mac` are `{ claude, codex }` version strings; one entry per engine that differs. */
export function cloudVersionGaps({ cloud = {}, mac = {} } = {}) {
  const out = [];
  for (const engine of ['claude', 'codex']) {
    const there = minor(cloud[engine]);
    const here = minor(mac[engine]);
    if (!there || !here || there.text === here.text) continue;
    out.push({ engine, cloud: there.text, mac: here.text, blocks: there.major !== here.major });
  }
  return out;
}
