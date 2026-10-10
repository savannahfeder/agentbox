import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

export function checkMarkdown(text, exists) {
  const prose = text.replace(/```[^]*?```|~~~[^]*?~~~/g, '').replace(/`[^`\n]*`/g, '');
  const missing = [];
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    const file = decodeURIComponent(target.split(/[?#]/)[0]);
    if (file && !exists(file)) missing.push(file);
  }
  return missing;
}

export function checkForm(form, labels) {
  if (!form || typeof form.name !== 'string' || typeof form.description !== 'string' || !Array.isArray(form.body) || !form.body.length) throw Error('form requires name, description, and body');
  for (const label of form.labels || []) if (!labels.includes(label)) throw Error(`unknown label: ${label}`);
  const ids = new Set();
  for (const field of form.body) {
    if (!['markdown', 'input', 'textarea', 'dropdown', 'checkboxes'].includes(field.type)) throw Error('invalid field type');
    if (field.type === 'markdown') {
      if (typeof field.attributes?.value !== 'string') throw Error('markdown requires value');
      continue;
    }
    if (!field.id || ids.has(field.id)) throw Error('missing or duplicate field id');
    ids.add(field.id);
    if (typeof field.attributes?.label !== 'string') throw Error('field requires label');
    if (['dropdown', 'checkboxes'].includes(field.type) && (!Array.isArray(field.attributes.options) || !field.attributes.options.length)) throw Error('field requires options');
    if (field.validations?.required !== undefined && typeof field.validations.required !== 'boolean') throw Error('required must be boolean');
  }
}

export function checkRepository(root) {
  const errors = [];
  const guides = ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CLAUDE.md', 'SECURITY.md', 'docs/README.md', 'docs/development.md', 'docs/architecture.md', 'docs/harnesses.md'];
  for (const guide of guides) {
    try {
      const missing = checkMarkdown(fs.readFileSync(path.join(root, guide), 'utf8'), file => {
        const target = path.resolve(root, path.dirname(guide), file);
        return target.startsWith(root + path.sep) && fs.existsSync(target);
      });
      errors.push(...missing.map(file => `${guide}: missing or outside repository: ${file}`));
    } catch (error) { errors.push(`${guide}: ${error.message}`); }
  }
  try {
    const labels = JSON.parse(fs.readFileSync(path.join(root, '.github/labels.json'), 'utf8'));
    const names = labels.map(label => label.name);
    if (new Set(names).size !== names.length || labels.some(label => !label.name || !/^[\da-f]{6}$/i.test(label.color))) throw Error('invalid label manifest');
    const folder = path.join(root, '.github/ISSUE_TEMPLATE');
    for (const file of fs.readdirSync(folder).filter(file => file.endsWith('.yml') && file !== 'config.yml')) {
      try { checkForm(load(fs.readFileSync(path.join(folder, file), 'utf8')), names); }
      catch (error) { errors.push(`${file}: ${error.message}`); }
    }
    const config = load(fs.readFileSync(path.join(folder, 'config.yml'), 'utf8'));
    if (config.blank_issues_enabled !== false || !config.contact_links?.length || config.contact_links.some(link => !link.name || !link.about || new URL(link.url).protocol !== 'https:')) throw Error('invalid issue routing');
  } catch (error) { errors.push(error.message); }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const errors = checkRepository(root);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Contributor guide file links, labels, and issue forms pass.');
}
