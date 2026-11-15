# Security checks

Three layers, each catching what the one before it cannot.

| When | What | Where it runs |
| --- | --- | --- |
| Every ship, every pull request, every day at 06:17 UTC | Semgrep and the package audit (`.github/workflows/security.yml`) | GitHub |
| Every day | Dependabot looks for upgrades | GitHub |
| Every day | The daily review, below | A repeating task in the app, on Claude Code |
| Every week | The full audit, below | A repeating task in the app, on Claude Code |

When a ship's security run goes red, the app files one thread in Needs you
(`main/the-security-scan-went-red.mts`), and notes on that thread when the
scan is green again.

The two reviews run on the person's own Claude Code plan, on their own
computer. Agents cannot make repeating tasks; the person makes them in the
app, and each one's instruction just points here.

Both reviews obey the repository's rules: a fix lands with a test, and nothing
personal goes into this public repository. Reports go in the product's
documents, not here.

## The daily review

1. **Read the scan.** List the `security` workflow's runs on main since the
   last daily review:
   `gh run list --workflow security --branch main -L 50 --json databaseId,conclusion,createdAt,event,headSha,url`.
   If the newest finished run failed, read why (`gh run view <id> --log-failed`)
   and fix it on this branch. A Semgrep finding someone has read and judged
   harmless gets a `nosemgrep` comment on that line, with the reason. An
   advisory with no fix yet is listed in `scripts/audit-packages.mjs` with why
   it reaches nobody. Never drop a rule or loosen the audit to get green.
2. **Find what changed.** `git fetch origin` and list the commits on
   `origin/main` from the last 24 hours. If none touch code that ships (`main/`,
   `shared/`, `mcp/`, `cloud/`, `bin/`, `scripts/`, `renderer/src/`,
   `mobile/src/`, `preload.cjs`, the lockfiles), and the scan is green, finish
   clean.
3. **Review the change.** Run Claude Code's security review over that diff
   (the `claude-security` plugin's diff scan if it is installed, otherwise
   `/security-review`). Read the whole diff yourself as well. The bugs that
   matter here are specific to this app: what a worker can write that the app
   then trusts, what reaches the store root, what runs outside the worker
   sandbox, and what a teammate or the phone can make the app do.
4. **Try to disprove each finding.** Hand each one to a fresh subagent with the
   code, not your conclusion, and ask it to show why it is not real. Keep a
   finding only if it survives with a source trace or a local reproduction on
   dummy data.
5. **Act.** Fix small, confirmed findings on this branch, with a test. Name
   the rest in the answer, worst first, with what an attacker would need.
   Anything that is its own job gets one thread under this run.

## The weekly full audit

1. **Check the machine first.** This runs on the person's computer. Read free
   memory before starting, run at most four agents at a time, and run no local
   models.
2. **Get the skill.** Clone `https://github.com/cloudflare/security-audit-skill`
   into `scripts/scratch/security-audit-skill`. Before running anything, read
   its scripts. On 2026-10-23 its only code was two validators that parse
   JSON. If it now reaches the network, runs a shell or writes outside its own
   folder, stop and say so.
3. **Run every phase.** Follow its full-audit workflow over `origin/main`:
   recon, hunting, the independent verifiers and the coverage critic. The
   2026-10-23 run stopped after hunting, so none of its findings were checked
   by a second agent; finishing the verification is what this run is for.
   Give hunters to the parts that changed most since the last audit first.
   Target code runs only in a sandbox with no network and no credentials.
4. **Write it up.** Save the report in the product's documents as
   `reports/security-audit-YYYY-MM-DD.md`, in plain words: what was covered,
   what was confirmed by a second agent, what is still unverified, and what
   was skipped and why.
5. **Act.** Fix confirmed findings with tests on this branch. If several need
   a decision, they are one thread under this run, not one each.
