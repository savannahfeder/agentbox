---
name: user-feedback
description: Read what people sent with Agentbox's Feedback card (the Mac app and the phone website) and work out what needs fixing. Use when asked to look through user feedback, check the feedback, or find what users are complaining about.
---

# User feedback

Every piece sent with the Feedback card is kept in the database, as well as
being emailed to the team.

```
npm run feedback                            # newest 20
npm run feedback -- --since 2026-11-01 --limit 100
npm run feedback -- --files /tmp/feedback   # also saves the attachments
```

Each piece shows its id, when it came, the app version and OS, a short
install id (two pieces with the same one came from one person), the words, the
attachments, and a line if its email did not go. Look at the attachments:
screenshots often say more than the words.

It signs in with `SUPABASE_ACCESS_TOKEN`, or on a Mac the Supabase CLI's
keychain login. On a cloud run without that token, ask for it with
`AGENTBOX-NEEDS: sign-in supabase | to read the feedback people sent`.

Feedback sent before 2026-11-12 was only emailed, so it is not here.

For each piece, say whether it is a bug, a request or praise, find the code it
points at, and say what you would change. Several pieces about one thing are
one finding.
