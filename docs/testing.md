# Testing Agentbox

The suite protects persistence, permissions, providers, transports, UI behavior,
and release tooling. Keep full cross-platform validation, but use focused local
feedback instead of repeatedly running every test while editing.

## Choose a scope

| Command | Scope | Use |
| --- | --- | --- |
| `npm run test:working` | Staged, unstaged, and untracked changes | Inner development loop |
| `npm run test:changed` | Branch diff from `origin/main`, plus working changes | Final check for a normal PR |
| `npm run test:changed -- --base origin/parent-branch` | Diff from the merge base with that parent, plus working changes | Stacked PRs |
| `npm run test:changed -- main/doc-file.mjs` | Explicit inputs and affected tests | Investigating one subsystem |
| `npm run test:plan -- --base origin/main` | Explain selection without running tests | Check scope and full-suite fallbacks |
| `npm run test:tooling` | `tests/tooling/` | Test-selection, hook, and CI infrastructure work |
| `npm test` | Complete suite, at most four workers | Broad changes and final confidence |

A working-tree check excludes already committed branch changes. A clean working
tree therefore runs nothing; it does not certify the whole PR. Before completing
a change, use its PR base, especially when stacking branches. No base is inferred
from the tracking branch: that branch often points at the same pushed commit.
Fetch the intended base first. A missing default base falls back to the full suite;
an explicitly invalid base is an error.

## How affected tests are selected

Vitest follows imports. The repository also finds tests naming changed files as
text, because many contract tests use filesystem reads or launch subprocess
fixtures instead of imports.
Both mechanisms are needed. Documentation and assets are included as inputs;
changed tests run too. Source-reader discovery covers nested test directories.
It is conservative and may over-select tests sharing a basename. Dynamically
constructed file paths and imports can still escape this heuristic, so affected
selection is a local feedback tool, not the entire merge gate.

Dependency manifests, Vitest configuration, shared test setup, selection code,
and hook changes require the full suite. Deleted source also requires full
coverage because its old imports are absent from the current dependency graph.
Unknown Git state is never treated as evidence that no tests are needed.
The push hook selects affected tests and defaults to two workers; it runs full
coverage for shared inputs or unknown impact. `AGENTBOX_PUSH_FULL_SUITE=1`
explicitly requests a full push check. Set `VITEST_MAX_FORKS` and
`VITEST_MIN_FORKS` deliberately when overriding hook/affected-run concurrency.

## CI and completion

Pull requests run the complete suite on Linux and macOS, plus typechecking and a build. Pushes to main validate the merged result.
Feature-branch pushes do not duplicate the PR jobs. A branch without a PR can
be checked through the manual workflow. Fork PRs receive no release credentials.

Use affected tests during development and for a narrow final local check.
Run full locally for shared infrastructure, dependency changes, deleted source,
or uncertainty about impact. Do not repeat a passing full run on unchanged
code without new evidence. Merge only after the full platform checks pass.
Manually verify affected user workflows. Do not discard a failure merely because a retry
passed; note the retry and investigate recurring failures.

## Organization and test quality

New tests belong under a subsystem directory when practical: `tests/tooling/`
now owns selector, hook, suite-scope, and workflow checks. Existing flat tests
remain discoverable. Move other tests incrementally with their subsystem work,
updating relative imports and checking selection rather than doing a mass rename.
Keep behavior-based names and opening comments explaining the regression.

Prefer pure tests for decision rules, real temporary stores/processes for
integration boundaries, and a small number of end-to-end checks for user flows.
Source-reading assertions can protect a capability contract, but should not
replace execution tests or pin irrelevant implementation spelling. Avoid adding
both unless they establish different facts. Isolate fixtures and clean up
processes and temporary data. Replace fixed sleeps with observable readiness.

## Profile before pruning

Save a complete run with timing data:

```sh
mkdir -p scripts/scratch
npm test -- --reporter=default --reporter=json --outputFile.json=scripts/scratch/test-profile.json
```

The JSON report contains each file's start/end times and assertion durations.
Rank slow files and investigate subprocess startup, repeated builds/typechecks,
large fixtures, and fixed waits. File durations overlap under parallel workers;
their sum is not wall-clock run time. Record worker count and machine load when
comparing runs. Reports stay ignored because errors can contain local paths.

Remove or consolidate tests only after identifying duplicate behavioral coverage
and preserving the failing regression they protected. Do not classify tests as
unit/integration by filename alone, skip slow tests to claim a speedup, or make a
flaky test invisible. Full-suite duration, affected-selection time, CI job count,
and recurring failures are separate metrics.

## Earlier baseline (2026-10-09)

On the local macOS development machine with Node 22 and four workers, the full
run passed 10,995 tests across 897 files in 90.64 seconds (17 tests and one file
skipped). An explicit selection for `main/zoom-keys.mjs` passed 33 tests across
two files in 2.80 seconds. These demonstrate scope reduction, not faster test
execution under controlled benchmark conditions.

The slowest reported files in that run were:

| File | Reported duration |
| --- | --- |
| `tests/an-approval-authorises-only-the-action-she-read.test.mjs` | 16.17 s |
| `tests/tooling/nothing-is-pushed-until-the-tests-pass.test.mjs` | 14.18 s |
| `tests/a-worker-cannot-write-its-own-approval.test.mjs` | 12.19 s |
| `tests/a-copy-run-from-source-offers-a-restart-when-main-moves.test.mjs` | 9.93 s |
| `tests/every-task-works-in-its-own-folder.test.mjs` | 9.71 s |

Investigate fixture/process startup and repeated Git setup in these files before
consolidating tests. Preserve the approval and filesystem behavior they establish.
The workflow runs three jobs per PR update: Linux tests, macOS tests, and
typecheck/build validation. Main's post-merge validation
remains a separate intentional run. The complete suite itself is still about
90 seconds; this change improves when and how much of it runs.
