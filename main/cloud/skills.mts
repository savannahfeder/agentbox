import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const SKILL_LIMITS = { file: 25 * 1024 * 1024, skill: 50 * 1024 * 1024, total: 100 * 1024 * 1024, files: 5000, depth: 16 };
const inside = (p, root) => p === root || p.startsWith(root + path.sep);
const ignored = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__']);
const privateName = /^(?:\.env(?:\..*)?|auth\.json|credentials(?:\..*)?|\.credentials(?:\..*)?|id_(?:rsa|ed25519|ecdsa|dsa)|.*\.(?:pem|key|p12|pfx|mobileprovision|keychain(?:-db)?))$/i;
const privateContent = /(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{20,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/;
const hashOf = (files) => {
  const h = crypto.createHash('sha256');
  for (const f of [...files].sort((a, b) => a.rel.localeCompare(b.rel))) {
    h.update(JSON.stringify([f.rel, f.mode, f.body.length])); h.update(f.body);
  }
  return h.digest('hex');
};
const exists = (p) => { try { return fs.statSync(p).isDirectory(); } catch (err) { if (['ENOENT', 'ENOTDIR'].includes(err.code)) return false; throw err; } };
const failure = (status, message) => Object.assign(new Error(message), { status });

async function boundedFile(file, expected, limit) {
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = await handle.stat();
    if (!st.isFile() || st.dev !== expected.dev || st.ino !== expected.ino) throw new Error('file changed while being copied');
    const parts = []; let size = 0;
    for (;;) {
      const b = Buffer.alloc(Math.min(64 * 1024, limit - size + 1));
      const { bytesRead } = await handle.read(b);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > limit) throw failure('too_large', 'file size cap exceeded');
      parts.push(b.subarray(0, bytesRead));
    }
    return Buffer.concat(parts);
  } finally { await handle.close(); }
}

export async function readPortableFile(file, root, limit = SKILL_LIMITS.file, { allowHidden = true } = {}) {
  const realRoot = await fs.promises.realpath(root);
  const real = await fs.promises.realpath(file);
  if (!inside(real, realRoot)) throw Object.assign(new Error('symlink escape from the resource folder'), { status: 'denied' });
  const parts = path.relative(realRoot, real).split(path.sep);
  if (parts.some((p) => privateName.test(p) || (!allowHidden && p.startsWith('.')))) throw Object.assign(new Error('private resource path'), { status: 'denied' });
  const st = await fs.promises.lstat(real);
  if (!st.isFile()) throw Object.assign(new Error('resource is not a regular file'), { status: 'denied' });
  if (st.size > limit) throw Object.assign(new Error('file size cap exceeded'), { status: 'too_large' });
  const body = await boundedFile(real, st, limit);
  if (privateContent.test(body.toString('utf8'))) throw Object.assign(new Error('credential content in the resource file'), { status: 'denied' });
  return { body, mode: 0o644 | (st.mode & 0o111) };
}

/**
 * The files a folder would send: hidden, installed and private names left out,
 * links followed only while they stay inside it. `over` is set, and the list
 * cut short, once either cap is passed.
 */
export function filesInFolder(dir, { files: maxFiles = 300, bytes: maxBytes = SKILL_LIMITS.total, file: maxFile = SKILL_LIMITS.file, depth: maxDepth = SKILL_LIMITS.depth } = {}) {
  const root = fs.realpathSync(dir);
  const found = []; let bytes = 0; let over = false; const skipped = [];
  const walk = (p, depth) => {
    if (over || depth > maxDepth) return;
    for (const name of fs.readdirSync(p).sort()) {
      if (over) return;
      if (name.startsWith('.') || ignored.has(name) || privateName.test(name) || /[\r\n\0]/.test(name)) continue;
      const full = path.join(p, name);
      let real; let st;
      try { real = fs.realpathSync(full); st = fs.statSync(real); } catch { continue; }
      if (!inside(real, root)) continue;
      if (st.isDirectory()) { walk(full, depth + 1); continue; }
      if (!st.isFile()) continue;
      if (st.size > maxFile) { skipped.push(full); continue; }
      if (found.length + 1 > maxFiles || bytes + st.size > maxBytes) { over = true; return; }
      bytes += st.size; found.push({ path: full, bytes: st.size });
    }
  };
  walk(path.resolve(dir), 0);
  return { files: found, bytes, over, skipped };
}

