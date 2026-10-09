# Security

Agentbox starts coding agents on your machine, so a security problem in it can
matter a great deal. Thank you for reporting one privately.

## How to report

Use GitHub's private reporting: the **Security** tab of this repository, then
**Report a vulnerability**. Please do not open a public issue or pull request
for it.

Include what an attacker could do, the steps to reproduce it, and the version
or commit you tested.

## What happens next

You will hear back within a week. Once a fix ships, the report is published
with credit to you unless you ask otherwise.

## What counts

Anything that lets something other than the person using Agentbox act on their
machine or read their data, including:

- an agent getting past an approval it should have needed;
- a worker receiving an API key, or the user's own browser (`--chrome`);
- anything leaving the machine that the privacy policy says does not;
- code in a pull request, a dependency or a workflow that would run with more
  access than it should.
