# The phone app: the plan

Status: drafted 2026-10-20 on w-9f9c2570e2 and reviewed by Codex the same day.
Its corrections are folded in below, and "What Codex's review changed" lists
them. Phase 1's code is in `mobile/` and runs in the browser preview; it has
not been on a phone yet ("Where phase 1 stands").

## What was asked

"I tried a web version with a progressive web app and a relay but the mobile
interface is just so much better for this, especially now that we're going
multiplayer and trying to replace Slack. I think we really do need a good
mobile app because it's really important for notifications and similar
things."

Two worries came with it: Xcode's memory use on the Mac, and how hard it is to
get an app approved.

## The choice: Expo (React Native), built in Expo's cloud

- **No Xcode on the Mac.** EAS Build compiles the iPhone app on Expo's own
  Macs, and EAS Submit uploads it to App Store Connect from any machine, the
  Linux cloud runs included. The phone itself replaces the Simulator, through
  TestFlight or a development build.
- **Cloud agents can do most of the work.** TypeScript, unit tests in vitest,
  and the app's web target screenshotted in Chromium at iPhone size for layout
  review. Chromium cannot check the keyboard, native sign-in or anything that
  happens in the background, so those are checked on the phone. A
  JavaScript-only fix reaches installed phones through EAS Update on their
  next launch, with no new build and no review.
- **The renderer's language.** React and TypeScript. The app has its own
  dependencies, because Expo SDK 58 needs React 19.3 and the desktop is on
  React 18 (package.json). It imports only the shared modules that run without
  Node: some import Node's own modules (`shared/install-id.mjs`).
- **iPhone and Android from one code base.**

Not chosen:

- **SwiftUI.** It would feel the most native, and hosted Macs can build it
  too, but every local check needs Xcode, cloud agents on Linux could not test
  it, and it is iPhone only.
- **Capacitor around the phone site.** The fastest to make, but it is the web
  screen that was already found wanting, and an app that is "a repackaged
  website" is what guideline 4.2 turns away.

## What the app talks to

The same online inbox the phone site uses (docs/cloud/PHONE-PLAN.md). The app
adds no server of its own except the alert sender.

- **The owner's threads.** It reads `phone_projects` and `phone_threads` (the
  snapshot shape is `shared/phone-snapshot.mjs`) and writes `phone_commands`,
  every kind the site sends today: `reply`, `new`, `snooze`, `close`, `stop`,
  `run-now`, `send-now`, `reopen`, `schedule`, `approve` (migration
  20261019000000), with the device identity and approval fingerprints the site
  sends. It never folds a personal project's ledger lines; PHONE-PLAN's
  finding 5 still holds.
