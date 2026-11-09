// WHAT A STAND-IN AGENT MAKES WHEN A TASK ASKS FOR SOMETHING TO LOOK AT.
//
// A real agent asked for a mock-up, a prototype page, a table or a write-up
// saves it in the project's documents, under designs/<task id>/, and names it
// by its full path in its answer (the brief tells it to). The stand-in does the
// same with small real files, so a test of sharing files between teammates has
// real files to share. A reply on a thread that already made one makes its
// next version (name-v2), as an agent changing a file someone has does.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Beside this file when a copy of the app carries it (live.mjs), else the repository's.
const here = path.dirname(fileURLToPath(import.meta.url));
const PICTURES = ['priority-palette.png', 'inbox-urgent.png'].map((p) => (fs.existsSync(path.join(here, 'pictures', p)) ? path.join(here, 'pictures', p) : path.join(here, '..', '..', 'docs', 'readme', p)));

const KINDS = [
  { ext: 'html', re: /\b(prototype|html|web ?page|landing page|page of)\b/i },
  { ext: 'png', re: /\b(mock ?up|mockup|design|screens?|screenshots?|diagram|draw|sketch|picture|options? for the)\b/i },
  { ext: 'csv', re: /\b(table|csv|spreadsheet|list them|put them in a list)\b/i },
  { ext: 'md', re: /\b(runbook|spec|write[- ]?up|document|doc|report|notes|one-pager|one page)\b/i },
];

const slugOf = (title) => String(title ?? 'work').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 5).join('-') || 'work';
const howMany = (text) => (/\b(two|2) (options|versions|designs|screens|takes)\b/i.test(text) ? 2 : /\b(three|3) (options|versions|designs|screens|takes)\b/i.test(text) ? 3 : 1);

/** The files this answer makes: [{ name, kind }], in the order the answer names them. */
export function artifactsFor({ task, asked = '', made = [] }) {
  if (asked && made.length) {
    const first = made[0];
    const m = first.match(/^(.*?)(?:-v(\d+))?\.(\w+)$/);
    return m ? [{ name: `${m[1]}-v${Number(m[2] ?? 1) + 1}.${m[3]}`, kind: m[3] }] : [];
  }
  const text = `${task}\n${asked}`;
  const kind = KINDS.find((k) => k.re.test(text));
  if (!kind) return [];
  const base = slugOf(task.match(/^Title: (.*)$/m)?.[1] ?? task);
  const n = kind.ext === 'png' ? howMany(text) : 1;
  return Array.from({ length: n }, (_, i) => ({ name: n > 1 ? `${base}-option-${i + 1}.${kind.ext}` : `${base}.${kind.ext}`, kind: kind.ext }));
}

/** What this thread made before, read off the earlier answers in its prompt. */
export function madeBefore(promptText, item) {
  const re = new RegExp(`designs/${item}/([\\w.-]+\\.(?:png|html|csv|md))`, 'g');
  return [...new Set([...String(promptText).matchAll(re)].map((m) => m[1]))];
}

function body(kind, name, title, version) {
  if (kind === 'html') return `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;background:#111;color:#eee;padding:40px"><h1>${title}</h1><p>Prototype${version ? ` v${version}` : ''} made by the stand-in agent.</p><button style="padding:12px 20px;border-radius:8px">Pay now</button></body>\n`;
  if (kind === 'csv') return `endpoint,method,problem,owner\n/payments,POST,no idempotency key,payments\n/refunds,POST,skips auth check,payments\n/appointments,GET,no pagination,web\n${version ? `/version-${version},GET,added in version ${version},web\n` : ''}`;
  return `# ${title}\n\n${version ? `Version ${version}. ` : ''}A short write-up made by the stand-in agent.\n\n1. What it found.\n2. What to do next.\n`;
}

/** Write the files under <docs>/designs/<item>/ and return their full paths. */
export function makeArtifacts({ docsDir, item, task, asked = '', promptText = '' }) {
  if (!docsDir || !item) return [];
  const made = madeBefore(promptText, item);
  const wanted = artifactsFor({ task, asked, made });
  if (!wanted.length) return [];
  const dir = path.join(docsDir, 'designs', item);
  fs.mkdirSync(dir, { recursive: true });
  const title = task.match(/^Title: (.*)$/m)?.[1] ?? 'The work';
  return wanted.map(({ name, kind }, i) => {
    const file = path.join(dir, name);
    const version = Number(name.match(/-v(\d+)\./)?.[1] ?? 0);
    // Bytes after a PNG's end are ignored when it is drawn, and make each version a different file, as a real redraw is.
    if (kind === 'png') fs.writeFileSync(file, Buffer.concat([fs.readFileSync(PICTURES[(i + version) % PICTURES.length]), Buffer.from(`\nversion ${version} option ${i + 1}\n`)]));
    else fs.writeFileSync(file, body(kind, name, title, version));
    return file;
  });
}