async function readSkill(dir, limits) {
  const root = await fs.promises.realpath(dir);
  const files = []; const ancestors = new Set(); let bytes = 0;
  const walk = async (p, rel, depth) => {
    if (depth > limits.depth) throw failure('too_large', 'skill depth cap exceeded');
    const real = await fs.promises.realpath(p);
    if (!inside(real, root)) throw failure('denied', 'symlink escape from the skill folder');
    const st = await fs.promises.lstat(real);
    const identity = `${st.dev}:${st.ino}`;
    if (st.isDirectory()) {
      if (ancestors.has(identity)) throw failure('denied', 'symlink cycle in the skill folder');
      ancestors.add(identity);
      for (const name of (await fs.promises.readdir(real)).sort()) {
        if (ignored.has(name) || name.startsWith('._')) continue;
        if (privateName.test(name)) throw failure('denied', 'credential file in the skill folder');
        if (/[\r\n\0]/.test(name)) throw failure('denied', 'invalid skill file name');
        await walk(path.join(real, name), rel ? `${rel}/${name}` : name, depth + 1);
      }
      ancestors.delete(identity);
    } else if (st.isFile()) {
      if (files.length >= limits.files) throw failure('too_large', 'skill file count cap exceeded');
      if (st.size > limits.file) throw failure('too_large', 'file size cap exceeded');
      if (bytes + st.size > limits.skill) throw failure('too_large', 'skill size cap exceeded');
      const { body } = await readPortableFile(real, root, Math.min(limits.file, limits.skill - bytes));
      bytes += body.length;
      files.push({ rel, mode: 0o644 | (st.mode & 0o111), body });
    } else throw failure('denied', 'special file in the skill folder');
  };
  await walk(root, '', 0);
  return { files, bytes, hash: hashOf(files) };
}

async function skillDirs(root, report, prefix = '', parents = new Set()) {
  const real = await fs.promises.realpath(root);
  if (parents.has(real)) throw failure('denied', 'skill group cycle');
  const seen = new Set(parents).add(real);
  const found = [];
  for (const name of (await fs.promises.readdir(root)).sort()) {
    if (ignored.has(name) || name.startsWith('._')) continue;
    const dir = path.join(root, name);
    if (/[\r\n\0]/.test(name)) { report({ path: dir, reason: 'invalid skill directory name', status: 'denied' }); continue; }
    if (!exists(dir)) continue;
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) found.push({ dir, rel: prefix + name });
    else if (name === '.system' && !prefix) {
      try { found.push(...await skillDirs(dir, report, prefix + '.system/', seen)); }
      catch (err) { report({ path: dir, reason: err.message, status: err.status }); }
    }
  }
  return found;
}