- **Files.** Signed links from the `phone-files` bucket, as on the site.
- **Live changes.** supabase-js Realtime, filtered to the owner, only while the
  app is in front. An event means "read that again", never the new state
  itself, and the app reads everything afresh after a reconnect and each time
  it comes to the front. The connection closes in the background; alerts are
  not a way to keep the app in step. A snapshot can be up to 1 MB (the
  migration's check), so bandwidth is measured before many phones use it. With
  many phones, Supabase advises private Broadcast over table changes.
- **People's messages: Direct conversations only, at first.** In a shared
  project a teammate's line carries only `problem`, `progress`, `solution`,
  `blockedBy`, `blocks` and `assignee` (`whatATeammateMaySet` in
  shared/team-rules.mjs); message text crosses only in a Direct conversation.
  Conversations inside shared projects need that protocol changed first.
- **Writing a message.** Not a plain insert into `lines`: row security there
  checks only `by_person` and the project, and `body` is any JSON
  (migration 20261001000000). A database function takes the message and checks
  membership, the conversation's participants, the author, the fields, the
  size, a rate limit and blocks, then writes the line. A message between
  people then needs no Mac awake.
- **The sync cursor is fixed first, for the desktop too.** A pull sets
  `pulledSeq` to the last row it saw (main/team/sync.mjs), so a line whose
  lower `seq` commits late is skipped for good. Phones add writers and make
  that likelier. Either sequence numbers are handed out one at a time per
  project, or the pull rereads a window behind its cursor. Edits made at the
  same moment get a fixed tie-breaker instead of the order they arrived in
  (shared/work-items.mjs).
- **Deadlines.** Every request has one. supabase-js takes a `fetch`, and the
  app gives it one that stops at a timeout.
  `tests/no-network-call-in-the-app-can-wait-forever` reads only `.mjs`,
  `.cjs` and `.js`, so it is taught TypeScript as well as the new folder.
- **No agent starts on the phone.** A command reaches the Mac, which starts the
  run through `spawnWorker`, as it does for the site. The cloud scheduler
  (docs/cloud/PLAN.md, "Next", step 4) will do the same with the Mac shut.

The phone site stays until the app does everything it does. Retiring it is the
owner's decision then.

## What version 1 does

1. **Sign in** with Apple, Google, or email and password.
2. **The inbox.** The rows that need the person, in the desktop's order and
   words. Pull down to refresh; swipe for Later or Close.
3. **A thread.** The conversation, the result, and the pictures, films and
   pages it names, drawn in place. Permission cards with Allow and Deny. Stop,
   Run now, Send now, Reopen and Undo. A reply box with the composer's choices:
   engine, model, effort, start later.
4. **A new thread.** Pick the project, then the same composer.
5. **People.** Direct messages, with @mentions. Report a message; block a
   person.
6. **Settings.** Which projects are on the phone, alerts, the AI notice, sign
   out, delete the account, the privacy policy, a contact address.

Beyond what a website can do: alerts on the lock screen, replying from the
alert itself, a badge with the number waiting, and an alert that opens its
thread.

Not in version 1: conversations inside shared projects, repeating tasks, pins,
dragging rows, the Team page, other settings, and an iPad layout. The app is
iPhone only, and it still has to work in an iPad's iPhone mode, because
reviewers sometimes test there.

## Alerts (PHONE-PLAN step 3)

The first version is sent by the Mac (2026-10-23, main/phone-alerts.mjs): the
phone leaves its token in `push_devices`, and the Mac's phone pass sends the
desktop banner's arrivals to it through Expo, by the desktop's rules, with no
words of a thread in it. It reaches the phone only while that Mac is on and
signed in. Everything else in this section, `push_outbox`, the server's rule
and the Edge Function, is still to build.

- `push_devices`: owner, platform, Expo push token, app version, last seen.
  Owner-only.
- `push_outbox`: owner, a dedupe key, the thread, created and sent times, and
  where it came from. Two things write it:
  - the Mac, for its own threads, from the same arrivals that make a desktop
    banner today (`shared/notify-rules.mjs`, and the arrivals
    main/phone-link.mjs fed to web push);
  - the database, when a line for a person is written: a Direct message, an
    @mention, a task given to them. These have to buzz with every Mac shut.
- **One rule on the server decides what is sent**, for both: duplicates,
  the person's settings, whether they may see the thread, age, and whether
  they are at a computer. The desk rule stays: no buzz while they have used a
  Mac in the last five minutes (`shared/notify-rules.mjs`), read from an
  activity record each Mac renews and that expires on its own. Alerts close
  together are folded into one, as main/phone-link.mjs does.
- **History is never an alert.** Lines brought in from history get a fresh
  insert time, so their age cannot tell them apart; a line is marked as an
  import when it is written, and imports are never sent.
- An Edge Function takes each row with a lease, sends it through Expo's push
  service, and records the receipt. It tries a few times, waiting longer each
  time, then gives up and marks the row. Delivery is at least once, so the
  phone drops a repeat it has already shown. It deletes tokens Expo reports as
  dead.
- **No private text in the payload.** The alert carries an id and nothing
  else, and the phone fills in the thread's title and first line itself (on
  iPhone, a notification service extension, added by a config plugin and built
  by EAS). Expo then never holds the text: its push FAQ says staff debugging
  the service may see contents. Until that is proven on a phone, alerts read
  the project's name and "needs you". A setting hides the text on the lock
  screen as well (guideline 4.5.4).
- Replying from the alert has to be proven on a real phone. If the app cannot
  send from the background, the action opens the thread with the reply box
  instead.

## Sign-in and accounts

