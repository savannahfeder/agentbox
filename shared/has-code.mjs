// Whether a project's folder holds code, or only what every new repository starts with.
import fs from 'node:fs';

const NOT_CODE = /^(?:readme|license|licence|notice)(?:\.\w+)?$/i;

export function hasCode(dir) {
  if (!dir) return false;
  try {
    return fs.readdirSync(dir).some((name) => !name.startsWith('.') && !NOT_CODE.test(name));
  } catch { return false; }
}
