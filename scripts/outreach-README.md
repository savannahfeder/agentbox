# Personalised outreach replay

Record the approved app sequence once with `recordTemplate` from
`lib/outreach-record.mjs`. Keep the template directory, demo app build,
voice and face cut, masks and sounds with the private outreach assets.
None of those belongs in this public repository.

Each lead supplies the existing `film.json`, homepage, logo and headline
image. Rendering replays saved DOM states and camera positions without
driving the app again. It uses no model. The brief and headline checks
still run before rendering.
The replay is a private demo, not evidence that the company has used Agentbox.
Maya and Jordan each need a title plus comment of at most 70 characters.
Maya's title is at most 36 characters. The renderer rejects longer text
before encoding, because the app otherwise hides the comment.

For a queue, `targets.json` holds `{slug, input, output}` entries. `input`
is the film JSON path and `output` is the next version's MP4 filename.
The batch command renders one lead at a time, overlays the retained voice
and face, checks every frame and the ending audio, and saves review stills.
Failed exports never replace finished files.

```
node scripts/outreach-batch.mjs TEMPLATE targets.json APP_DIST face.mp4 MASKS SOUNDS OUTPUT
```

Set `OUTREACH_PYTHON` to the Python interpreter with NumPy installed.
Set `OUTREACH_COMPOSITOR_PYTHON` if OpenCV is in a different interpreter.
On the cloud machine, set `CHROME=/opt/agentbox/chromium.sh`.
The batch caches app screenshots at the approved recording's resolution,
then composites the pointer and camera. Scroll positions and hover changes
invalidate the cache. No live app actions run during a lead's render.

```
node --experimental-strip-types scripts/outreach-render.mjs TEMPLATE film.json screen.mp4 APP_DIST
python3 scripts/outreach-sounds.py TEMPLATE/manifest.json SOUNDS sfx.wav
python3 scripts/outreach-overlay.py screen.mp4 sfx.wav face.mp4 MASKS final.mp4 97.1
python3 scripts/outreach-check.py final.mp4 face.mp4 REVIEW_DIRECTORY
```

Use `PLAYWRIGHT_MODULE` to point to an installed Playwright module if it
is not in this checkout. Images use the paths in `film.json`, falling back
to its directory when an old machine's path no longer exists. A corrected
headline image needs its explicit path in the JSON.

Before a new export, research the current homepage with the outreach research
tools. Record its exact hero wording and use its language, audience and
typography as the reference for three distinct proposals. Each proposal must
be one clear sentence, not a pair of slogans. Write `creative.headlines` and
`creative.rationale` in the lead JSON. The rationale explains the alternatives
to the viewer; it must not describe our internal writing rules.

```
node --experimental-strip-types scripts/outreach-capture-hero.mts film.json CAPTURE_DIRECTORY
```

This uses an isolated browser to save the actual homepage, six seconds of hero
motion, the original heading and font measurements, and three proposed headings
in that page's existing layout. The proposed headings are frozen only while
making the comparison still. The opening film retains the original page's motion.
`film-ready-v1.json` contains the resulting assets and dated hero reference.
Use a new capture directory for each revision. Bot checks, missing headings,
overflow or an extra line of text fail the capture. Fix at most twice, then
withhold that lead. Never shrink its font or hide content to force a fit.
For a nonstandard hero, run the capture command with `--inspect` first.
Use an explicit `creative.heroSelector`, or `heroTextSelector` with
`headlineLines` whose joined text exactly matches each proposal. An animated
word can use `heroHighlight: {selector, textSelector}`. It retains the word's
decoration and measures its new width inside the original text column.
Never guess which page text to replace. Inspect the resulting picture as well
as its bounds; a container can fit while a nested animated word is wrong.

The export requires the hero reference and all three proposals. Recorded hero
frames are sought explicitly, never autoplayed. Every click is mapped from its
source control to the same control after substitution and layout. A missing,
covered or clipped target stops the export. The caret is measured from the actual
reply text. Company names appear in thread headings, and the opening history is
folded to match the current app's QueueSummary and QueueAnswer view.

Pointer motion is smoothed across the whole replay, with measured click positions
as anchors. A move over 120 CSS pixels per output frame stops the export. The
completed film gets a `.qa.json` sidecar with each click's label and bounds,
the maximum pointer step and the hero reference. These checks detect specific
failures; they cannot certify editorial quality or replace watching the film.

For a review frame, append `--at 7` to the renderer command and use a
`.jpg` output. Review the opening, Home, Team, code, headlines, teammate
reply and ending at full window size before approving an export.

`outreach-prepare.mjs RAW_TEMPLATE TEMPLATE` bridges holds up to 300 ms only
when the content and scroll positions are unchanged. It keeps their times
in the manifest. The renderer rejects capture gaps over 150 ms and a homepage or switcher
remaining after 5.4 seconds. Pointer positions interpolate between samples.
Missing or ambiguous company fields fail the render.
Encoders use two threads. Speech must continue through the end of
“questions”, around 96.3 seconds. Scan completed exports for transient
flashes, inspect logos on the sidebar, and keep all films unsent until
approved.
Review the entire film, especially the app switch, composer, task opening,
typing, comment arrival and ending. Check the original hero, all three proposals
and the company-specific examples against their sources. Keep the final films
as drafts until the owner approves the exact versions. A passing media scan
alone is never approval to send or publish them.