- Supabase Auth, as today. Google through the database's own sign-in page in
  the system's sign-in sheet; email and password; Sign in with Apple through
  `expo-apple-authentication` and `signInWithIdToken`. Native Apple sign-in
  needs no web OAuth secret, so there is no six-month secret rotation. Apple
  is off today (`[auth.external.apple] enabled = false` in
  cloud/supabase/config.toml) and is switched on in the hosted project.
- The session is kept in the keychain (SecureStore). The app keeps only the
  access token, the refresh token, the expiry and the account's id and email,
  which is well under the keychain's comfortable size, so nothing is split
  out into AsyncStorage.
- **Hidden Apple addresses and team invites.** "Hide My Email" gives an address
  no invite was sent to, and `accept_invite` deliberately takes only the
  sign-in's own confirmed email (migration 20261001000500). So the person types
  the address the invite went to, a single-use code that expires is sent
  there, and the code attaches the membership to the Apple-signed-in account.
  An address typed and not proven never matches. Linking two sign-ins to one
  account comes later, needs proof of both, and is off today
  (`enable_manual_linking = false`).
- **Deleting an account deletes what the person wrote, shared or not.** Apple's
  account-deletion page: "This includes user-generated content that's shared
  with others". An Edge Function deletes the sign-in, their phone tables,
  files, devices and their messages and files in Direct conversations. A task
  they made in a shared project keeps its row, so teammates' replies under it
  hold, with the text they wrote removed. Anything kept because the law
  requires it is listed on the screen before they confirm. Their Apple tokens
  are revoked through Apple's REST API. The deletion reaches every desktop
  copy, and a Mac's old ledger never uploads deleted lines again. Today
  `projects.created_by` and `lines.by_person` reference `people` with no
  delete rule (migration 20261001000000), so a migration comes first.

## Where the code lives and how it is tested

- `mobile/` in this repository, with its own package.json. Expo SDK 58 (the
  current release on 2026-10-20), TypeScript, expo-router. Metro watches
  `../shared` for the modules the app may import.
- Logic lives in `mobile/src/lib/` with no React Native imports. Its tests sit
  in `tests/` as `.test.mjs` files, because vitest only collects
  `tests/**/*.test.mjs` (vitest.config.mjs) and the push hook only picks out
  that shape (scripts/lib/tests-the-push-runs.mjs). GitHub's workflow also
  installs `mobile/` and type-checks it.
- EAS credentials never enter git; the public check already refuses
  certificates and keys.
- EAS build profiles: `development` (a development build on the owner's phone,
  registered once) and `production` (`distribution: "store"`, which is what
  TestFlight and the App Store take). Expo's own `internal` distribution means
  ad hoc installs, not TestFlight's internal testing. EAS Update carries
  JavaScript-only fixes, pinned to a runtime version, released to a share of
  phones first and rolled back if it breaks. A new feature goes out as a new,
  reviewed build, never as an update (guideline 2.5.2).
- Builds start from the Mac at first. Building on GitHub when `mobile/`
  changes on main needs an Expo token kept as a repository secret, which is the
  owner's decision.
- `npm run ship` runs from the repository root, unchanged.

## Getting it onto phones, and approved

App Review is not the gate for the team. TestFlight's internal testing needs no
review: up to 100 people with App Store Connect roles, the Marketing role
included, install each build once Apple has processed it, and each build lasts
90 days. Only people who work on the app get those roles. Review applies to
the public App Store and to external TestFlight testers, whether invited by
email or by a public link.

1. **Apple Developer Program.** scripts/release.mjs needs a "Developer ID
   Application" certificate, which only a paid membership can make, so one
   probably exists. Check that it is active, and whether it is an individual or
   a company account: the store shows that name as the seller. A new company
   account needs a D-U-N-S number first (Apple: allow up to 5 business days if
   Dun & Bradstreet has no record), then Apple's own check.
2. **App Store Connect.** Create the app. The bundle id is permanent; the
   app's name can change with a later version. Free apps need no paid-apps
   agreement. Declare trader status for the EU (Digital Services Act): Apple
   asks for it even from developers who leave the EU storefronts off. A
   trader's address, phone and email are shown on the EU product page; an
   individual may give a PO box, with a bill or receipt that proves it. Apple
   gives no time for its check, and 2026 forum threads report weeks, so start
   it on day one.
