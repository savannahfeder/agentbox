# Outreach films: one command per lead

Makes the founder's 97-second outreach film for one company: her voice and face
bubble over the real Agentbox app, opening on the company's own homepage, with
their logo, threads about their product, and three new headlines drawn on their
live page. Any agent can make one. The only thing a model writes is
`brief.json`, and the command refuses a brief, or a finished film, that breaks
a rule, so a careless model gets a list of fixes, never a bad film.

```
node scripts/outreach-film/film.mjs make <lead dir> --kit <kit dir> [--out <dir>]
```

## The loop

1. Make a folder for the lead with `lead.json` in it:
   `{"name": "Acme", "domain": "acme.com"}`. Keep lead folders in the product
   documents under `outreach-films/leads/<company>/`, never in this repo.
2. Run `make`. It reads their site (no model) and stops with exit code 3 and
   a prompt: brief.json is not written yet.
3. Write `brief.json` in the lead folder by following `BRIEF.md`, using
   `brief.example.json` as the shape. Read only `site.json` and `lead.json`;
   do not browse. A key the example does not have is refused.
4. Run `make` again. If the brief breaks a rule it exits 1 and lists each
   problem as `where: what to change`. Fix exactly those and run it again.
   (`film.mjs check <lead dir>` runs only this step, in about a minute.)
5. When the brief passes, it films (about 20 minutes on a 2-core machine) and
   writes `<company>-outreach-v<N>.mp4`, a contact sheet and a report to
   `--out`. Look at the contact sheet before you show the film to anyone.

To let another model write the brief by itself, pass `--writer "<command>"`:
the command gets the prompt on stdin and runs in the lead folder, and fix
rounds go back to it (three at most). For example
`--writer "claude -p --permission-mode acceptEdits"`, or
`--writer "codex exec --full-auto -"`.

| Exit | Meaning |
| --- | --- |
| 0 | Film made; its path is printed |
| 1 | brief.json breaks rules; each is listed |
| 2 | This machine or the kit is missing something; it is named |
| 3 | brief.json is not written yet; the prompt is printed |
| 4 | Skip this lead: its site could not be read well enough |
| 5 | Both takes failed their checks; the reasons are printed |

## What makes a wrong film impossible, and what does not

Checked by script, every time:

- Every name of theirs is quoted from their own site, and every quote is
  really there. The company name is on the site, the domain is the one read.
- Everything fits the screen: titles, Maya's row with her comment, the reply
  the film types, the code, the headlines on their own page in their font.
- No two threads start alike, so the film opens the one it means to.
- The recorder fails a take when anything it meant to do did not happen: a
  thread not found, the reply box not holding the reply, Maya's comment
  missing from her row, no frame after a cut.
- The finished film is watched (`check-film.py`): no screen may show for one
  or two frames unlike both sides (the old 0:52 and 1:17 flashes), and every
  cut must change the screen when it should (the old stuck switcher at 0:07).
  A failed take is filmed again once, then the lead stops with the reasons.

Not checked by script: whether the threads are good guesses at their work,
and whether the headlines are good. That is the model's job, guided by
`BRIEF.md`. Read the contact sheet.

## The kit

The kit holds what is the founder's or someone else's, so it stays out of this
public repo. It lives in the product documents at `outreach-films/kit/`:

| Path | What |
| --- | --- |
| `voice/face.mp4`, or `voice/face.part-1.mp4`, `face.part-2.mp4`... | Her voice cut with her face (520x520). Parts under 25 MB each so a cloud run can fetch them; the command joins them. |
| `cues.json` | When each line of her voice starts, in seconds. Belongs to that voice cut. |
| `pointer.svg` | The Mac pointer. |
| `icons/chrome.png`, `terminal.png`, `agentbox.png`, `finder.png` | The ⌘-Tab switcher's icons. |
| `sfx/pad1.wav`...`pad3.wav`, `sfx/key1.wav`... | Trackpad clicks and key presses (CC0, Freesound 383793 and 563505). |

`--no-voice` makes a silent screen check with a grey bubble when the voice is
not on the machine. It is for testing, never for sending.

## A new machine

`sh scripts/outreach-film/setup.sh` installs what is missing: Apple's SF
fonts on Linux, ffmpeg, Python's numpy, Pillow and OpenCV, Playwright, and
the repo's packages. The command says when it is needed.

## How it works

| File | Model | Does |
| --- | --- | --- |
| `research.mjs` | none | Opens their homepage at 1440x810, clears cookie banners, saves the opening shot, their square logo, and the words of up to seven pages as `site.json`. |
| `lib/brief.mjs` | none | Tidies what a script can (spaces, curly quotes) and checks every rule above. |
| `headlines.mjs` | none | Draws each headline on their live page in their own font, and reports whether it wraps like theirs. |
| `lib/assemble.mjs` | none | Builds the film's whole world from the brief. Everything that is the same in every film is fixed here, including what she presses. |
| `demo-hook.mjs`, `vite.film.config.mjs` | none | Builds the app's screen with a door for the film's world. It wraps api.ts's methods by name at build time, so the source is never patched, and a renamed method fails the build by name. |
| `record.mjs` | none | Drives the app with a hand-like pointer, keyed to her words, at a fifth of real speed so every moment is drawn. Each jump between screens holds the picture until the app has finished redrawing, then forces a fresh frame; a slowed app otherwise shows in-between redraws as flashes, and a still screen sends no frame at all. |
| `finish.py` | none | Puts the film back on her voice's clock, adds the clicks and keys, her bubble and voice. |
| `check-film.py` | none | Watches the finished film for flashes and cuts that never land. |