function disabledSkills(codexHome) {
  let text;
  try { text = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8'); } catch (err) { if (['ENOENT', 'ENOTDIR'].includes(err.code)) return new Set(); throw err; }
  const disabled = new Set();
  for (const block of text.split(/(?=^\s*\[)/m)) {
    if (!/^\s*\[\[skills\.config\]\]/.test(block) || !/^\s*enabled\s*=\s*false\s*(?:#.*)?$/m.test(block)) continue;
    const value = /^\s*path\s*=\s*("(?:\\.|[^"\\])*"|'[^']*')\s*(?:#.*)?$/m.exec(block)?.[1];
    if (!value) throw new Error('cannot read a disabled skill path in config.toml');
    const file = value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1);
    if (!path.isAbsolute(file)) throw new Error('disabled skill path is not absolute');
    try {
      const real = fs.realpathSync(file);
      disabled.add(fs.statSync(real).isDirectory() ? real : path.dirname(real));
    } catch (err) { if (!['ENOENT', 'ENOTDIR'].includes(err.code)) throw err; }
  }
  return disabled;
}

/** Immutable, materialized skill folders. Call close after their archives have been uploaded. */
export async function snapshotSkills({ engine, homeDir, configDir, codexHome, limits: overrides = {}, only = null }) {
  const limits = { ...SKILL_LIMITS, ...overrides };
  const primary = path.join(engine === 'codex' ? codexHome : configDir, 'skills');
  const fallback = path.join(homeDir, '.claude', 'skills');
  const shared = path.join(homeDir, '.agents', 'skills');
  const skipped = []; const installed = new Map(); const byContent = new Map();
  let roots = [];
  try {
    const source = engine === 'codex' || exists(primary) ? primary : fallback;
    roots = [...new Set([source, shared])].filter(exists);
  } catch (err) { skipped.push({ path: primary, reason: err.message }); }
  let disabled = new Set();
  if (engine === 'codex') {
    try { disabled = disabledSkills(codexHome); }
    catch (err) { skipped.push({ path: codexHome, reason: err.message }); roots.length = 0; }
  }
  const destinations = new Map(); let total = 0; let count = 0;
  const add = (dest, name, skill) => {
    if (!destinations.has(dest)) destinations.set(dest, new Map());
    if (!destinations.get(dest).has(name)) destinations.get(dest).set(name, skill);
  };
  for (const root of roots) {
    let entries;
    try { entries = await skillDirs(root, (entry) => skipped.push(entry)); } catch (err) { skipped.push({ path: root, reason: err.message, status: err.status }); continue; }
    for (const entry of entries) {
      if (only !== null && entry.rel !== only) continue;
      try {
        const real = await fs.promises.realpath(entry.dir);
        if (disabled.has(real)) continue;
        let skill = installed.get(real);
        if (!skill) {
          skill = await readSkill(entry.dir, limits);
          if (!byContent.has(skill.hash)) {
            if (total + skill.bytes > limits.total) throw failure('too_large', 'skill bundle size cap exceeded');
            if (count + skill.files.length > limits.files) throw failure('too_large', 'skill bundle file count cap exceeded');
            total += skill.bytes; count += skill.files.length; byContent.set(skill.hash, skill);
          }
          skill = byContent.get(skill.hash); installed.set(real, skill);
        }
        add(root, entry.rel, skill); add(primary, entry.rel, skill);
      } catch (err) { skipped.push({ path: entry.dir, reason: err.message, status: err.status }); }
    }
  }
  const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agentbox-skills-'));
  const close = () => fs.rmSync(scratch, { recursive: true, force: true });
  try {
    if (skipped.some((s) => !s.status)) destinations.clear();
    const bundles = [];
    for (const [dest, entries] of destinations) {
      const files = []; let bytes = 0;
      for (const [name, skill] of entries) {
        if (bytes + skill.bytes > limits.total || files.length + skill.files.length > limits.files) {
          skipped.push({ path: path.join(dest, name), reason: 'materialized skill archive size or file count cap exceeded', status: 'too_large' });
          continue;
        }
        bytes += skill.bytes;
        files.push(...skill.files.map((f) => ({ ...f, rel: `${name}/${f.rel}` })));
      }
      if (!files.length) continue;
      const hash = hashOf(files); const dir = path.join(scratch, hash);
      if (!fs.existsSync(dir)) for (const f of files) {
        const file = path.join(dir, f.rel);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, f.body, { mode: f.mode });
      }
      bundles.push({ dir, path: dest, hash, bytes });
    }
    return { bundles, skipped, close };
  } catch (err) { close(); throw err; }
}
