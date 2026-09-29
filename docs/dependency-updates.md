# Dependency updates without a maintenance team

the founder clarified on September 18 that nobody monitors dependency alerts.
An alert-only process is therefore insufficient. The recommended operating
model is automatic compatible upgrades, automated validation, and delivery of
successful signed app updates, with human attention reserved for failed checks,
major-version migrations and security fixes that cannot be shipped automatically.

The four terminal dependencies now use compatible version ranges, consistent
with the other dependencies. `npm update` can select newer compatible releases
without someone editing an exact pin first. The committed lockfile still records
the exact versions and integrity hashes tested for each build; `npm ci` preserves
that tested set. Neither changing a range nor running ordinary `npm install`
guarantees the lockfile advances. An installed app only gets a fix through a new
app release that it subsequently loads.

## What actually runs today

- GitHub tests configuration exists. The dependency update configuration proposes
  npm and GitHub Actions updates daily once published on GitHub's default branch.
- That dependency configuration remains local. Monitoring, automatic merging and
  automatic security releases have **not** been activated or verified.
- The release script builds signed artifacts but explicitly does not publish.
  Existing app update delivery cannot deliver an artifact nobody publishes.
- Therefore unattended security maintenance is still an unresolved launch
  requirement. Do not describe the current state as automatic protection.

## Required unattended delivery path

1. Automatically propose compatible dependency and lockfile updates. Include
   security fixes; do not use a broad ignore list or `npm audit fix --force`.
2. Run the complete tests, production build, and terminal integration checks on
   the exact candidate commit. Include native node-pty rebuild, input, resize,
   both panel positions, shell exit/restart and process cleanup.
3. Automatically merge eligible updates only after those required checks pass.
   Tests catch regressions; they do not prove a dependency is free of malware.
4. Build, sign and notarize the merged version; publish its update artifacts
   together through the existing release channel. Test that the app discovers
   and loads it. Configure this with scoped release credentials, not a token
   available to dependency pull-request code.
5. Escalate failed upgrades and unresolved applicable vulnerabilities to a
   notification the founder will actually receive. Do not silently accumulate PRs.
   Verify that delivery, rather than assuming an email is being read.

This path must be implemented and verified before claiming security fixes reach
users without a maintainer. A policy document and permissive version ranges are
not a substitute for it.

References:
- https://docs.npmjs.com/cli/v11/commands/npm-update/
- https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
