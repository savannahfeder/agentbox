// WHERE THIS MACHINE KEEPS THE TEAM CLOUD'S ADDRESS, for the phone site's
// build and deploy: the checkout's own cloud/team.config.json, else the one in
// the home folder that main/team/session.mjs also reads. Neither is committed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nameSlug } from '../shared/product-name.mjs';

export function teamConfigFile(root, home = os.homedir()) {
  for (const file of [path.join(root, 'cloud', 'team.config.json'), path.join(home, `.${nameSlug}`, 'team.config.json')]) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}
