import path from 'node:path';

export function definitionMethods(definition) {
  const scrub = definition.scrubPatterns.map(pattern => new RegExp(pattern));
  return {
    ...definition,
    binary: config => config?.[definition.binKey] ?? null,
    launchEnv: (_bin, env) => ({ ...env }),
    install: () => ({ file: definition.installer.shell, args: ['-c', `curl -fsSL ${definition.installer.url} | ${definition.installer.pipe}`] }),
    signIn: bin => ({ file: bin, args: [...definition.loginArgs] }),
    signInStatus: bin => ({ file: bin, args: [...definition.statusArgs] }),
    accountKey: profile => `${definition.accountPrefix}${profile}`,
    workerEnv(input = process.env) {
      const env = { ...input };
      for (const key of Object.keys(env)) if (scrub.some(pattern => pattern.test(key))) delete env[key];
      return env;
    },
    signInFiles: ({ folder }) => folder ? definition.credentialFiles.map(file => path.join(folder, file)) : [],
  };
}

// Installation-specific work remains in each adapter. The common installers
// use the same prefix and cask checks for every registered tool.
export function commonUpdatePlan(definition, { bin, real, home, channel = 'latest' }, native) {
  if (!path.isAbsolute(bin || '') || !real) return null;
  const name = definition.label;
  const brew = real.match(/^(\/opt\/homebrew|\/usr\/local)\/Caskroom\/([^/]+)\//);
  if (brew && definition.casks.includes(brew[2])) return {
    name, file: `${brew[1]}/bin/brew`, args: ['upgrade', '--cask', brew[2]],
    feed: `https://formulae.brew.sh/api/cask/${brew[2]}.json`, format: 'brew',
  };
  const tail = `/lib/node_modules/${definition.package}/`;
  const at = real.indexOf(tail);
  if (at > 0) {
    const prefix = real.slice(0, at);
    return { name, file: path.join(prefix, 'bin/npm'),
      args: ['install', '--global', '--prefix', prefix, `${definition.package}@${channel}`],
      env: { PATH: `${prefix}/bin:${process.env.PATH || ''}` },
      feed: `https://registry.npmjs.org/${definition.package}/${channel}`, format: 'npm' };
  }
  return native?.({ bin, real, home, channel, name }) ?? null;
}
