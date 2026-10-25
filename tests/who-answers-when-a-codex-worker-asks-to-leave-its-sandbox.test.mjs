// A CODEX WORKER LEFT ITS SANDBOX AND NOBODY WAS ASKED (w-36c51443df).
//
// MEASURED, NOT REASONED. 2026-10-09 on codex-cli 0.160.0, a real
// `codex app-server` on her own Codex home, driven through this repo's own
// `createCodexAppServer` and `createCodexWorker`. Run
// `node scripts/qa-codex-live.mjs approvals default home` to repeat it.
//
//   thread/start with `workerThreadParams({ cwd })` -- the shipped default
//   posture, on-request + workspace-write, NO REVIEWER NAMED -- and a prompt
//   asking for `echo ESCAPED > ~/.qa-codex-escape-probe`:
//
//     the worker's shell ran, exit 0
//     the probe file appeared in the HOME DIRECTORY on disk, reading ESCAPED
//     onApproval was NEVER CALLED. Cards raised: 0.
//     the raw wire carried NO server request at all.
//
//   The same prompt and the same posture with ONE field added,
//   `approvalsReviewer: 'user'`:
//
//     << item/commandExecution/requestApproval, reason "The sandbox blocked
//        this write outside the workspace. Do you approve..."
//     >> { "decision": "accept" }
//
// SO THE ESCALATION IS REAL AND THE CARD IS REACHABLE; it was being answered by
// somebody else. Her Codex home carried a TOP-LEVEL
// `approvals_reviewer = "auto_review"`, and the schema says what that means:
// ApprovalsReviewer "configures who approval requests are routed to for review.
// Examples include sandbox escapes, blocked network access... Defaults to
// `user`. `auto_review` uses a carefully prompted subagent to... approve or deny
// the request."
//
// `workerThreadParams` overrode `mcp_servers`, `projects` and `features` and not
// this one, so whoever owned the Codex home decided whether a worker could leave
// its sandbox, and the person holding the app was never shown the question.
//
// THE FIX, AND WHY IT IS NOT A REVERSAL OF w-ca48e69535. That row set
// `auto_review` on `auto` to stop two logins behaving differently: a home with
// no config sent asks to her, a home with one did not. Naming the reviewer
// EXPLICITLY on every mode fixes that same inconsistency, and fixes it in the
// direction the mode's own sentence already promised -- "Asks before going
// outside it or onto the network". One mode, one behaviour, whichever account
// the run is on, and the config file no longer gets a vote.
import { describe, expect, it } from 'vitest';
import { CODEX_DEFAULT_MODE, CODEX_MODES, CODEX_MODE_ORDER, codexPosture, CODEX_REVIEWERS, ASKS_THE_PERSON } from '../shared/codex-modes.mjs';
import { workerThreadParams, WORKER_APPROVAL_POLICY, WORKER_SANDBOX } from '../main/codex-session.mjs';
import { APPROVAL_DECISIONS, ELICITATION_ACTIONS } from '../main/codex-app-server.mjs';

describe('the three values the reviewer can take', () => {
  it('is the schema\'s own list, and `user` is the one that reaches a person', () => {
    // Read off `codex app-server generate-json-schema` on codex-cli 0.160.0,
    // 2026-10-09. A value not in this list is one `thread/start` refuses.
    expect(CODEX_REVIEWERS).toEqual(['user', 'auto_review', 'guardian_subagent']);
    expect(ASKS_THE_PERSON).toBe('user');
    expect(CODEX_REVIEWERS).toContain(ASKS_THE_PERSON);
  });
});