3. **Expo.** An account, `eas init`, and EAS signed in to the Apple account
   once (a two-factor code on the phone). EAS makes the certificates,
   provisioning profiles and the push key.
4. **The first build, to TestFlight internal.** On the owner's phone the same
   day. Teammates are added as App Store Connect users with the Marketing role,
   then as internal testers.
5. **A week of daily use.** Fixes go out through EAS Update.
6. **The public App Store** waits on three things outside this plan: accounts
   for anyone (w-6633e825a7, step 3), the privacy and terms pages
   (w-7a670f07bb; today they say nothing is hosted, and they must also name
   the copy of each computer's settings the phone reads, which carries no
   paths and no instructions, shared/phone-settings.mjs), and an installed desktop
   app that can sign in to the cloud (`loadCloudConfig` in
   main/team/session.mjs answers null when packaged). Without them, a stranger
   who downloads the app has nothing to connect it to.
7. **The submission.** Name, subtitle, description and keywords; 6.9-inch
   iPhone screenshots of the real app; privacy policy and support addresses;
   the App Privacy answers; privacy manifests for every SDK in the build; the
   age-rating questions (people message each other); export compliance, set in
   the app config once the encryption it uses has been checked
   (`ITSAppUsesNonExemptEncryption: false` if it is HTTPS only); the review
   notes and two review accounts. Apple: "On average, 90% of submissions are
   reviewed in less than 24 hours." Its current page (2026-10-23) targets 50% within 24 hours and 90% within 48. Plan for one rejection round. Expedited review is for critical fixes or an event the app is part of, not a launch date we chose.
8. **Android.** Play Console costs $25 once. A personal account made after 13
   November 2023 must run a closed test with 12 testers for 14 days before it
   can publish; an organization account is exempt. Android teammates can use
   the closed test from its first day.

## What App Review will look for in this app

The likeliest first rejection, in Codex's reading, is account deletion as the
plan first had it, then user content, then a reviewer meeting a computer that
is asleep.

| Guideline | What could go wrong | The answer |
|---|---|---|
| 5.1.1(v) deletion | The account is deleted but what the person shared stays. | Deletion takes what they wrote with it, shared or not (Sign-in and accounts). Apple tokens revoked. |
| 1.2 user content | People message each other with no filter, report, block or contact. | A filter for objectionable text, report a message, block a person (enforced by the server, not only hidden on the phone), a contact address, and a queue of reports that somebody answers within a day. Messages going only between invited teammates is no exemption. |
| 2.1 completeness | The reviewer signs in, replies, and nothing answers, because no Mac is paired or it is asleep. | A review account on a cloud plan whose threads have kits, so a reply is answered by Agentbox Cloud with no computer awake (docs/cloud/PHONE-PLAN.md step 2). The reviewer replies, gets a result and an alert, and opens its files. The notes explain the desktop app, that the cloud carries replies while the computer is shut, and where the AI notice and Delete account are. The account never expires and its threads are kept fresh (a kit lasts six days). Over 40% of unresolved issues are 2.1 (Apple, 2026); link a short film of the desktop pairing. |
| 4.8 sign-in | Google sign-in with no equivalent private option. | Sign in with Apple, which meets the rule; Apple does not require it of every app. |
| 5.1.1(i) privacy policy | No privacy policy, or one that says nothing is hosted. | w-7a670f07bb, linked in the listing and in Settings. |
| 5.1.2(i) AI data | Personal data sent to third-party AI without explicit permission. | Before anything is sent, a screen names the provider (Claude by Anthropic, or Codex by OpenAI, on your own account) and what goes to it. An explicit Continue, recorded. Withdrawing it in Settings is checked when a command runs, queued ones included. The privacy policy names both. |
| 4.2 minimum function | A repackaged website. | Native screens, lock-screen alerts, replies from the alert. |
| 3.1 purchases | Selling or advertising the paid cloud. | The app sells nothing and shows no prices, upgrade prompts or links to buy; setup and payment happen on the computer (the founder, 2026-10-24: "we should never run into a situation where the app store tries to take a cut"). A test fails on purchase words in the phone app. Do not lean on 3.1.3(f) in the notes: it names VoIP, cloud storage, email and web hosting only. |
| 4.5.4 alerts | The app needing alerts to work, or marketing. | It works with alerts off. An alert names its thread (the founder asked for titles, 2026-10-13 and 2026-10-23), and the privacy policy says so. No marketing alerts. |
| 2.5.19 hidden features | A switch or flag that hides a feature from review (spelled out 2026-10-16). | Nothing in the phone app is behind a flag; what does not work yet is not in the build. |
| 4.2.7 remote desktop | Read as a thin client for a computer. | The notes say it is not a screen mirror: the phone has its own screens over the person's account, and the cloud runs replies itself. |

