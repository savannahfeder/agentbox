import path from 'node:path';
import { instructionsFor } from './instructions-file.mts';

/**
 * THE COMMAND LINE THAT STARTS A WORKER, BUILT FROM THE DEFINITION'S `run`.
 *
 * Every flag name here used to be a literal in main/supervisor.mts, so the
 * supervisor knew one engine's CLI by heart and a second one of the same family
 * could not be added without editing it. The order is the order that shipped,
 * and `tests/a-second-stream-json-engine-is-only-a-definition` holds it there,
 * because flag order is the kind of thing a refactor silently rewrites.
 *
 * ABSENT MEANS CANNOT, not "default". An engine whose `run` has no `effort` is
 * handed no effort word even when the task names one, which is how a harness
 * says it lacks a capability without the call site asking who it is. `fork` is
 * the one pair: a fork is a fork OF something, so it needs a resume as well.
 */
export function workerArgsFrom(run, { prompt, grants = [], effort = null, system = null, resumeId = null, fork = false } = {}) {
  if (!run) return [];
  const args = [];
  if (run.print) args.push(run.print, prompt);
  if (run.outputFormat) args.push(run.outputFormat.flag, run.outputFormat.value);
  if (run.stream) args.push(...run.stream);
  args.push(...grants);
  if (run.effort && effort) args.push(run.effort, effort);
  if (run.system && system) args.push(run.system, system);
  if (run.resume && resumeId) args.push(run.resume, resumeId);
  if (run.fork && fork && resumeId) args.push(run.fork);
  return args;
}

export function definitionMethods(definition) {
  const scrub = definition.scrubPatterns.map(pattern => new RegExp(pattern));
  return {
    ...definition,
    binary: config => config?.[definition.binKey] ?? null,
    workerArgs: options => workerArgsFrom(definition.run, options),
    // WHERE THE PERSON'S STANDING INSTRUCTIONS GO on this engine. A flag for
    // the one that has one, a file named in the definition for the ones that
    // do not, and a refusal for an engine with neither — because that engine
    // would answer against rules it was never given, and nothing on screen
    // would say so.
    instructions: context => instructionsFor(definition, context),
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