describe('the posture a Codex worker is started in', () => {
  const cwd = '/tmp/some-task-folder';

  it('asks the sandbox to refuse and leaves the asking switched on', () => {
    // Both halves matter. `workspace-write` is the wall; `on-request` is what
    // makes an escalation a QUESTION rather than a plain failure. Neither moved
    // between 0.148.0 and 0.160.0.
    expect(WORKER_SANDBOX).toBe('workspace-write');
    expect(WORKER_APPROVAL_POLICY).toBe('on-request');
    const params = workerThreadParams({ cwd });
    expect(params.sandbox).toBe('workspace-write');
    expect(params.approvalPolicy).toBe('on-request');
  });

  it('names her as the one who answers, so no config file can decide it', () => {
    // THE WHOLE OF THE FIX. The field is sent on every start, with the value
    // that routes the question to whoever is holding the app. Absent, it came
    // from `approvals_reviewer` in whichever Codex home billed the run.
    const params = workerThreadParams({ cwd });
    expect(params.approvalsReviewer).toBe(ASKS_THE_PERSON);
  });

  it('names her on a resume too, because a reply is most of what this app does', () => {
    // A resume carries the whole table again (`resumeThreadParams`), so a
    // posture that only held for a row's FIRST turn would be no posture at all.
    const params = workerThreadParams({ cwd });
    expect(params.approvalsReviewer).toBe(ASKS_THE_PERSON);
    const resumed = { ...params };
    delete resumed.ephemeral;
    expect(resumed.approvalsReviewer).toBe(ASKS_THE_PERSON);
  });

  it('still lets a caller name a different reviewer on purpose', () => {
    // The field is a value, not a constant: a caller that really wants the
    // subagent can say so, and saying so is then visible at the call site
    // rather than hidden in a file nobody reads.
    expect(workerThreadParams({ cwd, reviewer: 'auto_review' }).approvalsReviewer).toBe('auto_review');
  });

  it('refuses a reviewer Codex would not accept, rather than sending it', () => {
    // A word outside the schema's three is a `thread/start` refusal, which
    // costs a whole run. Falling back to the safe value keeps the run and keeps
    // the question with her.
    expect(workerThreadParams({ cwd, reviewer: 'nonsense' }).approvalsReviewer).toBe(ASKS_THE_PERSON);
    expect(workerThreadParams({ cwd, reviewer: '' }).approvalsReviewer).toBe(ASKS_THE_PERSON);
    expect(workerThreadParams({ cwd, reviewer: null }).approvalsReviewer).toBe(ASKS_THE_PERSON);
  });
});

describe('the mode she picks, and what it promises her', () => {
  it('routes every ask to her, on every one of the three', () => {
    for (const mode of CODEX_MODE_ORDER) {
      expect(codexPosture(mode).approvalsReviewer).toBe(ASKS_THE_PERSON);
    }
  });

  it('starts on a mode that asks her', () => {
    expect(CODEX_DEFAULT_MODE).toBe('auto');
    expect(codexPosture('auto').approvalsReviewer).toBe(ASKS_THE_PERSON);
    expect(codexPosture('auto').approvalsReviewer).not.toBe('auto_review');
  });

  it('falls back to a mode that asks her when the word is not one of ours', () => {
    // A stale word in her settings must not quietly buy a worker more room.
    expect(codexPosture('nonsense').approvalsReviewer).toBe(ASKS_THE_PERSON);
    expect(codexPosture(undefined).approvalsReviewer).toBe(ASKS_THE_PERSON);
  });

  it('says on screen that it asks, which is now what it does', () => {
    // THE SENTENCE IS THE PRODUCT. It said "Asks before going outside it or
    // onto the network" while asking a subagent instead; it is true now, and
    // this pins the two together so a change to either fails here.
    expect(CODEX_MODES.auto.what).toMatch(/asks/i);
    expect(codexPosture('auto').approvalsReviewer).toBe(ASKS_THE_PERSON);
  });

  it('asks about nothing on full access, because there is nothing left to ask', () => {
    // `never` is the policy, so naming a reviewer changes no behaviour there --
    // but it is named anyway, so that the table has one answer rather than two
    // and a future policy change cannot silently reopen this hole.
    expect(codexPosture('full-access').approvalPolicy).toBe('never');
    expect(codexPosture('full-access').sandbox).toBe('danger-full-access');
    expect(CODEX_MODES['full-access'].what).toMatch(/without asking/i);
  });
});

describe('the card, once it reaches her', () => {
  // Every one of these was exercised live on 2026-10-09 with
  // `approvalsReviewer: 'user'` and three real escalations in one turn:
  // accept ran the command (exit 0), decline left it unrun and the turn
  // carried on, and a card left unanswered was declined ONCE at its deadline
  // with the turn still carrying on. `client.stats()` ended
  // `{ pending: 0, threads: 0, approvals: 0 }` -- nothing leaked.
  it('takes the four words Codex accepts for a command, and no others', () => {
    expect(APPROVAL_DECISIONS).toEqual(['accept', 'acceptForSession', 'decline', 'cancel']);
    expect(APPROVAL_DECISIONS).not.toContain('abort');
    expect(APPROVAL_DECISIONS).not.toContain('approve');
  });

  it('takes a shorter list for an elicitation, which is not a subset by accident', () => {
    expect(ELICITATION_ACTIONS).toEqual(['accept', 'decline', 'cancel']);
    expect(ELICITATION_ACTIONS).not.toContain('acceptForSession');
  });
});