## Costs

- Apple: $99 a year, probably already paid.
- Google: $25 once, for Android.
- Expo: the free plan covers 15 iOS and 15 Android builds a month and updates
  to 1,000 monthly users; Starter is $19 a month (expo.dev/pricing, read
  2026-10-20).
- ChatGPT Plus: $20 a month, for Codex's reviews. It includes Codex in the
  CLI, an estimated 15 to 160 GPT-6.1 Sol messages per 5 hours, and weekly
  limits on top (learn.chatgpt.com/docs/pricing, read 2026-10-20). Codex's
  review of this plan used about 200,000 tokens.

## Phases, each one shippable

1. **A thin slice on the owner's phone.** Native sign-in (Apple, Google,
   email), the inbox, a thread, a reply, and one alert reaching the lock
   screen, all on a real phone through TestFlight internal. The riskiest
   native parts are proven before the screens are filled out.
2. **The rest of the owner's app.** New threads, every command, files,
   Realtime, delete account, the AI notice.
3. **Alerts in full.** `push_devices`, `push_outbox`, the server's rule, the
   sender, the Mac's activity record, the text filled in on the phone, reply
   from the alert, the badge.
4. **People.** Only after the message function and the sync cursor fix have
   landed and been tested with several writers. Direct conversations from the
   phone, their alerts, report, block and the filter.
5. **The App Store.** The review accounts and their stand-in computer, built
   alongside phase 2 rather than at the end, then the listing and the
   submission. Waits on the three things in step 6 above.
6. **Android.** The closed test, then production.

## Where phase 1 stands

Built on w-9f9c2570e2, shown in the browser preview (`EXPO_PUBLIC_PREVIEW=1`,
made-up threads), not yet on a phone:

- Sign in with Apple, Google and email. The sign-in client is the phone
  site's own (renderer/src/cloud-rest.ts), which gained `signInWithIdToken`
  for Apple. Google goes through the account database's own sign-in page in
  the system's sign-in sheet and comes back to `agentbox://signed-in`, not
  through Google's native SDK, so it needs no Google iOS client.
- The inbox: the desktop's four tabs and its order. The phone site's rules
  moved out of cloud-bridge.ts into renderer/src/phone-rows.ts so the site and
  the app share them. The tabs are composed in mobile/src/lib/tabs.ts from
  list-rules.ts, because App.tsx builds its lists inline; lifting those lists
  into one module both read is a follow-up.
- A thread: the desktop's conversation (item-thread.ts), the agent's live
  options as buttons (a pick sends "Option N: …", "Close this task" closes),
  a reply box, Later and Close. Each press leaves the phone site's command.
- Alerts: the app asks for permission, leaves its Expo push token in
  `push_devices` and can send itself a test alert. The Mac sends the real
  ones while it is on (see Alerts above); nothing in the cloud sends them yet
  (phase 3).
- A new thread, as the phone site's page: model, project, priority.
- The app's icon is the phone site's icon at 1024px.
- Every screen is drawn to the phone site's own measurements, read off the
  site as it renders: the top bar and its line, rows and their hairlines, the
  tabs' counts, the options card, the reply box and its sentence (priority,
  mode, model), the sheets, Settings' plates and the sign-in card. The wall
  runs under the status bar. The desktop's Later times moved out of
  Snooze.tsx into renderer/src/later-times.ts so both read them.
- Attaching, on a new thread and a reply: Photo library or Files, uploaded by
  the site's own sendFiles and linked as attachments.ts `attachmentLinks`
  writes them. Send later on a new thread: Add it to Later, tomorrow or
  Monday morning, or a typed time (composer-rules.ts).
