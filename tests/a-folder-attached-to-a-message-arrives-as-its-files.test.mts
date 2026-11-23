// A FOLDER ATTACHED TO A MESSAGE ARRIVES AS ITS FILES.
//
// Two Google Drive download folders dragged into the reply box stopped the
// message from sending: "Not sent: ... ENOTSUP: operation not supported on
// socket, copyfile '.../drive-download-...-1-001'". Saving copied every
// attachment with copyFileSync, which cannot copy a folder. Measured here by
// saving a real folder with saveAttachments, which threw before the fix.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveAttachments } from '../main/save-attachments.mts';

let root: string;
let project: string;
let folder: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-attach-'));
  project = path.join(root, 'project');
  folder = path.join(root, 'drive-download-20261114T174933Z-1-001');
  fs.mkdirSync(path.join(folder, 'board'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'IP Assignment.pdf'), 'ip');
  fs.writeFileSync(path.join(folder, 'board', 'consent.pdf'), 'consent');
  fs.writeFileSync(path.join(folder, '.DS_Store'), 'finder');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const read = (rel: string) => fs.readFileSync(path.join(project, rel), 'utf8');

it('saves every file inside the folder, its subfolders too, named under the folder', () => {
  const saved = saveAttachments(project, [{ name: path.basename(folder), srcPath: folder }]);
  expect(saved.map((s) => s.name).sort()).toEqual([
    'drive-download-20261114T174933Z-1-001-IP-Assignment.pdf',
    'drive-download-20261114T174933Z-1-001-board-consent.pdf',
  ]);
  const byName = Object.fromEntries(saved.map((s) => [s.name, read(s.rel)]));
  expect(byName['drive-download-20261114T174933Z-1-001-IP-Assignment.pdf']).toBe('ip');
  expect(byName['drive-download-20261114T174933Z-1-001-board-consent.pdf']).toBe('consent');
});

it('keeps the files around a folder, in the order they were attached', () => {
  const pdf = path.join(root, 'STEP-1-Board-Consent.pdf');
  fs.writeFileSync(pdf, 'step one');
  const saved = saveAttachments(project, [{ name: 'STEP-1-Board-Consent.pdf', srcPath: pdf }, { name: path.basename(folder), srcPath: folder }]);
  expect(saved).toHaveLength(3);
  expect(saved[0].name).toBe('STEP-1-Board-Consent.pdf');
  expect(read(saved[0].rel)).toBe('step one');
});

it('keeps a file its extension when the folder name is long', () => {
  const long = path.join(root, 'a'.repeat(90));
  fs.mkdirSync(long);
  fs.writeFileSync(path.join(long, 'photo.png'), 'px');
  const [saved] = saveAttachments(project, [{ name: path.basename(long), srcPath: long }]);
  expect(saved.name).toHaveLength(80);
  expect(saved.name.endsWith('-photo.png')).toBe(true);
  expect(saved.image).toBe(true);
});

it('saves nothing for an empty folder, and does not stop the message', () => {
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty);
  expect(saveAttachments(project, [{ name: 'empty', srcPath: empty }])).toEqual([]);
});

it('still copies a file whose name looks like a folder as one file', () => {
  const plain = path.join(root, 'drive-download-1-001');
  fs.writeFileSync(plain, 'just a file');
  const saved = saveAttachments(project, [{ name: 'drive-download-1-001', srcPath: plain }]);
  expect(saved.map((s) => s.name)).toEqual(['drive-download-1-001']);
  expect(read(saved[0].rel)).toBe('just a file');
});
