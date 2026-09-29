// Skills: the house method, served to whoever is doing the thinking.
//
// These are the SAME files the in-app agent runs on (skills/<name>/SKILL.md),
// served verbatim. Not a fork, deliberately. A second set written for an external
// brain would read a little better and then drift, and skill drift has already
// cost this project real work; one source that improves for both surfaces beats
// two that agree only on the day they were written.
//
// What the calling agent needs on top is not a rewrite, it is one paragraph of
// orientation: these instructions were written for an agent with tools this
// server does not have. That paragraph is GENERATED from the live tool list
// below, so it cannot claim a capability that was removed or miss one that was
// added.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(HERE, '../../skills');

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;

// Front matter is `---\nname: x\ndescription: y\n---`. Parsed loosely on
// purpose: a skill with a malformed header should still be readable, because
// the prose is the part that matters.
function frontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([a-zA-Z-]+):\s*(.*)$/.exec(line.trim());
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function listSkills() {
  let entries = [];
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return [];
  }
  return entries.map((e) => {
    const file = path.join(SKILLS_DIR, e.name, 'SKILL.md');
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
    const fm = frontMatter(text);
    return {
      name: e.name,
      description: fm.description ?? firstLine(text),
      // Enough for an agent to judge whether it wants the whole thing before
      // spending the tokens on it.
      bytes: Buffer.byteLength(text, 'utf8'),
    };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

function firstLine(text) {
  const line = text.split('\n').find((l) => l.trim() && !l.startsWith('---') && !l.startsWith('#'));
  return (line ?? '').trim().slice(0, 200);
}

/**
 * One skill, verbatim, with a generated header.
 *
 * `capabilities` is the live list of what this server actually exposes, passed
 * in by the tool layer rather than hard-coded here, so the header and the tool
 * list are the same fact stated once.
 */
export function fetchSkill(name, { capabilities = [], missing = [] } = {}) {
  if (!NAME_RE.test(String(name ?? ''))) throw new Error(`invalid skill name: ${name}`);
  const file = path.join(SKILLS_DIR, name, 'SKILL.md');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    const names = listSkills().map((s) => s.name).join(', ');
    throw new Error(`no skill called "${name}". Available: ${names}`);
  }

  const refs = listReferences(name);
  return { name, header: header({ capabilities, missing, references: refs }), content: text, references: refs };
}

// Some skills carry reference files beside SKILL.md (the design skill does).
// Listed rather than inlined: they are large, and the agent should choose.
function listReferences(name) {
  const dir = path.join(SKILLS_DIR, name, 'references');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => `${name}/references/${f}`);
  } catch {
    return [];
  }
}

export function fetchReference(rel) {
  const parts = String(rel ?? '').split('/');
  if (parts.length !== 3 || parts[1] !== 'references' || !NAME_RE.test(parts[0]) || !/^[a-zA-Z0-9._-]+\.md$/.test(parts[2])) {
    throw new Error(`invalid reference path: ${rel} (expected "<skill>/references/<file>.md")`);
  }
  const file = path.join(SKILLS_DIR, parts[0], 'references', parts[2]);
  try { return fs.readFileSync(file, 'utf8'); } catch { throw new Error(`no such reference: ${rel}`); }
}

function header({ capabilities, missing, references }) {
  const lines = [
    'This skill was written for the agent inside the app, which has a larger tool set than this server exposes. The method is what matters and it still applies; the tool names sometimes do not.',
    '',
    `Through this server you have: ${capabilities.join(', ')}.`,
  ];
  if (missing.length) {
    lines.push(
      '',
      `The skill may tell you to use ${missing.join(', ')}. Those are not here. Where it says to provision a database, deploy, push to GitHub, set up analytics, or drive a browser, do it yourself with your own tools and your own accounts, then record what you did as a document.`,
      'Where it says open_creation, use write_document. Where it says read_creation, use read_document.',
    );
  }
  lines.push(
    '',
    'The founder is reachable through whatever interface you are running in, not through this server; there is no ask_user here.',
  );
  if (references.length) lines.push('', `Reference files available via fetch_reference: ${references.join(', ')}.`);
  return lines.join('\n');
}