- Not yet on the phone: search and View and filters (the site's search draws
  nothing without a Mac), Repeat it, and messages between people.
- AI teammates (2026-10-30): the computer's settings copy carries them and
  their chat (`phoneTeammatesOf`, in whatever room the copy has left under
  its 200KB check), and the phone's asks of them ride as `setting` commands
  with scope `teammate` (post, describe, goAhead) into `zero:teammates`. The
  app has Chats as its fifth tab (teammates, then groups), a chat per
  teammate, a New teammate page, Auto and teammates in To, and signed
  answers. Talking to a teammate needs the computer awake: teammates run
  there. Still only on the desktop: editing a teammate, its method, pausing it
  and making it primary. Also caught up: group mentions in Needs you, Mark
  unread, and "in the cloud" on a cloud run's working line. Not caught up: the
  web app's one-answer-at-a-time thread page and the team board under
  Everything else.

Tests: tests/the-phone-app-*.test.mjs pin the tabs, the thread and its
commands, sign-in and the kept session, the request deadline and the
markdown. The deadline test reads `mobile/src` too. The ship gate rates the
app's screens "look" and its sign-in, keychain, alerts and build "risky".

Not done in phase 1: native sign-in and alerts on a real phone, and CI that
installs `mobile/` and type-checks it.

To put it on the owner's phone:

1. Done 2026-10-23: the Expo project `@agentbox-app/agentbox`, bundle id
   `now.astral.agentbox` (both in app.config.ts), and the cloud's address,
   public key and phone site as EAS production variables.
2. `agentbox://signed-in` is on the allowed redirect addresses. Apple sign-in
   still has to be switched on in the hosted account database, with the
   bundle id as its client id.
3. `npx eas-cli build --profile production --platform ios --auto-submit` in
   `mobile/`, signed in to Apple once, which lands in TestFlight.
4. The desktop that phone talks to signs in from Settings › Phone; an
   installed build carries the cloud's address for that (scripts/release.mjs
   `bakedTeam`).

## What Codex's review changed (2026-10-20)

Codex read the plan and the code it names, and answered the eight questions
this plan asked it. Each claim below that depends on the code or on Apple's
pages was checked before it went in.

1. **Expo:** kept, with its own dependencies (React 19.3 against the desktop's
   18), tests in `tests/`, the deadline test taught TypeScript, CI and the risk
   tier taught `mobile/`.
2. **Realtime:** in the foreground only, as a signal to read again, with a
   full read after reconnecting. Bandwidth measured first.
3. **Messages from the phone:** through a database function that checks
   everything, never a plain insert. The sync cursor fixed first. Shared
   projects carry no message text today, so version 1 has Direct
   conversations only.
4. **Who decides an alert:** two writers, one rule on the server, with the
   desk rule, imports marked, leases and receipts.
5. **Hidden Apple addresses:** a code sent to the invited address claims the
   invite for the Apple account.
6. **Deleting an account:** takes shared content too. The plan had kept it
   under "A former member", which Apple's page rules out.
7. **The review account:** the real command path, always up, with a second
   account for People.
8. **Expo's push service:** fine for an alert that carries no private text.
   Codex would also show no text on the lock screen by default ("Agentbox
   needs your attention"). This plan shows the title and first line, filled in
   on the phone, because the alert is the reason for the app; iOS's own
   "Show Previews" setting and the app's hide setting cover a phone others
   can see. That is the one place the plan goes against Codex, and the owner
   chose it on 2026-10-20: "this is much better."

Smaller corrections: the TestFlight profile is `distribution: "store"`;
external TestFlight testers invited by email are reviewed as well; the app's
name can change; EU trader status is declared even with the EU storefronts
off; SDK privacy manifests; the 3.1.3(f) companion-app rule; the thin slice
first.

The riskiest assumption, in Codex's words: "that today's team ledger already
supports reliable, authorized multiplayer phone messaging." It does not yet,
which is why People is phase 4.

## The owner's steps outside the code

1. Check the Apple Developer membership: active, and individual or company.
2. Pick the bundle id, which is permanent, and a name, which can change later.
3. Declare EU trader status: an address (a PO box with a bill, for an
   individual), a phone and an email, shown on the EU product page.
4. An Expo account, and EAS signed in to Apple once.
