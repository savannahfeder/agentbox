# Contributing to Agentbox

Agentbox is open source under GPL-3.0-or-later. Contributions are welcome.
## Start here

Discuss substantial changes in an issue before implementation. Keep each pull
request focused on one problem, with a clear explanation and validation evidence.
See the [documentation index](docs/README.md) and [development guide](docs/development.md).

```sh
npm ci
ZERO_FIXTURES=1 ZERO_NO_SUPERVISOR=1 npm run dev
```

Use Node 22 and npm. Fixture development does not require a provider account.
Installation downloads Electron and native dependencies; Linux may need build
tools for node-pty. Read the development guide before using a real store.

## Validate your change

Write regression tests before behavior changes and observe them fail. Cover
boundaries and cases that must not match. Name tests as sentences and explain
what failed in an opening comment. Documentation changes need link and form
validation; they do not need tests that assert prose verbatim.

```sh
npm run check:contribution
npm run test:changed
npm run typecheck
npx vitest run --maxWorkers=4 --minWorkers=1
```

Read [CLAUDE.md](CLAUDE.md) for engineering constraints. AI assistance is welcome;
you remain responsible for reviewing every line, running checks, and explaining
manual verification. Never include credentials, personal stores, machine paths,
or private vulnerability details in a contribution.

## Submit and review

Create a feature branch in your fork, commit, push, and open a pull request.
External contributors should use this normal GitHub workflow; `npm run ship`
is an upstream maintainer tool, not a prerequisite for contribution.
CI runs tests on Linux and macOS. GitHub may require maintainer approval before
running workflows from a new contributor. Reviews assess correctness, safety,
maintainability, and fit. Review timing depends on maintainer availability.
Address feedback on the same branch and report any checks you could not run.

## Licence and security

Contributions are licensed under the project's GPL-3.0-or-later terms.
Report vulnerabilities privately using [SECURITY.md](SECURITY.md), rather than
public issues or pull requests. For usage questions, search existing GitHub issues before opening a new one.
